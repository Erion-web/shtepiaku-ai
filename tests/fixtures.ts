import type { Answers, WorkspaceProfile } from '../shared/types';
import { emptyAnswers } from '../src/state/answers';

export const office = (over: Partial<WorkspaceProfile> = {}): WorkspaceProfile => ({
  type: 'office',
  city: 'Prishtinë',
  area: { min: 220, max: 220, exact: true },
  people: { known: true, min: 18, max: 18 },
  facilities: ['work', 'meeting', 'kitchen', 'toilets', 'reception'],
  kitchens: 1,
  toilets: 2,
  ...over,
});

/** A fully answered questionnaire. */
export function completeAnswers(mut?: (a: Answers) => void): Answers {
  const a = emptyAnswers();
  a.company = { name: 'Dardania Tech', city: 'Prishtinë', workspaceType: 'office' };
  a.space = { areaKnown: true, area: 220, areaRange: null, peopleKnown: true, people: 18 };
  a.facilities = { selected: ['work', 'kitchen', 'toilets', 'reception'], kitchens: 1, toilets: 2 };
  a.priorities = { mode: 'choose', selected: ['cleaning', 'hygiene'], recommendationReviewed: false };
  a.details.cleaning = { frequency: 3, customVisitsPerMonth: null, timing: 'during', materials: 'provider' };
  a.details.hygiene = { mode: 'recurring' };
  a.current = { arrangement: 'several_providers', whoGetsCalled: null };
  mut?.(a);
  return a;
}
