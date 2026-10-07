// Pricing configuration schema. Every number the engine uses comes from one of
// these objects; the engine itself contains no tariffs.
//
// A range [low, high] expresses real variation in scope (surface types, soiling,
// access, product choice), not a random margin. The engine prices the low end of
// every assumption for the minimum and the high end for the maximum.

import type { AreaRangeId, WorkspaceType } from '../types';

export type Range = readonly [low: number, high: number];

export interface AreaTier {
  /** Upper bound of this tier in m² (Infinity for the last tier). */
  upTo: number;
  /** € per m² per visit, applied marginally (like tax brackets) so price never drops as area grows. */
  ratePerM2: Range;
}

export interface HygieneItem {
  id: string;
  /** Which facility makes the item relevant. */
  requires: 'toilets' | 'kitchen';
  /** Consumption basis: per person per workday, per kitchen per workday or per toilet per month. */
  basis: 'person_day' | 'kitchen_day' | 'toilet_month';
  quantity: Range;
  unit: string;
  unitCost: number;
  /** When scenting covers this zone, the item is provided by the scenting service instead. */
  replacedByScentingZone?: 'toilets';
}

export interface PricingConfig {
  id: string;
  /** Only "approved" configurations may produce public estimates in live mode. */
  status: 'demo' | 'approved';
  label: string;
  currency: 'EUR';
  vat: { rate: number; pricesIncludeVat: boolean };

  /** Average weeks per month (52/12) and workdays per month (52×5/12). */
  weeksPerMonth: number;
  workdaysPerMonth: number;

  /** Approximate area bands offered when the visitor does not know the exact m². */
  areaRanges: Record<AreaRangeId, { min: number; max: number }>;
  /** m² per person, used only to estimate occupancy when it is unknown. */
  occupancyDensity: Record<WorkspaceType, { m2PerPersonLow: number; m2PerPersonHigh: number }>;

  /** Percentage adjustment on labour for specific cities, e.g. { "Tjetër": 0.1 }. */
  locationLabourAdjustment: Record<string, number>;

  cleaning: {
    tiers: AreaTier[];
    kitchenPerVisit: Range;
    toiletPerVisit: Range;
    minimumVisit: number;
    /** Per-visit multiplier by weekly frequency; "lt1" applies below one visit a week. */
    frequencyMultiplier: { lt1: number; 1: number; 2: number; 3: number; 4: number; 5: number };
    outsideHoursSurcharge: number;
    /** Share of visits outside office hours when the visitor chooses both (0.5 = half). Defaults to 0.5. */
    mixedOutsideShare?: number;
    /** Share of the cleaning price that is materials; deducted when the client supplies them. Defaults to 0.1. */
    materialsShare?: number;
    deepClean: { tiers: AreaTier[]; kitchen: Range; toilet: Range; minimum: number };
  };

  hygiene: {
    items: HygieneItem[];
    /** Delivery charge added to each occasional order (recurring supply includes delivery). */
    occasionalDeliveryFee: number;
  };

  scenting: {
    m2PerDevice: number;
    /** Devices per selected zone when coverage is unknown. */
    devicesPerZoneUnknown: Range;
    deviceRentalMonthly: Range;
    refillMonthly: Range;
    installationPerDevice: Range;
  };

  maintenance: {
    preventive: {
      /** One visit per month including this many labour hours. */
      includedHours: number;
      baseMonthly: Range;
      /** Added per started block of extra area beyond baseArea. */
      baseArea: number;
      extraAreaBlock: number;
      extraPerBlock: Range;
    };
    hourlyRate: Range;
    /** On-demand call-out including the first hour of labour; parts excluded. */
    callOut: Range;
  };

  drains: {
    /** Standard mechanical unblocking of an accessible point; camera/excavation excluded. */
    standardIntervention: Range;
  };

  ddd: {
    prevention: {
      /** Treatments per year (4 = quarterly). */
      treatmentsPerYear: number;
      basePerTreatment: Range;
      baseArea: number;
      perM2Beyond: Range;
    };
  };

  bundle: {
    /** Minimum number of distinct recurring services before the discount applies. */
    minRecurringServices: number;
    /** Share of recurring cost. Must be an approved figure; 0 disables it. */
    discount: number;
  };
}
