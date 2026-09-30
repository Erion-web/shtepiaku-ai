// AI-written plan explanation. The model receives only workspace facts, the plan
// scope and approved service descriptions — never prices or contact details —
// and its output is validated before use. Any failure returns null so the client
// keeps the deterministic explanation.

import { SERVICES } from '../shared/catalog';
import { servicesIn } from '../shared/plans';
import type { Arrangement, Lang, PlanConfig, WorkspaceProfile } from '../shared/types';

export interface ExplainFacts {
  lang: Lang;
  workspace: WorkspaceProfile;
  plan: PlanConfig;
  arrangement: Arrangement | null;
}

export interface Explainer {
  explain(facts: ExplainFacts): Promise<string | null>;
}

/** Numbers the explanation may mention: only those present in the visitor's own answers. */
export function allowedNumbers(f: ExplainFacts): Set<string> {
  const nums = new Set<number>([f.workspace.kitchens, f.workspace.toilets, f.workspace.area.min, f.workspace.area.max]);
  if (f.workspace.people.known) nums.add(f.workspace.people.min);
  const c = f.plan.cleaning;
  if (c && typeof c.frequency === 'number') nums.add(c.frequency);
  if (c?.customVisitsPerMonth) nums.add(c.customVisitsPerMonth);
  if (f.plan.ddd?.mode === 'prevention') nums.add(4);
  return new Set([...nums].map(String));
}

// Albanian stems cover inflected forms (garantojmë, kursoni, çmimi…).
const FORBIDDEN = /[€$%]|\b(eur|euro|çmim|cmim|kosto|zbritj|kurs[eiyo]|garan[ct]|certifik|sigurojmë|price|pric|cost|discount|sav(e|ing)|guarant|certif|within \d)/i;

/** Rejects text that mentions money, guarantees, savings or numbers the visitor did not give us. */
export function validateExplanation(text: string, f: ExplainFacts): string | null {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length < 40 || t.length > 520) return null;
  if (FORBIDDEN.test(t)) return null;
  const allowed = allowedNumbers(f);
  for (const m of t.matchAll(/\d+(?:[.,]\d+)?/g)) if (!allowed.has(m[0])) return null;
  return t;
}

const FACILITY_NAMES: Record<WorkspaceProfile['facilities'][number], Record<Lang, string>> = {
  work: { sq: 'hapësira pune', en: 'work areas' },
  meeting: { sq: 'salla takimesh', en: 'meeting rooms' },
  kitchen: { sq: 'kuzhinë', en: 'kitchen' },
  toilets: { sq: 'tualete', en: 'toilets' },
  reception: { sq: 'recepsion', en: 'reception' },
  storage: { sq: 'depo', en: 'storage' },
  outdoor: { sq: 'hapësirë e jashtme', en: 'outdoor space' },
};

export function buildPrompt(f: ExplainFacts): { system: string; user: string } {
  const lang = f.lang === 'sq' ? 'Albanian (standard, polished, formal "ju")' : 'English';
  const services = servicesIn(f.plan).map((s) => ({
    service: SERVICES[s].name[f.lang],
    description: SERVICES[s].approved[f.lang],
    configuration: f.plan[s],
  }));
  const system = [
    `You write a short explanation of an office-care plan for Shtepiaku, a facilities-management company. Write in ${lang}.`,
    'Rules:',
    '- 2 or 3 sentences, at most 60 words, plain prose, no lists, no headings, no emoji.',
    '- Refer only to the services listed in the plan and only to facts in the workspace data.',
    '- Never mention prices, costs, discounts, savings, percentages, guarantees, response times or certifications.',
    '- Do not invent findings, risks or scores about the office. Do not claim to have inspected anything.',
    '- Use only numbers that appear in the workspace data.',
    f.lang === 'sq' ? '- Professional, warm and concrete. Address the visitor formally with "ju".' : '- Professional, warm and concrete. Address the visitor as "you".',
    '- Start from a fact about how the space is used (people, kitchen, toilets, reception), then say how the plan fits it. Do not just list the services.',
    '- Write natural, correct language only; do not mix in words from another language.',
    f.lang === 'sq'
      ? 'Example of the tone: "Me 18 persona që e përdorin zyrën çdo ditë, kuzhina dhe tualetet kërkojnë kujdes të rregullt. Plani juaj kombinon pastrimin me furnizimet higjienike për ta lehtësuar organizimin."'
      : 'Example of the tone: "With 18 people using the office every day, the kitchen and toilets need regular care. Your plan combines cleaning with hygiene supplies to make organising easier."',
    'Return only the explanation text.',
  ].join('\n');
  const user = JSON.stringify(
    {
      workspace: {
        type: f.workspace.type,
        area_m2: f.workspace.area.exact ? f.workspace.area.min : `approximately ${f.workspace.area.min}-${f.workspace.area.max}`,
        people_present_daily: f.workspace.people.known ? f.workspace.people.min : 'unknown',
        facilities: f.workspace.facilities.map((x) => FACILITY_NAMES[x][f.lang]),
        kitchens: f.workspace.kitchens,
        toilets: f.workspace.toilets,
        current_arrangement: f.arrangement ?? 'not stated',
      },
      plan: services,
    },
    null,
    2,
  );
  return { system, user };
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** Groq chat completions (OpenAI-compatible). The key stays on the server. */
export function createGroqExplainer(apiKey: string, model: string, timeoutMs = 8000, fetchImpl: typeof fetch = fetch): Explainer {
  return {
    async explain(f) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const { system, user } = buildPrompt(f);
        const res = await fetchImpl(GROQ_URL, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            temperature: 0.3,
            // gpt-oss models reason before answering; keep reasoning short and out of the reply.
            max_completion_tokens: 1200,
            ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low', include_reasoning: false } : {}),
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        });
        if (!res.ok) {
          console.warn(`[ai] Groq responded ${res.status}`);
          return null;
        }
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = data.choices?.[0]?.message?.content ?? '';
        return validateExplanation(text, f);
      } catch (err) {
        console.warn('[ai] explanation failed:', (err as Error).message);
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
