// Deterministic pricing engine. Pure functions only: the same profile, plan and
// configuration always produce the same estimate. No AI is involved here.
//
// Billing conventions
// - monthly:          billed every month; counted in the monthly estimate.
// - quarterly:        billed per treatment; shown as a monthly equivalent (×treatments/12)
//                     for comparison, with the actual billing frequency kept explicit.
// - one_time:         setup or single jobs; shown separately, never in the monthly figure.
// - per_intervention: a rate per call-out or hour; not included in any total.
// - per_order:        occasional supply orders; indicative per order, not in the monthly figure.
// - assessment:       no approved rule covers it; priced only after an on-site assessment.
// - discount:         approved bundle discount on recurring services.
//
// Weekly services are converted to months with config.weeksPerMonth (52/12).

import type { PricingConfig, Range, AreaTier } from './config';
import type { CleaningFrequency, CleaningMaterials, CleaningTiming, DddIssue, PlanConfig, ServiceId, WorkspaceProfile } from '../types';

export type Billing = 'monthly' | 'quarterly' | 'one_time' | 'per_intervention' | 'per_order' | 'assessment' | 'discount';

export interface Money {
  min: number;
  max: number;
}

export type LineId =
  | 'cleaning'
  | 'deep_clean_once'
  | 'initial_deep_clean'
  | 'hygiene'
  | 'hygiene_order'
  | 'hygiene_assessment'
  | 'scenting'
  | 'scenting_install'
  | 'maintenance'
  | 'maintenance_callout'
  | 'maintenance_hourly'
  | 'drains_intervention'
  | 'drains_assessment'
  | 'ddd_prevention'
  | 'ddd_assessment'
  | 'bundle_discount';

export interface LineItem {
  id: LineId;
  service: ServiceId | 'bundle';
  billing: Billing;
  /** Amount per billing unit (per month, per treatment, per order, per intervention…). null = assessment. */
  amount: Money | null;
  /** Contribution to the monthly estimate. null when the line is not part of it. */
  monthly: Money | null;
  /** Numbers behind the line, for the "how was it calculated" breakdown. */
  facts: Record<string, number | string | string[]>;
}

export type AssumptionId =
  | 'weeks_per_month'
  | 'workdays_per_month'
  | 'area_approximate'
  | 'people_estimated'
  | 'cleaning_tiers'
  | 'cleaning_minimum'
  | 'cleaning_outside_hours'
  | 'cleaning_mixed_hours'
  | 'cleaning_materials_client'
  | 'cleaning_materials_included'
  | 'location_adjustment'
  | 'hygiene_consumption'
  | 'air_freshener_in_scenting'
  | 'scenting_devices_estimated'
  | 'scenting_devices_coverage'
  | 'maintenance_allowance'
  | 'ddd_quarterly'
  | 'bundle_discount'
  | 'vat';

export interface Assumption {
  id: AssumptionId;
  facts: Record<string, number | string>;
}

export type ExclusionId = 'cleaning_materials_client' | 'maintenance_parts' | 'maintenance_extra_hours' | 'drains_camera' | 'ddd_existing' | 'drains_existing' | 'hygiene_cleaning_chemicals' | 'on_demand_not_included';

export interface Estimate {
  pricingId: string;
  pricingStatus: PricingConfig['status'];
  vat: PricingConfig['vat'];
  lines: LineItem[];
  /** Raw monthly sum (unrounded). null when nothing recurring is in the plan. */
  monthlyRaw: Money | null;
  /** Displayed monthly range: minimum rounded down and maximum rounded up to €5. */
  monthly: Money | null;
  monthlyWithVat: Money | null;
  oneTime: Money | null;
  /** Only when occupancy is known and above zero; derived from the displayed monthly range. */
  perPerson: Money | null;
  assumptions: Assumption[];
  exclusions: ExclusionId[];
}

const LOW = 0;
const HIGH = 1;

const add = (a: Money, b: Money): Money => ({ min: a.min + b.min, max: a.max + b.max });
const scale = (a: Money, k: number): Money => ({ min: a.min * k, max: a.max * k });
const range = (r: Range, k = 1): Money => ({ min: r[LOW] * k, max: r[HIGH] * k });
const roundTo = (n: number, step: number, dir: 'down' | 'up') => (dir === 'down' ? Math.floor(n / step) * step : Math.ceil(n / step) * step);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Marginal tiered cost: each band of area is charged at its own rate. */
export function tieredCost(area: number, tiers: AreaTier[], end: typeof LOW | typeof HIGH): number {
  let total = 0;
  let prev = 0;
  for (const tier of tiers) {
    if (area <= prev) break;
    const inTier = Math.min(area, tier.upTo) - prev;
    total += inTier * tier.ratePerM2[end];
    prev = tier.upTo;
  }
  return total;
}

