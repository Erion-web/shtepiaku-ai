// Service eligibility and recommendation rules. No prices here.

import type { Bilingual, PlanConfig, ScentZone, ServiceId, WorkspaceProfile } from './types';
import { SERVICE_ORDER } from './catalog';

const has = (ws: WorkspaceProfile, f: WorkspaceProfile['facilities'][number]) => ws.facilities.includes(f);

/** Whether a service makes sense for this workspace at all. */
export function isEligible(service: ServiceId, ws: WorkspaceProfile): boolean {
  switch (service) {
    case 'hygiene':
    case 'drains':
      return ws.kitchens > 0 || ws.toilets > 0;
    default:
      return true;
  }
}

/**
 * Services proposed when the visitor asks us to recommend. Deliberately selective:
 * each service needs a concrete reason in the workspace answers.
 */
export function recommendServices(ws: WorkspaceProfile): ServiceId[] {
  const out = new Set<ServiceId>(['cleaning']);
  if (ws.kitchens > 0 || ws.toilets > 0) out.add('hygiene');
  if (ws.area.max >= 300 || ws.people.max >= 25) out.add('maintenance');
  if (ws.type === 'warehouse' || ws.type === 'retail' || has(ws, 'storage') || has(ws, 'outdoor')) out.add('ddd');
  if (has(ws, 'reception') || ws.type === 'retail') out.add('scenting');
  return SERVICE_ORDER.filter((s) => out.has(s));
}

export function defaultScentZones(ws: WorkspaceProfile): ScentZone[] {
  const zones: ScentZone[] = [];
  if (has(ws, 'reception')) zones.push('reception');
  if (ws.toilets > 0) zones.push('toilets');
  if (zones.length === 0) zones.push(has(ws, 'meeting') ? 'meeting' : 'work');
  return zones;
}

export function defaultWeeklyFrequency(ws: WorkspaceProfile): 1 | 2 | 3 | 5 {
  const p = ws.people.max;
  if (p <= 8) return 2;
  if (p <= 30) return 3;
  return 5;
}

type ServiceConfigs = Required<Omit<PlanConfig, 'initialDeepClean'>>;

/** Sensible starting configuration when a service is added without detailed answers. */
export function defaultServiceConfig<S extends ServiceId>(service: S, ws: WorkspaceProfile): ServiceConfigs[S] {
  const defaults: ServiceConfigs = {
    cleaning: { frequency: defaultWeeklyFrequency(ws), timing: 'during' },
    hygiene: { mode: 'recurring' },
    scenting: { zones: defaultScentZones(ws), coverageM2: null },
    maintenance: { mode: 'preventive' },
    drains: { mode: 'on_demand' },
    ddd: { mode: 'prevention', issues: [] },
  };
  return defaults[service];
}

const n = (x: number) => String(x);

/** A short, factual reason for a service, based only on the visitor's answers. */
export function serviceReason(service: ServiceId, ws: WorkspaceProfile): Bilingual {
  const people = ws.people.known ? ws.people.min : null;
  const area = ws.area.exact ? `${n(ws.area.min)} m²` : `${n(ws.area.min)}–${n(ws.area.max)} m²`;
  switch (service) {
    case 'cleaning':
      return people
        ? { sq: `${people} persona në ${area} e përdorin hapësirën çdo ditë pune.`, en: `${people} people use ${area} every workday.` }
        : { sq: `Hapësira prej ${area} ka nevojë për kujdes të rregullt.`, en: `A space of ${area} needs regular care.` };
    case 'hygiene': {
      const parts: Bilingual[] = [];
      if (ws.toilets > 0) parts.push({ sq: `${ws.toilets} tualet${ws.toilets === 1 ? '' : 'e'}`, en: `${ws.toilets} toilet${ws.toilets === 1 ? '' : 's'}` });
      if (ws.kitchens > 0) parts.push({ sq: ws.kitchens === 1 ? 'kuzhina' : `${ws.kitchens} kuzhina`, en: ws.kitchens === 1 ? 'the kitchen' : `${ws.kitchens} kitchens` });
      const join = (l: 'sq' | 'en') => parts.map((p) => p[l]).join(l === 'sq' ? ' dhe ' : ' and ');
      return { sq: `Konsumi i përditshëm në ${join('sq')} mbulohet pa porosi të veçanta.`, en: `Daily consumption in ${join('en')} is covered without separate orders.` };
    }
    case 'maintenance':
      return { sq: 'Problemet e vogla teknike trajtohen para se të ndikojnë në punë.', en: 'Small technical issues are handled before they disrupt work.' };
    case 'drains':
      return { sq: 'Kuzhina dhe tualetet kanë pika që mund të bllokohen.', en: 'Kitchens and toilets have points that can block.' };
    case 'scenting':
      return has(ws, 'reception')
        ? { sq: 'Recepsioni është përshtypja e parë për vizitorët.', en: 'Reception is the first impression for visitors.' }
        : { sq: 'Një aromë e qëndrueshme në zonat e përbashkëta.', en: 'A consistent scent in shared areas.' };
    case 'ddd':
      if (ws.type === 'warehouse' || has(ws, 'storage')) return { sq: 'Depot dhe magazinat kërkojnë parandalim të rregullt.', en: 'Storage areas need regular prevention.' };
      if (has(ws, 'outdoor')) return { sq: 'Hapësira e jashtme rrit rrezikun e insekteve dhe brejtësve.', en: 'Outdoor space increases exposure to insects and rodents.' };
      if (ws.kitchens > 0) return { sq: 'Kuzhina është zona ku parandalimi ka më shumë rëndësi.', en: 'The kitchen is where prevention matters most.' };
      return { sq: 'Trajtim parandalues periodik nga ekipi ynë.', en: 'Periodic preventive treatment by our own team.' };
  }
}
