import type { Answers, ServiceId } from '../../shared/types';

export const TOTAL_STEPS = 6;

export function emptyAnswers(): Answers {
  return {
    company: { name: '', city: '', workspaceType: null },
    space: { areaKnown: true, area: null, areaRange: null, peopleKnown: true, people: null },
    facilities: { selected: [], kitchens: 1, toilets: 1 },
    priorities: { mode: 'choose', selected: [], recommendationReviewed: false },
    details: {
      cleaning: { frequency: null, customVisitsPerMonth: null, timing: null },
      hygiene: { mode: null },
      scenting: { zones: [], coverageKnown: false, coverageM2: null },
      maintenance: { mode: null },
      drains: { mode: null },
      ddd: { mode: null, issues: [] },
    },
    current: { arrangement: null, whoGetsCalled: null },
  };
}

/** Error keys per field; empty object means the step is complete. */
export type StepErrors = Record<string, string>;

export function validateStep(step: number, a: Answers): StepErrors {
  const e: StepErrors = {};
  switch (step) {
    case 1:
      if (!a.company.name.trim()) e.name = 'company.errors.name';
      if (!a.company.city.trim()) e.city = 'company.errors.city';
      if (!a.company.workspaceType) e.type = 'company.errors.type';
      break;
    case 2:
      if (a.space.areaKnown && !(a.space.area && a.space.area > 0)) e.area = 'space.errors.area';
      if (!a.space.areaKnown && !a.space.areaRange) e.area = 'space.errors.range';
      if (a.space.peopleKnown && (a.space.people === null || a.space.people < 0)) e.people = 'space.errors.people';
      break;
    case 3:
      if (a.facilities.selected.length === 0) e.facilities = 'facilities.errors.none';
      break;
    case 4:
      if (a.priorities.selected.length === 0) e.services = 'priorities.errors.none';
      else if (a.priorities.mode === 'recommend' && !a.priorities.recommendationReviewed) e.services = 'priorities.errors.review';
      break;
    case 5: {
      const d = a.details;
      const has = (s: ServiceId) => a.priorities.selected.includes(s);
      if (has('cleaning')) {
        if (!d.cleaning.frequency) e.frequency = 'details.errors.frequency';
        if (d.cleaning.frequency === 'custom' && !(d.cleaning.customVisitsPerMonth && d.cleaning.customVisitsPerMonth >= 1 && d.cleaning.customVisitsPerMonth <= 31))
          e.custom = 'details.errors.custom';
        if (!d.cleaning.timing) e.timing = 'details.errors.timing';
      }
      if (has('hygiene') && !d.hygiene.mode) e.hygiene = 'details.errors.mode';
      if (has('scenting')) {
        if (d.scenting.zones.length === 0) e.zones = 'details.errors.zones';
        if (d.scenting.coverageKnown && !(d.scenting.coverageM2 && d.scenting.coverageM2 > 0)) e.coverage = 'details.errors.coverage';
      }
      if (has('maintenance') && !d.maintenance.mode) e.maintenance = 'details.errors.mode';
      if (has('drains') && !d.drains.mode) e.drains = 'details.errors.mode';
      if (has('ddd')) {
        if (!d.ddd.mode) e.ddd = 'details.errors.mode';
        if (d.ddd.mode === 'existing' && d.ddd.issues.length === 0) e.issues = 'details.errors.issues';
      }
      break;
    }
    case 6:
      if (!a.current.arrangement) e.arrangement = 'current.errors.arrangement';
      break;
  }
  return e;
}

/** First step (1-based) whose answers are incomplete, or TOTAL_STEPS + 1 when all are done. */
export function firstIncompleteStep(a: Answers): number {
  for (let s = 1; s <= TOTAL_STEPS; s++) if (Object.keys(validateStep(s, a)).length) return s;
  return TOTAL_STEPS + 1;
}

/** Resolve an error key like "company.errors.name" against the dictionary. */
export function resolveKey(dict: unknown, key: string): string {
  const v = key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), dict);
  return typeof v === 'string' ? v : key;
}
