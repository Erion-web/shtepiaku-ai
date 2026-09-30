// Deterministic plan explanation. Rendered immediately, and used whenever the AI
// explanation is unavailable or fails validation. Mentions no prices.

import type { Arrangement, Lang, PlanConfig, WorkspaceProfile } from './types';
import { servicesIn } from './plans';

export interface ExplainInput {
  lang: Lang;
  ws: WorkspaceProfile;
  plan: PlanConfig;
  arrangement: Arrangement | null;
}

const joinList = (items: string[], lang: Lang) => {
  if (items.length <= 1) return items.join('');
  const and = lang === 'sq' ? ' dhe ' : ' and ';
  return `${items.slice(0, -1).join(', ')}${and}${items[items.length - 1]}`;
};

function frequencyPhrase(plan: PlanConfig, lang: Lang): string {
  const c = plan.cleaning;
  if (!c) return '';
  if (c.frequency === 'one_time') return lang === 'sq' ? 'një pastrim të thellë' : 'a one-time deep clean';
  if (c.frequency === 'custom') {
    const v = c.customVisitsPerMonth ?? 0;
    return lang === 'sq' ? `pastrimin ${v} herë në muaj` : `cleaning ${v} times a month`;
  }
  const f = c.frequency;
  if (lang === 'sq') return f === 1 ? 'pastrimin një herë në javë' : `pastrimin ${f} herë në javë`;
  return f === 1 ? 'weekly cleaning' : `cleaning ${f} times a week`;
}

function servicePhrases(plan: PlanConfig, lang: Lang): string[] {
  const sq = lang === 'sq';
  const out: string[] = [];
  for (const s of servicesIn(plan)) {
    switch (s) {
      case 'cleaning':
        out.push(frequencyPhrase(plan, lang));
        break;
      case 'hygiene':
        out.push(plan.hygiene!.mode === 'recurring' ? (sq ? 'furnizimet higjienike mujore' : 'a monthly hygiene supply') : sq ? 'furnizimet higjienike sipas porosisë' : 'hygiene supplies on order');
        break;
      case 'scenting':
        out.push(sq ? 'aromatizimin e zonave kryesore' : 'scenting in key areas');
        break;
      case 'maintenance':
        out.push(plan.maintenance!.mode === 'preventive' ? (sq ? 'vizitat mujore të mirëmbajtjes' : 'monthly maintenance visits') : sq ? 'mirëmbajtjen sipas nevojës' : 'maintenance on call');
        break;
      case 'drains':
        out.push(sq ? 'debllokimin' : 'drain unblocking');
        break;
      case 'ddd':
        out.push(plan.ddd!.mode === 'prevention' ? (sq ? 'trajtimet parandaluese ECO PEST DDD' : 'preventive ECO PEST DDD treatments') : sq ? 'ndërhyrjen ECO PEST DDD' : 'an ECO PEST DDD intervention');
        break;
    }
  }
  return out;
}

export function deterministicExplanation({ lang, ws, plan, arrangement }: ExplainInput): string {
  const sq = lang === 'sq';
  const sentences: string[] = [];

  const rooms: string[] = [];
  if (ws.kitchens > 0) rooms.push(sq ? (ws.kitchens === 1 ? 'kuzhina' : 'kuzhinat') : ws.kitchens === 1 ? 'the kitchen' : 'the kitchens');
  if (ws.toilets > 0) rooms.push(sq ? 'tualetet' : 'toilets');
  const area = ws.area.exact ? `${ws.area.min} m²` : `${ws.area.min}–${ws.area.max} m²`;

  if (ws.people.known && ws.people.min > 0) {
    sentences.push(
      rooms.length
        ? sq
          ? `Me ${ws.people.min} persona që e përdorin zyrën çdo ditë, ${joinList(rooms, lang)} kërkojnë kujdes të rregullt.`
          : `With ${ws.people.min} people using the office every day, ${joinList(rooms, lang)} need regular care.`
        : sq
          ? `Me ${ws.people.min} persona në ${area}, hapësira kërkon kujdes të rregullt.`
          : `With ${ws.people.min} people in ${area}, the space needs regular care.`,
    );
  } else {
    sentences.push(sq ? `Për një hapësirë prej ${ws.area.exact ? '' : 'rreth '}${area}, plani ndjek atë që na treguat për përdorimin e saj.` : `For a space of ${ws.area.exact ? '' : 'about '}${area}, the plan follows what you told us about how it is used.`);
  }

  const phrases = servicePhrases(plan, lang);
  if (phrases.length === 1) {
    sentences.push(sq ? `Plani juaj përqendrohet te ${phrases[0]}.` : `Your plan focuses on ${phrases[0]}.`);
  } else if (phrases.length > 1) {
    sentences.push(
      sq
        ? `Plani juaj kombinon ${joinList(phrases, lang)}, që organizimi të jetë më i lehtë.`
        : `Your plan combines ${joinList(phrases, lang)}, so there is less to organise.`,
    );
  }

  const needsVisit = plan.drains?.mode === 'existing' || plan.ddd?.mode === 'existing';
  if (needsVisit) {
    sentences.push(sq ? 'Problemet ekzistuese vlerësohen në vend para se të konfirmohet çmimi.' : 'Existing problems are assessed on site before the price is confirmed.');
  } else if (arrangement === 'several_providers' && phrases.length > 1) {
    sentences.push(sq ? 'Në vend të disa furnitorëve, një partner i vetëm koordinon gjithçka.' : 'Instead of several providers, a single partner coordinates everything.');
  }

  return sentences.join(' ');
}
