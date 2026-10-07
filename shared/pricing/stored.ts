// Pricing as it travels over the network and sits in the database.
//
// JSON cannot hold Infinity, so the open-ended last area band is stored as
// `upTo: null`. Every edited configuration is validated here before it can be
// saved or used — on the server for saving, in the browser for inline errors.

import { z } from 'zod';
import type { PricingConfig, Range } from './config';

/** Same shape as PricingConfig, with the last band's `upTo` as null instead of Infinity. */
export type StoredPricing = Omit<PricingConfig, 'cleaning'> & {
  cleaning: Omit<PricingConfig['cleaning'], 'tiers' | 'deepClean'> & {
    tiers: { upTo: number | null; ratePerM2: Range }[];
    deepClean: Omit<PricingConfig['cleaning']['deepClean'], 'tiers'> & { tiers: { upTo: number | null; ratePerM2: Range }[] };
  };
};

const tiersToJson = (t: PricingConfig['cleaning']['tiers']) => t.map((x) => ({ upTo: Number.isFinite(x.upTo) ? x.upTo : null, ratePerM2: x.ratePerM2 }));
const tiersFromJson = (t: { upTo: number | null; ratePerM2: Range }[]) => t.map((x) => ({ upTo: x.upTo === null ? Infinity : x.upTo, ratePerM2: x.ratePerM2 }));

export function toStored(cfg: PricingConfig): StoredPricing {
  const c = structuredClone(cfg) as unknown as StoredPricing;
  c.cleaning.tiers = tiersToJson(cfg.cleaning.tiers);
  c.cleaning.deepClean.tiers = tiersToJson(cfg.cleaning.deepClean.tiers);
  return c;
}

export function fromStored(s: StoredPricing): PricingConfig {
  const c = structuredClone(s) as unknown as PricingConfig;
  c.cleaning.tiers = tiersFromJson(s.cleaning.tiers);
  c.cleaning.deepClean.tiers = tiersFromJson(s.cleaning.deepClean.tiers);
  return c;
}

// ── Validation ──────────────────────────────────────────────────────────────

const MAX_EUR = 100_000;
const money = z.number().min(0).max(MAX_EUR);
const range = (max = MAX_EUR) =>
  z
    .tuple([z.number().min(0).max(max), z.number().min(0).max(max)])
    .refine(([lo, hi]) => lo <= hi, { message: 'low_above_high' });
const share = (max: number) => z.number().min(0).max(max);
const factor = z.number().min(0.5).max(2);

const tiers = z
  .array(z.object({ upTo: z.number().positive().nullable(), ratePerM2: range(1000) }))
  .min(1)
  .max(10)
  .superRefine((t, ctx) => {
    t.forEach((tier, i) => {
      const last = i === t.length - 1;
      if (last && tier.upTo !== null) ctx.addIssue({ code: 'custom', path: [i, 'upTo'], message: 'last_band_open' });
      if (!last && tier.upTo === null) ctx.addIssue({ code: 'custom', path: [i, 'upTo'], message: 'band_needs_limit' });
      const prev = i > 0 ? t[i - 1].upTo : 0;
      if (tier.upTo !== null && prev !== null && tier.upTo <= prev) ctx.addIssue({ code: 'custom', path: [i, 'upTo'], message: 'bands_ascending' });
    });
  });

const areaBand = z.object({ min: z.number().positive(), max: z.number().positive() }).refine((r) => r.min < r.max, { message: 'low_above_high' });
const density = z
  .object({ m2PerPersonLow: z.number().positive().max(1000), m2PerPersonHigh: z.number().positive().max(1000) })
  .refine((d) => d.m2PerPersonLow <= d.m2PerPersonHigh, { message: 'low_above_high' });

export const storedPricingSchema = z.object({
  id: z.string().max(60),
  status: z.enum(['demo', 'approved']),
  label: z.string().max(120),
  currency: z.literal('EUR'),
  vat: z.object({ rate: share(0.5), pricesIncludeVat: z.boolean() }),
  weeksPerMonth: z.number().min(4).max(4.5),
  workdaysPerMonth: z.number().min(15).max(25),
  areaRanges: z.object({ lt100: areaBand, '100_250': areaBand, '250_500': areaBand, '500_1000': areaBand, '1000_2000': areaBand, '2000_4000': areaBand }),
  occupancyDensity: z.object({ office: density, coworking: density, retail: density, warehouse: density, other: density }),
  locationLabourAdjustment: z.record(z.string().max(80), z.number().min(-0.5).max(1)),
  cleaning: z.object({
    tiers,
    kitchenPerVisit: range(),
    toiletPerVisit: range(),
    minimumVisit: money,
    frequencyMultiplier: z.object({ lt1: factor, 1: factor, 2: factor, 3: factor, 4: factor, 5: factor }),
    outsideHoursSurcharge: share(1),
    deepClean: z.object({ tiers, kitchen: range(), toilet: range(), minimum: money }),
  }),
  hygiene: z.object({
    items: z
      .array(
        z.object({
          id: z.string().max(60),
          requires: z.enum(['toilets', 'kitchen']),
          basis: z.enum(['person_day', 'kitchen_day', 'toilet_month']),
          quantity: range(1000),
          unit: z.string().max(30),
          unitCost: money,
          replacedByScentingZone: z.literal('toilets').optional(),
        }),
      )
      .max(30),
    occasionalDeliveryFee: money,
  }),
  scenting: z.object({
    m2PerDevice: z.number().positive().max(10_000),
    devicesPerZoneUnknown: range(20),
    deviceRentalMonthly: range(),
    refillMonthly: range(),
    installationPerDevice: range(),
  }),
  maintenance: z.object({
    preventive: z.object({
      includedHours: z.number().min(0).max(200),
      baseMonthly: range(),
      baseArea: z.number().positive().max(100_000),
      extraAreaBlock: z.number().positive().max(100_000),
      extraPerBlock: range(),
    }),
    hourlyRate: range(),
    callOut: range(),
  }),
  drains: z.object({ standardIntervention: range() }),
  ddd: z.object({
    prevention: z.object({
      treatmentsPerYear: z.number().int().min(1).max(52),
      basePerTreatment: range(),
      baseArea: z.number().positive().max(100_000),
      perM2Beyond: range(1000),
    }),
  }),
  bundle: z.object({ minRecurringServices: z.number().int().min(1).max(6), discount: share(0.5) }),
});

export interface PricingIssue {
  /** Dot path to the field, e.g. "cleaning.tiers.0.ratePerM2". */
  path: string;
  message: string;
}

export function validateStoredPricing(input: unknown): { ok: true; value: StoredPricing } | { ok: false; issues: PricingIssue[] } {
  const r = storedPricingSchema.safeParse(input);
  if (r.success) return { ok: true, value: r.data as StoredPricing };
  return { ok: false, issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
}
