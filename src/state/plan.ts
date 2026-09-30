import { useCallback, useEffect, useMemo } from 'react';
import { buildProfile } from '../../shared/profile';
import { buildTiers, planKey } from '../../shared/plans';
import { estimate } from '../../shared/pricing/engine';
import { DEMO_PRICING } from '../../shared/pricing/demo';
import type { PricingConfig } from '../../shared/pricing/config';
import type { Answers, PlanConfig, PlanTier } from '../../shared/types';
import { useStore } from './store';
import { useConfig } from './config';

/** Area bands and occupancy densities are not tariffs; they come from the active config or the demo defaults. */
export const profileFor = (answers: Answers, pricing: PricingConfig | null) => buildProfile(answers, pricing ?? DEMO_PRICING);

export function usePlanModel() {
  const { state, setResults } = useStore();
  const { pricing } = useConfig();
  const { answers, answersRev, results } = state;

  const ws = useMemo(() => profileFor(answers, pricing), [answers, pricing]);
  const tiers = useMemo(() => (ws ? buildTiers(answers, ws) : null), [answers, ws]);
  const fresh = results.basedOnRev === answersRev && results.plan !== null;

  // Answers changed since the plan was built: rebuild from the selected tier.
  useEffect(() => {
    if (tiers && !fresh) setResults({ plan: tiers[results.tier], basedOnRev: answersRev, customized: false });
  }, [tiers, fresh, results.tier, answersRev, setResults]);

  const plan: PlanConfig | null = fresh ? results.plan : (tiers?.[results.tier] ?? null);
  const est = useMemo(() => (ws && plan && pricing ? estimate(ws, plan, pricing) : null), [ws, plan, pricing]);

  const tierKeys = useMemo(() => (tiers ? { basic: planKey(tiers.basic), recommended: planKey(tiers.recommended), full: planKey(tiers.full) } : null), [tiers]);

  const setTier = useCallback(
    (tier: PlanTier) => {
      if (!tiers) return;
      setResults({ tier, plan: tiers[tier], basedOnRev: answersRev, customized: false });
    },
    [tiers, answersRev, setResults],
  );

  const setPlan = useCallback(
    (next: PlanConfig) => {
      const customized = tierKeys ? planKey(next) !== tierKeys[results.tier] : true;
      setResults({ plan: next, basedOnRev: answersRev, customized });
    },
    [tierKeys, results.tier, answersRev, setResults],
  );

  return { ws, tiers, tierKeys, plan, estimate: est, pricing, tier: results.tier, customized: results.customized, setTier, setPlan };
}
