import { describe, expect, it } from 'vitest';
import { planForBudget, easyProfile } from '../shared/budget';
import { estimate } from '../shared/pricing/engine';
import { DEMO_PRICING } from '../shared/pricing/demo';
import { servicesIn } from '../shared/plans';

const cfg = DEMO_PRICING;

describe('easy mode budget search', () => {
  it('returns a plan whose high end fits the budget when marked within', () => {
    const r = planForBudget({ budget: 200, services: ['cleaning', 'hygiene', 'ddd'], size: 'medium' }, cfg);
    expect(r.best!.fit).toBe('within');
    expect(r.best!.estimate.monthly!.max).toBeLessThanOrEqual(200);
    expect(r.best!.dropped).toEqual([]);
  });

  it('prices options with the normal engine, never separately', () => {
    const r = planForBudget({ budget: 300, services: ['cleaning', 'hygiene'], size: 'small' }, cfg);
    expect(r.best!.estimate).toEqual(estimate(easyProfile('small'), r.best!.plan, cfg));
  });

  it('gives more cleaning as the budget grows', () => {
    const visits = (budget: number) => {
      const c = planForBudget({ budget, services: ['cleaning'], size: 'medium' }, cfg).best!.plan.cleaning!;
      return c.frequency === 'custom' ? c.customVisitsPerMonth! / 4.33 : (c.frequency as number);
    };
    expect(visits(150)).toBeLessThan(visits(400));
    expect(visits(400)).toBeLessThanOrEqual(visits(1000));
  });

  it('keeps chosen services over extra cleaning visits, and drops services only when it must', () => {
    const r = planForBudget({ budget: 100, services: ['cleaning', 'hygiene', 'ddd'], size: 'medium' }, cfg);
    expect(r.best!.dropped.length).toBeGreaterThan(0);
    expect(r.best!.estimate.monthly!.max).toBeLessThanOrEqual(100);
  });

  it('suggests an upgrade that keeps everything in the recommended plan', () => {
    const r = planForBudget({ budget: 200, services: ['cleaning', 'hygiene', 'ddd'], size: 'medium' }, cfg);
    expect(r.upgrade).not.toBeNull();
    expect(r.upgrade!.estimate.monthly!.max).toBeGreaterThan(200);
    for (const s of r.best!.kept) expect(r.upgrade!.kept).toContain(s);
  });

  it('reports when even the cheapest option does not fit', () => {
    const r = planForBudget({ budget: 20, services: ['cleaning'], size: 'medium' }, cfg);
    expect(r.best).toBeNull();
    expect(r.cheapest!.estimate.monthly!.min).toBeGreaterThan(20);
  });

  it('treats call-out-only services as having no monthly fee', () => {
    const r = planForBudget({ budget: 50, services: ['drains'], size: 'small' }, cfg);
    expect(servicesIn(r.best!.plan)).toEqual(['drains']);
    expect(r.best!.estimate.monthly).toBeNull();
  });
});
