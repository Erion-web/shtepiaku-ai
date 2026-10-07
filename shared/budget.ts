// Easy mode: "I have €X a month — what can I get?"
//
// Deterministic search over plan variants priced by the normal engine. It never
// invents prices: every option is an ordinary estimate, and an option only counts
// as "within budget" when even the HIGH end of its monthly range fits.

import type { PricingConfig } from './pricing/config';
import { estimate, visitsPerMonth, type Estimate } from './pricing/engine';
import { defaultScentZones, isEligible } from './rules';
import type { PlanConfig, ServiceId, WorkspaceProfile } from './types';

export type EasySize = 'small' | 'medium' | 'large' | 'xl';

export interface BudgetInput {
  /** Monthly budget in euros, excluding VAT. */
  budget: number;
  services: ServiceId[];
  size: EasySize;
}

export type Fit = 'within' | 'maybe' | 'over';

export interface BudgetOption {
  plan: PlanConfig;
  estimate: Estimate;
  /** Services from the visitor's selection that this option includes. */
  kept: ServiceId[];
  /** Services from the selection left out to fit the budget. */
  dropped: ServiceId[];
  fit: Fit;
  score: number;
}

export interface BudgetResult {
  profile: WorkspaceProfile;
  /** Best option inside the budget (or possibly inside it), null when nothing comes close. */
  best: BudgetOption | null;
  /** The next richer option above the budget, to show what a bit more would add. */
  upgrade: BudgetOption | null;
  /** Cheapest option including all chosen services, shown when the budget is too low for anything. */
  cheapest: BudgetOption | null;
}

/**
 * Typical offices offered as one-tap size choices. They are assumptions the
 * visitor sees on screen and corrects in the full questionnaire afterwards.
 */
export const EASY_SIZES: Record<EasySize, { area: number; people: number; kitchens: number; toilets: number }> = {
  small: { area: 80, people: 8, kitchens: 1, toilets: 1 },
  medium: { area: 200, people: 18, kitchens: 1, toilets: 2 },
  large: { area: 450, people: 40, kitchens: 1, toilets: 4 },
  xl: { area: 900, people: 80, kitchens: 2, toilets: 8 },
};

export function easyProfile(size: EasySize): WorkspaceProfile {
  const t = EASY_SIZES[size];
  return {
    type: 'office',
    city: '',
    area: { min: t.area, max: t.area, exact: true },
    people: { known: true, min: t.people, max: t.people },
    facilities: ['work', 'kitchen', 'toilets'],
    kitchens: t.kitchens,
    toilets: t.toilets,
  };
}

/** Cleaning rhythms tried, richest first. "custom 2" = every other week. */
const CLEANING_OPTIONS: PlanConfig['cleaning'][] = [
  { frequency: 5, timing: 'during', materials: 'provider' },
  { frequency: 4, timing: 'during', materials: 'provider' },
  { frequency: 3, timing: 'during', materials: 'provider' },
  { frequency: 2, timing: 'during', materials: 'provider' },
  { frequency: 1, timing: 'during', materials: 'provider' },
  { frequency: 'custom', customVisitsPerMonth: 2, timing: 'during', materials: 'provider' },
];

// Keeping a chosen service always outweighs extra cleaning visits (at most ~22 a month).
const KEPT_WEIGHT = 100;

export function planForBudget(input: BudgetInput, cfg: PricingConfig): BudgetResult {
  const ws = easyProfile(input.size);
  const chosen = input.services.filter((s) => isEligible(s, ws));

  // Each chosen service has a few variants; `null` = left out.
  const variants: { service: ServiceId; options: (Partial<PlanConfig> | null)[] }[] = chosen.map((s) => {
    switch (s) {
      case 'cleaning':
        return { service: s, options: [...CLEANING_OPTIONS.map((c) => ({ cleaning: c })), null] };
      case 'hygiene':
        return { service: s, options: [{ hygiene: { mode: 'recurring' } }, null] };
      case 'ddd':
        return { service: s, options: [{ ddd: { mode: 'prevention', issues: [] } }, null] };
      case 'scenting':
        return { service: s, options: [{ scenting: { zones: defaultScentZones(ws), coverageM2: null } }, null] };
      case 'maintenance':
        // Help-when-needed has no monthly fee, so maintenance is never fully dropped.
        return { service: s, options: [{ maintenance: { mode: 'preventive' } }, { maintenance: { mode: 'on_demand' } }] };
      case 'drains':
        return { service: s, options: [{ drains: { mode: 'on_demand' } }] };
    }
  });

  const options: BudgetOption[] = [];
  const walk = (i: number, plan: PlanConfig) => {
    if (i === variants.length) {
      const kept = chosen.filter((s) => plan[s] !== undefined);
      if (kept.length === 0) return;
      const est = estimate(ws, plan, cfg);
      const monthly = est.monthly ?? { min: 0, max: 0 };
      // Within = even the high end fits. Maybe = the middle of the range fits.
      const fit: Fit = monthly.max <= input.budget ? 'within' : (monthly.min + monthly.max) / 2 <= input.budget ? 'maybe' : 'over';
      let score = kept.length * KEPT_WEIGHT;
      if (plan.cleaning && plan.cleaning.frequency !== 'one_time') score += visitsPerMonth(plan.cleaning.frequency, plan.cleaning.customVisitsPerMonth, cfg);
      if (plan.maintenance?.mode === 'preventive') score += KEPT_WEIGHT / 2;
      options.push({ plan, estimate: est, kept, dropped: chosen.filter((s) => !kept.includes(s)), fit, score });
      return;
    }
    for (const v of variants[i].options) walk(i + 1, v ? { ...plan, ...v } : plan);
  };
  walk(0, {});

  const price = (o: BudgetOption) => o.estimate.monthly?.max ?? 0;
  const byValue = (a: BudgetOption, b: BudgetOption) => b.score - a.score || price(a) - price(b);

  const within = options.filter((o) => o.fit === 'within').sort(byValue);
  const maybe = options.filter((o) => o.fit === 'maybe').sort(byValue);
  // Prefer a sure fit; take a "maybe" only when it keeps more of what the visitor chose.
  let best = within[0] ?? maybe[0] ?? null;
  if (within[0] && maybe[0] && maybe[0].kept.length > within[0].kept.length) best = maybe[0];

  const upgrade =
    options
      // An upgrade keeps everything the best option has, and adds to it.
      .filter((o) => (best ? o.score > best.score && price(o) > input.budget && best.kept.every((k) => o.kept.includes(k)) : false))
      .sort((a, b) => price(a) - price(b) || b.score - a.score)[0] ?? null;

  const full = options.filter((o) => o.dropped.length === 0).sort((a, b) => price(a) - price(b));
  return { profile: ws, best, upgrade, cheapest: full[0] ?? null };
}