export function visitsPerMonth(frequency: Exclude<CleaningFrequency, 'one_time'>, customVisitsPerMonth: number | undefined, cfg: PricingConfig): number {
  if (frequency === 'custom') return Math.max(0, customVisitsPerMonth ?? 0);
  return frequency * cfg.weeksPerMonth;
}

function frequencyMultiplier(visitsMonth: number, cfg: PricingConfig): number {
  const perWeek = visitsMonth / cfg.weeksPerMonth;
  const m = cfg.cleaning.frequencyMultiplier;
  if (perWeek < 0.95) return m.lt1;
  const bucket = Math.min(5, Math.max(1, Math.round(perWeek))) as 1 | 2 | 3 | 4 | 5;
  return m[bucket];
}

/** Price factor for when cleaning happens; a mix applies the surcharge to the configured share of visits. */
export function timingFactor(timing: CleaningTiming | undefined, cfg: PricingConfig): number {
  const s = cfg.cleaning.outsideHoursSurcharge;
  if (timing === 'outside') return 1 + s;
  if (timing === 'mixed') return 1 + s * (cfg.cleaning.mixedOutsideShare ?? 0.5);
  return 1;
}

/** Price factor for who supplies cleaning materials: the client supplying them removes the materials share. */
export function materialsFactor(materials: CleaningMaterials | undefined, cfg: PricingConfig): number {
  return materials === 'client' ? 1 - (cfg.cleaning.materialsShare ?? 0.1) : 1;
}

function labourAdjustment(ws: WorkspaceProfile, cfg: PricingConfig): number {
  return cfg.locationLabourAdjustment[ws.city] ?? 0;
}

