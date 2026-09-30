import type { PricingConfig } from './pricing/config';
import type { Answers, WorkspaceProfile } from './types';

/**
 * Turns questionnaire answers into the normalised profile the rules and the engine use.
 * Unknown values stay flagged as unknown and become explicit ranges — never a guessed exact value.
 * Returns null when the answers are not complete enough to describe the space.
 */
export function buildProfile(answers: Answers, cfg: Pick<PricingConfig, 'areaRanges' | 'occupancyDensity'>): WorkspaceProfile | null {
  const { company, space, facilities } = answers;
  if (!company.workspaceType) return null;

  let area: WorkspaceProfile['area'];
  if (space.areaKnown && space.area && space.area > 0) {
    area = { min: space.area, max: space.area, exact: true };
  } else if (!space.areaKnown && space.areaRange) {
    const r = cfg.areaRanges[space.areaRange];
    area = { min: r.min, max: r.max, exact: false };
  } else {
    return null;
  }

  let people: WorkspaceProfile['people'];
  if (space.peopleKnown && space.people !== null && space.people >= 0) {
    people = { known: true, min: space.people, max: space.people };
  } else {
    const d = cfg.occupancyDensity[company.workspaceType];
    people = {
      known: false,
      min: Math.max(1, Math.floor(area.min / d.m2PerPersonHigh)),
      max: Math.max(1, Math.ceil(area.max / d.m2PerPersonLow)),
    };
  }

  const has = (f: 'kitchen' | 'toilets') => facilities.selected.includes(f);
  return {
    type: company.workspaceType,
    city: company.city,
    area,
    people,
    facilities: [...facilities.selected],
    kitchens: has('kitchen') ? Math.max(1, facilities.kitchens) : 0,
    toilets: has('toilets') ? Math.max(1, facilities.toilets) : 0,
  };
}
