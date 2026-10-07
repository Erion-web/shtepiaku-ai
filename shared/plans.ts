// Builds the three plan tiers from the answers. No prices here.

import type { Answers, PlanConfig, PlanTier, ServiceId, WorkspaceProfile } from './types';
import { defaultServiceConfig, isEligible, recommendServices } from './rules';

/** The plan exactly as the visitor configured it in the questionnaire. */
export function planFromAnswers(answers: Answers, ws: WorkspaceProfile): PlanConfig {
  const d = answers.details;
  const plan: PlanConfig = {};
  for (const s of answers.priorities.selected) {
    if (!isEligible(s, ws)) continue;
    switch (s) {
      case 'cleaning':
        plan.cleaning = {
          frequency: d.cleaning.frequency ?? defaultServiceConfig('cleaning', ws).frequency,
          customVisitsPerMonth: d.cleaning.customVisitsPerMonth ?? undefined,
          timing: d.cleaning.timing ?? 'during',
          materials: d.cleaning.materials ?? 'provider',
        };
        if (plan.cleaning.frequency === 'custom' && !plan.cleaning.customVisitsPerMonth) plan.cleaning.frequency = defaultServiceConfig('cleaning', ws).frequency;
        break;
      case 'hygiene':
        plan.hygiene = { mode: d.hygiene.mode ?? 'recurring' };
        break;
      case 'scenting':
        plan.scenting = {
          zones: d.scenting.zones.length ? [...d.scenting.zones] : defaultServiceConfig('scenting', ws).zones,
          coverageM2: d.scenting.coverageKnown ? d.scenting.coverageM2 : null,
        };
        break;
      case 'maintenance':
        plan.maintenance = { mode: d.maintenance.mode ?? 'preventive' };
        break;
      case 'drains':
        plan.drains = { mode: d.drains.mode ?? 'on_demand' };
        break;
      case 'ddd':
        plan.ddd = { mode: d.ddd.mode ?? 'prevention', issues: [...d.ddd.issues] };
        break;
    }
  }
  return plan;
}

const stepDown = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 3 } as const;

/** Essentials only: lighter cleaning rhythm, supplies, and everything else on demand. */
export function basicPlan(recommended: PlanConfig): PlanConfig {
  const p: PlanConfig = {};
  if (recommended.cleaning) {
    const c = recommended.cleaning;
    p.cleaning = typeof c.frequency === 'number' ? { ...c, frequency: stepDown[c.frequency] } : { ...c };
  }
  if (recommended.hygiene) p.hygiene = { ...recommended.hygiene };
  if (recommended.maintenance) p.maintenance = { mode: 'on_demand' };
  if (recommended.drains) p.drains = { ...recommended.drains };
  // An existing pest problem still needs attention; routine prevention is left out.
  if (recommended.ddd?.mode === 'existing') p.ddd = { ...recommended.ddd, issues: [...recommended.ddd.issues] };
  return p;
}

/** Full planned care: adds only services that the rules find relevant for this workspace. */
export function fullPlan(recommended: PlanConfig, ws: WorkspaceProfile): PlanConfig {
  const p: PlanConfig = structuredClone(recommended);
  const relevant = new Set<ServiceId>(recommendServices(ws));
  if (ws.kitchens > 0) relevant.add('ddd');
  if (ws.kitchens > 0 || ws.toilets > 0) relevant.add('drains');

  if (!p.cleaning) p.cleaning = defaultServiceConfig('cleaning', ws);
  if (p.cleaning.frequency !== 'one_time') p.initialDeepClean = true;
  if (relevant.has('hygiene') && !p.hygiene) p.hygiene = defaultServiceConfig('hygiene', ws);
  if (p.hygiene && p.hygiene.mode === 'occasional') p.hygiene = { mode: 'recurring' };
  if (relevant.has('scenting') && !p.scenting) p.scenting = defaultServiceConfig('scenting', ws);
  if (!p.maintenance || p.maintenance.mode === 'on_demand') p.maintenance = { mode: 'preventive' };
  if (relevant.has('drains') && !p.drains && isEligible('drains', ws)) p.drains = defaultServiceConfig('drains', ws);
  if (relevant.has('ddd') && !p.ddd) p.ddd = defaultServiceConfig('ddd', ws);
  return p;
}

export function buildTiers(answers: Answers, ws: WorkspaceProfile): Record<PlanTier, PlanConfig> {
  const recommended = planFromAnswers(answers, ws);
  return { basic: basicPlan(recommended), recommended, full: fullPlan(recommended, ws) };
}

/** Canonical form so two plans with the same scope compare equal. */
export function planKey(plan: PlanConfig): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return [...v].map(norm).sort();
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v)
          .filter(([, x]) => x !== undefined && x !== false)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, x]) => [k, norm(x)]),
      );
    return v;
  };
  return JSON.stringify(norm(plan));
}

export function servicesIn(plan: PlanConfig): ServiceId[] {
  return (['cleaning', 'maintenance', 'drains', 'hygiene', 'scenting', 'ddd'] as ServiceId[]).filter((s) => plan[s] !== undefined);
}