export function estimate(ws: WorkspaceProfile, plan: PlanConfig, cfg: PricingConfig): Estimate {
  const lines: LineItem[] = [];
  const assumptions: Assumption[] = [];
  const exclusions = new Set<ExclusionId>();
  const assume = (id: AssumptionId, facts: Assumption['facts'] = {}) => {
    if (!assumptions.some((a) => a.id === id)) assumptions.push({ id, facts });
  };

  const locAdj = labourAdjustment(ws, cfg);
  if (locAdj !== 0) assume('location_adjustment', { city: ws.city, pct: Math.round(locAdj * 100) });
  if (!ws.area.exact) assume('area_approximate', { min: ws.area.min, max: ws.area.max });

  // ── Cleaning ────────────────────────────────────────────────────────────
  const deepCleanCost = (): Money => {
    const dc = cfg.cleaning.deepClean;
    const surcharge = timingFactor(plan.cleaning?.timing, cfg) * materialsFactor(plan.cleaning?.materials, cfg);
    const at = (end: typeof LOW | typeof HIGH, area: number) =>
      Math.max(dc.minimum, (tieredCost(area, dc.tiers, end) + ws.kitchens * dc.kitchen[end] + ws.toilets * dc.toilet[end]) * surcharge * (1 + locAdj));
    return { min: at(LOW, ws.area.min), max: at(HIGH, ws.area.max) };
  };

  if (plan.cleaning) {
    const c = plan.cleaning;
    if (c.timing === 'outside') assume('cleaning_outside_hours', { pct: Math.round(cfg.cleaning.outsideHoursSurcharge * 100) });
    if (c.materials === 'client') {
      assume('cleaning_materials_client', { pct: Math.round((cfg.cleaning.materialsShare ?? 0.1) * 100) });
      exclusions.add('cleaning_materials_client');
    } else assume('cleaning_materials_included');
    if (c.timing === 'mixed')
      assume('cleaning_mixed_hours', { pct: Math.round(cfg.cleaning.outsideHoursSurcharge * 100), share: Math.round((cfg.cleaning.mixedOutsideShare ?? 0.5) * 100) });

    if (c.frequency === 'one_time') {
      lines.push({ id: 'deep_clean_once', service: 'cleaning', billing: 'one_time', amount: deepCleanCost(), monthly: null, facts: { areaMin: ws.area.min, areaMax: ws.area.max } });
    } else {
      const visits = visitsPerMonth(c.frequency, c.customVisitsPerMonth, cfg);
      const mult = frequencyMultiplier(visits, cfg);
      const surcharge = timingFactor(c.timing, cfg) * materialsFactor(c.materials, cfg);
      const perVisit = (end: typeof LOW | typeof HIGH, area: number) => {
        const areaPart = tieredCost(area, cfg.cleaning.tiers, end);
        const extras = ws.kitchens * cfg.cleaning.kitchenPerVisit[end] + ws.toilets * cfg.cleaning.toiletPerVisit[end];
        const priced = (areaPart + extras) * mult * surcharge * (1 + locAdj);
        return { priced: Math.max(cfg.cleaning.minimumVisit, priced), hitMinimum: priced < cfg.cleaning.minimumVisit };
      };
      const lo = perVisit(LOW, ws.area.min);
      const hi = perVisit(HIGH, ws.area.max);
      const visit = { min: lo.priced, max: hi.priced };
      if (lo.hitMinimum || hi.hitMinimum) assume('cleaning_minimum', { minimum: cfg.cleaning.minimumVisit });
      assume('cleaning_tiers');
      if (c.frequency !== 'custom') assume('weeks_per_month', { weeks: round2(cfg.weeksPerMonth) });
      lines.push({
        id: 'cleaning',
        service: 'cleaning',
        billing: 'monthly',
        amount: scale(visit, visits),
        monthly: scale(visit, visits),
        facts: {
          visitsPerMonth: round2(visits),
          perWeek: c.frequency === 'custom' ? '' : c.frequency,
          visitMin: round2(visit.min),
          visitMax: round2(visit.max),
          multiplier: mult,
          kitchens: ws.kitchens,
          toilets: ws.toilets,
        },
      });
      if (plan.initialDeepClean) {
        lines.push({ id: 'initial_deep_clean', service: 'cleaning', billing: 'one_time', amount: deepCleanCost(), monthly: null, facts: {} });
      }
    }
  }

  // ── Hygiene supplies ─────────────────────────────────────────────────────
  if (plan.hygiene) {
    const scentedToilets = plan.scenting?.zones.includes('toilets') ?? false;
    const items = cfg.hygiene.items.filter((it) => {
      if (it.requires === 'toilets' && ws.toilets === 0) return false;
      if (it.requires === 'kitchen' && ws.kitchens === 0) return false;
      if (it.replacedByScentingZone === 'toilets' && scentedToilets) return false;
      return true;
    });
    if (scentedToilets && ws.toilets > 0) assume('air_freshener_in_scenting');
    if (plan.cleaning?.materials !== 'client') exclusions.add('hygiene_cleaning_chemicals');

    const noOccupancy = ws.people.max === 0;
    if (items.length === 0 || noOccupancy) {
      lines.push({ id: 'hygiene_assessment', service: 'hygiene', billing: 'assessment', amount: null, monthly: null, facts: { reason: noOccupancy ? 'no_occupancy' : 'no_facilities' } });
    } else {
      const days = cfg.workdaysPerMonth;
      let basket: Money = { min: 0, max: 0 };
      for (const it of items) {
        const units: Money =
          it.basis === 'person_day'
            ? { min: it.quantity[LOW] * ws.people.min * days, max: it.quantity[HIGH] * ws.people.max * days }
            : it.basis === 'kitchen_day'
              ? range(it.quantity, ws.kitchens * days)
              : range(it.quantity, ws.toilets);
        basket = add(basket, scale(units, it.unitCost));
      }
      assume('workdays_per_month', { days: round2(days) });
      assume('hygiene_consumption', { peopleMin: ws.people.min, peopleMax: ws.people.max });
      if (plan.hygiene.mode === 'recurring') {
        lines.push({ id: 'hygiene', service: 'hygiene', billing: 'monthly', amount: basket, monthly: basket, facts: { items: items.map((i) => i.id) } });
      } else {
        const order = add(basket, { min: cfg.hygiene.occasionalDeliveryFee, max: cfg.hygiene.occasionalDeliveryFee });
        lines.push({ id: 'hygiene_order', service: 'hygiene', billing: 'per_order', amount: order, monthly: null, facts: { items: items.map((i) => i.id), delivery: cfg.hygiene.occasionalDeliveryFee } });
      }
    }
  }
  if (!ws.people.known && (plan.hygiene || plan.cleaning)) assume('people_estimated', { min: ws.people.min, max: ws.people.max });

  // ── Scenting ─────────────────────────────────────────────────────────────
  if (plan.scenting && plan.scenting.zones.length > 0) {
    const s = cfg.scenting;
    const zones = plan.scenting.zones.length;
    let devices: Money;
    if (plan.scenting.coverageM2 && plan.scenting.coverageM2 > 0) {
      const n = Math.max(zones, Math.ceil(plan.scenting.coverageM2 / s.m2PerDevice));
      devices = { min: n, max: n };
      assume('scenting_devices_coverage', { m2: s.m2PerDevice });
    } else {
      devices = range(s.devicesPerZoneUnknown, zones);
      assume('scenting_devices_estimated', { low: s.devicesPerZoneUnknown[LOW], high: s.devicesPerZoneUnknown[HIGH] });
    }
    const perDevice = add(range(s.deviceRentalMonthly), range(s.refillMonthly));
    const monthly = { min: perDevice.min * devices.min, max: perDevice.max * devices.max };
    lines.push({ id: 'scenting', service: 'scenting', billing: 'monthly', amount: monthly, monthly, facts: { devicesMin: devices.min, devicesMax: devices.max, zones: plan.scenting.zones } });
    lines.push({
      id: 'scenting_install',
      service: 'scenting',
      billing: 'one_time',
      amount: { min: s.installationPerDevice[LOW] * devices.min, max: s.installationPerDevice[HIGH] * devices.max },
      monthly: null,
      facts: { devicesMin: devices.min, devicesMax: devices.max },
    });
  }

  // ── Technical maintenance ────────────────────────────────────────────────
  if (plan.maintenance) {
    const m = cfg.maintenance;
    if (plan.maintenance.mode === 'preventive') {
      const p = m.preventive;
      const blocks = (area: number) => Math.ceil(Math.max(0, area - p.baseArea) / p.extraAreaBlock);
      const monthly = {
        min: (p.baseMonthly[LOW] + blocks(ws.area.min) * p.extraPerBlock[LOW]) * (1 + locAdj),
        max: (p.baseMonthly[HIGH] + blocks(ws.area.max) * p.extraPerBlock[HIGH]) * (1 + locAdj),
      };
      assume('maintenance_allowance', { hours: p.includedHours });
      lines.push({ id: 'maintenance', service: 'maintenance', billing: 'monthly', amount: monthly, monthly, facts: { hours: p.includedHours } });
      exclusions.add('maintenance_extra_hours');
    } else {
      lines.push({ id: 'maintenance_callout', service: 'maintenance', billing: 'per_intervention', amount: scale(range(m.callOut), 1 + locAdj), monthly: null, facts: {} });
      exclusions.add('on_demand_not_included');
    }
    lines.push({ id: 'maintenance_hourly', service: 'maintenance', billing: 'per_intervention', amount: scale(range(m.hourlyRate), 1 + locAdj), monthly: null, facts: {} });
    exclusions.add('maintenance_parts');
  }

  // ── Drain unblocking ─────────────────────────────────────────────────────
  if (plan.drains) {
    if (plan.drains.mode === 'existing') {
      lines.push({ id: 'drains_assessment', service: 'drains', billing: 'assessment', amount: null, monthly: null, facts: {} });
      exclusions.add('drains_existing');
    } else {
      lines.push({ id: 'drains_intervention', service: 'drains', billing: 'per_intervention', amount: range(cfg.drains.standardIntervention), monthly: null, facts: {} });
      exclusions.add('on_demand_not_included');
    }
    exclusions.add('drains_camera');
  }

  // ── ECO PEST DDD ─────────────────────────────────────────────────────────
  if (plan.ddd) {
    if (plan.ddd.mode === 'prevention') {
      const p = cfg.ddd.prevention;
      const perTreatment = {
        min: p.basePerTreatment[LOW] + Math.max(0, ws.area.min - p.baseArea) * p.perM2Beyond[LOW],
        max: p.basePerTreatment[HIGH] + Math.max(0, ws.area.max - p.baseArea) * p.perM2Beyond[HIGH],
      };
      const monthsBetween = 12 / p.treatmentsPerYear;
      assume('ddd_quarterly', { perYear: p.treatmentsPerYear });
      lines.push({
        id: 'ddd_prevention',
        service: 'ddd',
        billing: 'quarterly',
        amount: perTreatment,
        monthly: scale(perTreatment, 1 / monthsBetween),
        facts: { perYear: p.treatmentsPerYear, monthsBetween },
      });
    } else {
      lines.push({ id: 'ddd_assessment', service: 'ddd', billing: 'assessment', amount: null, monthly: null, facts: { issues: plan.ddd.issues as DddIssue[] } });
      exclusions.add('ddd_existing');
    }
  }

  // ── Bundle discount (approved figure only) ───────────────────────────────
  const recurring = lines.filter((l) => l.billing === 'monthly' || l.billing === 'quarterly');
  const recurringServices = new Set(recurring.map((l) => l.service));
  if (cfg.bundle.discount > 0 && recurringServices.size >= cfg.bundle.minRecurringServices) {
    const base = recurring.reduce((acc, l) => add(acc, l.monthly!), { min: 0, max: 0 });
    const d = scale(base, -cfg.bundle.discount);
    lines.push({ id: 'bundle_discount', service: 'bundle', billing: 'discount', amount: d, monthly: d, facts: { pct: Math.round(cfg.bundle.discount * 100), services: recurringServices.size } });
    assume('bundle_discount', { pct: Math.round(cfg.bundle.discount * 100), n: cfg.bundle.minRecurringServices });
  }

  // ── Totals ───────────────────────────────────────────────────────────────
  const monthlyLines = lines.filter((l) => l.monthly);
  const monthlyRaw = recurring.length > 0 ? monthlyLines.reduce((acc, l) => add(acc, l.monthly!), { min: 0, max: 0 }) : null;
  const monthly = monthlyRaw ? { min: roundTo(monthlyRaw.min, 5, 'down'), max: roundTo(monthlyRaw.max, 5, 'up') } : null;

  const oneTimeLines = lines.filter((l) => l.billing === 'one_time');
  const oneTimeRaw = oneTimeLines.length ? oneTimeLines.reduce((acc, l) => add(acc, l.amount!), { min: 0, max: 0 }) : null;
  const oneTime = oneTimeRaw ? { min: roundTo(oneTimeRaw.min, 5, 'down'), max: roundTo(oneTimeRaw.max, 5, 'up') } : null;

  const monthlyWithVat =
    monthly && !cfg.vat.pricesIncludeVat ? { min: Math.round(monthly.min * (1 + cfg.vat.rate)), max: Math.round(monthly.max * (1 + cfg.vat.rate)) } : null;

  const perPerson =
    monthly && ws.people.known && ws.people.min > 0
      ? { min: Math.round(monthly.min / ws.people.min), max: Math.round(monthly.max / ws.people.min) }
      : null;

  assume('vat', { pct: Math.round(cfg.vat.rate * 100), included: cfg.vat.pricesIncludeVat ? 'yes' : 'no' });

  return {
    pricingId: cfg.id,
    pricingStatus: cfg.status,
    vat: cfg.vat,
    lines,
    monthlyRaw,
    monthly,
    monthlyWithVat,
    oneTime,
    perPerson,
    assumptions,
    exclusions: [...exclusions],
  };
}

/** Price change caused by moving from plan A to plan B (e.g. adding one optional service). */
export function priceDelta(ws: WorkspaceProfile, from: PlanConfig, to: PlanConfig, cfg: PricingConfig): { monthly: Money | null; oneTime: Money | null } {
  const a = estimate(ws, from, cfg);
  const b = estimate(ws, to, cfg);
  const diff = (x: Money | null, y: Money | null): Money | null => {
    const d = { min: (y?.min ?? 0) - (x?.min ?? 0), max: (y?.max ?? 0) - (x?.max ?? 0) };
    return Math.round(d.min) === 0 && Math.round(d.max) === 0 ? null : { min: Math.round(d.min), max: Math.round(d.max) };
  };
  const oneTimeRaw = (e: Estimate) => {
    const ls = e.lines.filter((l) => l.billing === 'one_time');
    return ls.length ? ls.reduce((acc, l) => add(acc, l.amount!), { min: 0, max: 0 }) : null;
  };
  return { monthly: diff(a.monthlyRaw, b.monthlyRaw), oneTime: diff(oneTimeRaw(a), oneTimeRaw(b)) };
}
