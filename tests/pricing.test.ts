import { describe, expect, it } from 'vitest';
import { estimate, priceDelta, tieredCost, visitsPerMonth } from '../shared/pricing/engine';
import { DEMO_PRICING } from '../shared/pricing/demo';
import { resolvePricing } from '../shared/pricing/registry';
import type { PricingConfig } from '../shared/pricing/config';
import { buildProfile } from '../shared/profile';
import { office, completeAnswers } from './fixtures';

const cfg = DEMO_PRICING;

describe('billing frequency', () => {
  it('converts weekly visits to monthly with 52/12', () => {
    expect(visitsPerMonth(3, undefined, cfg)).toBeCloseTo((3 * 52) / 12, 10);
    expect(visitsPerMonth('custom', 6, cfg)).toBe(6);
  });

  it('prices cleaning as visits/month × per-visit cost', () => {
    const e = estimate(office(), { cleaning: { frequency: 2, timing: 'during' } }, cfg);
    const line = e.lines.find((l) => l.id === 'cleaning')!;
    expect(line.billing).toBe('monthly');
    const visits = (2 * 52) / 12;
    // 220 m²: 100 m² at the first tier + 120 m² at the second, plus 1 kitchen and 2 toilets, × 1.05 for 2/week.
    const low = (100 * 0.15 + 120 * 0.1 + 1 * 3 + 2 * 2) * 1.05;
    expect(line.amount!.min).toBeCloseTo(low * visits, 6);
  });

  it('keeps quarterly DDD billed per treatment and shows a monthly equivalent of one third', () => {
    const e = estimate(office(), { ddd: { mode: 'prevention', issues: [] } }, cfg);
    const l = e.lines.find((x) => x.id === 'ddd_prevention')!;
    expect(l.billing).toBe('quarterly');
    expect(l.monthly!.min).toBeCloseTo(l.amount!.min / 3, 10);
    expect(l.monthly!.max).toBeCloseTo(l.amount!.max / 3, 10);
  });

  it('keeps one-time costs out of the monthly estimate', () => {
    const withInstall = estimate(office(), { scenting: { zones: ['reception'], coverageM2: null } }, cfg);
    const install = withInstall.lines.find((l) => l.id === 'scenting_install')!;
    expect(install.billing).toBe('one_time');
    expect(install.monthly).toBeNull();
    const monthlyLine = withInstall.lines.find((l) => l.id === 'scenting')!;
    expect(withInstall.monthlyRaw).toEqual(monthlyLine.monthly);
    expect(withInstall.oneTime).not.toBeNull();
  });

  it('shows a one-time deep clean as a one-time cost with no monthly figure', () => {
    const e = estimate(office(), { cleaning: { frequency: 'one_time', timing: 'during' } }, cfg);
    expect(e.monthly).toBeNull();
    expect(e.oneTime!.min).toBeGreaterThan(0);
  });

  it('never includes on-demand or unresolved problems in any total', () => {
    const e = estimate(office(), { maintenance: { mode: 'on_demand' }, drains: { mode: 'existing' }, ddd: { mode: 'existing', issues: ['rodents'] } }, cfg);
    expect(e.monthly).toBeNull();
    expect(e.oneTime).toBeNull();
    expect(e.lines.filter((l) => l.billing === 'assessment').map((l) => l.id)).toEqual(['drains_assessment', 'ddd_assessment']);
    expect(e.exclusions).toContain('maintenance_parts');
    expect(e.exclusions).toContain('on_demand_not_included');
  });

  it('rounds the displayed range outward to €5 and never below the raw figures', () => {
    const e = estimate(office(), { cleaning: { frequency: 3, timing: 'outside' }, hygiene: { mode: 'recurring' } }, cfg);
    expect(e.monthly!.min % 5).toBe(0);
    expect(e.monthly!.max % 5).toBe(0);
    expect(e.monthly!.min).toBeLessThanOrEqual(e.monthlyRaw!.min);
    expect(e.monthly!.max).toBeGreaterThanOrEqual(e.monthlyRaw!.max);
  });

  it('is deterministic', () => {
    const plan = { cleaning: { frequency: 3 as const, timing: 'during' as const }, hygiene: { mode: 'recurring' as const } };
    expect(estimate(office(), plan, cfg)).toEqual(estimate(office(), plan, cfg));
  });
});

