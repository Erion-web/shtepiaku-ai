// Chooses which pricing configuration may be used.
//
// Live public estimates require an approved configuration. None has been supplied
// yet, so APPROVED_PRICING is null and live mode shows plans without prices.
// To go live: add an approved config file, set APPROVED_PRICING to it, and run
// with PRICING_MODE=live.

import type { PricingConfig } from './config';
import { DEMO_PRICING } from './demo';

export type PricingMode = 'demo' | 'live';

export const APPROVED_PRICING: PricingConfig | null = null;

export function resolvePricing(mode: PricingMode, approved: PricingConfig | null = APPROVED_PRICING): PricingConfig | null {
  if (mode === 'demo') return DEMO_PRICING;
  return approved && approved.status === 'approved' ? approved : null;
}
