// Decides whether the active pricing may be shown publicly.
//
// The active pricing is the latest version saved by staff on the dashboard's
// "Çmimet" page (or DEMO_PRICING until anyone has saved one). Its status is
// either "demo" (shown with the "Çmime demonstruese" label, leads stored as demo)
// or "approved" (real Shtepiaku prices, leads stored as real).
//
// PRICING_MODE=live is a safety switch: the public site then never shows demo
// prices — plans are shown without prices until an approved version exists.

import type { PricingConfig } from './config';

export type PricingMode = 'demo' | 'live';

export function resolvePricing(mode: PricingMode, active: PricingConfig): PricingConfig | null {
  if (mode === 'demo') return active;
  return active.status === 'approved' ? active : null;
}