describe('tiers and minimums', () => {
  it('tiered cost never decreases as area grows', () => {
    let prev = 0;
    for (let a = 10; a <= 3000; a += 10) {
      const c = tieredCost(a, cfg.cleaning.tiers, 0);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it('applies the minimum visit charge to tiny spaces', () => {
    const e = estimate(office({ area: { min: 20, max: 20, exact: true }, kitchens: 0, toilets: 0, facilities: ['work'] }), { cleaning: { frequency: 1, timing: 'during' } }, cfg);
    const l = e.lines.find((x) => x.id === 'cleaning')!;
    expect(l.facts.visitMin).toBe(cfg.cleaning.minimumVisit);
    expect(e.assumptions.some((a) => a.id === 'cleaning_minimum')).toBe(true);
  });

  it('applies an approved location adjustment to labour only', () => {
    const adjusted: PricingConfig = { ...cfg, locationLabourAdjustment: { Prizren: 0.1 } };
    const plan = { cleaning: { frequency: 2 as const, timing: 'during' as const }, hygiene: { mode: 'recurring' as const } };
    const base = estimate(office({ city: 'Prizren' }), plan, cfg);
    const adj = estimate(office({ city: 'Prizren' }), plan, adjusted);
    const c = (e: typeof base) => e.lines.find((l) => l.id === 'cleaning')!.amount!.min;
    const h = (e: typeof base) => e.lines.find((l) => l.id === 'hygiene')!.amount!.min;
    expect(c(adj)).toBeCloseTo(c(base) * 1.1, 6);
    expect(h(adj)).toBe(h(base));
  });
});

describe('unknown area and occupancy', () => {
  it('uses the full area range instead of treating unknown area as exact', () => {
    const answers = completeAnswers((a) => {
      a.space = { areaKnown: false, area: null, areaRange: '250_500', peopleKnown: true, people: 20 };
    });
    const ws = buildProfile(answers, cfg)!;
    expect(ws.area).toEqual({ min: 250, max: 500, exact: false });
    const e = estimate(ws, { cleaning: { frequency: 3, timing: 'during' } }, cfg);
    expect(e.assumptions.find((a) => a.id === 'area_approximate')).toBeTruthy();
    const exactLow = estimate(buildProfile(completeAnswers((a) => (a.space.area = 250)), cfg)!, { cleaning: { frequency: 3, timing: 'during' } }, cfg);
    const exactHigh = estimate(buildProfile(completeAnswers((a) => (a.space.area = 500)), cfg)!, { cleaning: { frequency: 3, timing: 'during' } }, cfg);
    expect(e.monthlyRaw!.min).toBeCloseTo(exactLow.monthlyRaw!.min, 6);
    expect(e.monthlyRaw!.max).toBeCloseTo(exactHigh.monthlyRaw!.max, 6);
  });

  it('estimates unknown occupancy as a range and hides the per-person cost', () => {
    const ws = buildProfile(completeAnswers((a) => (a.space = { ...a.space, peopleKnown: false, people: null })), cfg)!;
    expect(ws.people.known).toBe(false);
    expect(ws.people.max).toBeGreaterThan(ws.people.min);
    const e = estimate(ws, { cleaning: { frequency: 3, timing: 'during' }, hygiene: { mode: 'recurring' } }, cfg);
    expect(e.perPerson).toBeNull();
    expect(e.assumptions.some((a) => a.id === 'people_estimated')).toBe(true);
  });

  it('hides per-person cost and requires assessment for supplies at zero occupancy', () => {
    const ws = office({ people: { known: true, min: 0, max: 0 } });
    const e = estimate(ws, { cleaning: { frequency: 1, timing: 'during' }, hygiene: { mode: 'recurring' } }, cfg);
    expect(e.perPerson).toBeNull();
    expect(e.lines.find((l) => l.service === 'hygiene')!.billing).toBe('assessment');
    expect(Number.isFinite(e.monthly!.min)).toBe(true);
  });

  it('derives the per-person cost from the displayed monthly range', () => {
    const e = estimate(office(), { cleaning: { frequency: 3, timing: 'during' } }, cfg);
    expect(e.perPerson).toEqual({ min: Math.round(e.monthly!.min / 18), max: Math.round(e.monthly!.max / 18) });
  });
});

describe('additions, removals and double counting', () => {
  it('does not charge toilet air freshener in supplies when scenting covers toilets', () => {
    const without = estimate(office(), { hygiene: { mode: 'recurring' } }, cfg);
    const withScent = estimate(office(), { hygiene: { mode: 'recurring' }, scenting: { zones: ['toilets'], coverageM2: null } }, cfg);
    const items = (e: typeof without) => e.lines.find((l) => l.id === 'hygiene')!.facts.items as string[];
    expect(items(without)).toContain('toilet_air_freshener');
    expect(items(withScent)).not.toContain('toilet_air_freshener');
    expect(withScent.assumptions.some((a) => a.id === 'air_freshener_in_scenting')).toBe(true);
  });

  it('adding then removing a service returns exactly to the original estimate', () => {
    const base = { cleaning: { frequency: 3 as const, timing: 'during' as const } };
    const added = { ...base, ddd: { mode: 'prevention' as const, issues: [] } };
    const d = priceDelta(office(), base, added, cfg);
    expect(d.monthly!.min).toBeGreaterThan(0);
    const back = priceDelta(office(), added, base, cfg);
    expect(back.monthly).toEqual({ min: -d.monthly!.min, max: -d.monthly!.max });
  });

  it('reports only a one-time delta for an initial deep clean', () => {
    const base = { cleaning: { frequency: 3 as const, timing: 'during' as const } };
    const d = priceDelta(office(), base, { ...base, initialDeepClean: true }, cfg);
    expect(d.monthly).toBeNull();
    expect(d.oneTime!.min).toBeGreaterThan(0);
  });

  it('applies the bundle discount only from the configured number of recurring services', () => {
    const two = estimate(office(), { cleaning: { frequency: 3, timing: 'during' }, hygiene: { mode: 'recurring' } }, cfg);
    expect(two.lines.some((l) => l.id === 'bundle_discount')).toBe(false);
    const three = estimate(office(), { cleaning: { frequency: 3, timing: 'during' }, hygiene: { mode: 'recurring' }, maintenance: { mode: 'preventive' } }, cfg);
    const disc = three.lines.find((l) => l.id === 'bundle_discount')!;
    const recurring = three.lines.filter((l) => l.billing === 'monthly' || l.billing === 'quarterly').reduce((s, l) => s + l.monthly!.min, 0);
    expect(disc.monthly!.min).toBeCloseTo(-recurring * cfg.bundle.discount, 6);
  });
});

describe('pricing gate', () => {
  it('uses demo pricing in demo mode and refuses live estimates without approved tariffs', () => {
    expect(resolvePricing('demo')!.status).toBe('demo');
    expect(resolvePricing('live')).toBeNull();
    expect(resolvePricing('live', { ...DEMO_PRICING })).toBeNull();
    expect(resolvePricing('live', { ...DEMO_PRICING, status: 'approved' })!.status).toBe('approved');
  });
});
