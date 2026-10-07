import { describe, expect, it } from 'vitest';
import { recommendServices, isEligible } from '../shared/rules';
import { buildTiers, planKey, servicesIn } from '../shared/plans';
import { deterministicExplanation } from '../shared/explain';
import { buildProfile } from '../shared/profile';
import { DEMO_PRICING } from '../shared/pricing/demo';
import { firstIncompleteStep, validateStep } from '../src/state/answers';
import { toggleShift } from '../src/screens/Questionnaire';
import { office, completeAnswers } from './fixtures';

describe('recommendations', () => {
  it('proposes a selective set, not every service', () => {
    const rec = recommendServices(office({ facilities: ['work', 'kitchen', 'toilets'], area: { min: 120, max: 120, exact: true }, people: { known: true, min: 10, max: 10 } }));
    expect(rec).toEqual(['cleaning', 'hygiene']);
  });

  it('adds services only with a concrete reason in the answers', () => {
    const rec = recommendServices(office({ type: 'warehouse', facilities: ['storage', 'toilets'], kitchens: 0 }));
    expect(rec).toContain('ddd');
    expect(rec).not.toContain('scenting');
  });

  it('marks supplies and drains ineligible without kitchen or toilets', () => {
    const ws = office({ facilities: ['work'], kitchens: 0, toilets: 0 });
    expect(isEligible('hygiene', ws)).toBe(false);
    expect(isEligible('drains', ws)).toBe(false);
  });
});

describe('plan tiers', () => {
  const answers = completeAnswers();
  const ws = buildProfile(answers, DEMO_PRICING)!;
  const tiers = buildTiers(answers, ws);

  it('recommended matches the visitor’s own selection', () => {
    expect(servicesIn(tiers.recommended)).toEqual(['cleaning', 'hygiene']);
    expect(tiers.recommended.cleaning!.frequency).toBe(3);
  });

  it('basic lowers the cleaning rhythm and keeps essentials', () => {
    expect(tiers.basic.cleaning!.frequency).toBe(2);
    expect(servicesIn(tiers.basic)).toEqual(['cleaning', 'hygiene']);
  });

  it('full adds only relevant services', () => {
    const full = servicesIn(tiers.full);
    expect(full).toContain('maintenance');
    expect(full).toContain('scenting'); // has reception
    expect(tiers.full.initialDeepClean).toBe(true);
    const noKitchen = completeAnswers((a) => (a.facilities = { selected: ['work'], kitchens: 1, toilets: 1 }));
    const ws2 = buildProfile(noKitchen, DEMO_PRICING)!;
    const full2 = buildTiers(noKitchen, ws2).full;
    expect(servicesIn(full2)).not.toContain('drains');
    expect(servicesIn(full2)).not.toContain('hygiene');
  });

  it('plan keys are order-independent', () => {
    expect(planKey({ hygiene: { mode: 'recurring' }, cleaning: { frequency: 2, timing: 'during' } })).toBe(planKey({ cleaning: { timing: 'during', frequency: 2 }, hygiene: { mode: 'recurring' } }));
  });
});

describe('questionnaire validation', () => {
  it('asks only for details of selected services', () => {
    const a = completeAnswers();
    expect(validateStep(5, a)).toEqual({});
    a.priorities.selected.push('ddd');
    expect(Object.keys(validateStep(5, a))).toEqual(['ddd']);
    a.details.ddd.mode = 'existing';
    expect(Object.keys(validateStep(5, a))).toEqual(['issues']);
  });

  it('requires review of recommended services before continuing', () => {
    const a = completeAnswers((x) => (x.priorities = { mode: 'recommend', selected: ['cleaning'], recommendationReviewed: false }));
    expect(firstIncompleteStep(a)).toBe(4);
    a.priorities.recommendationReviewed = true;
    expect(firstIncompleteStep(a)).toBe(7);
  });

  it('accepts “unknown” area only together with a range', () => {
    const a = completeAnswers((x) => (x.space = { ...x.space, areaKnown: false, areaRange: null }));
    expect(validateStep(2, a)).toHaveProperty('area');
    a.space.areaRange = 'lt100';
    expect(validateStep(2, a)).toEqual({});
  });

  it('accepts zero people as a known answer', () => {
    const a = completeAnswers((x) => (x.space.people = 0));
    expect(validateStep(2, a)).toEqual({});
  });
});

describe('cleaning shifts', () => {
  it('treats both shifts checked as a combination, not a single choice', () => {
    expect(toggleShift(null, 'during')).toBe('during');
    expect(toggleShift('during', 'outside')).toBe('mixed');
    expect(toggleShift('mixed', 'during')).toBe('outside');
    expect(toggleShift('outside', 'outside')).toBeNull();
  });
});

describe('deterministic explanation', () => {
  it('mentions no prices and reflects the plan', () => {
    const text = deterministicExplanation({ lang: 'sq', ws: office(), plan: { cleaning: { frequency: 3, timing: 'during' }, hygiene: { mode: 'recurring' } }, arrangement: 'several_providers' });
    expect(text).toContain('18 persona');
    expect(text).toContain('3 herë në javë');
    expect(text).not.toMatch(/€|\d+%/);
  });
});
