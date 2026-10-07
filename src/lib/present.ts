// Turns engine output into display strings. No calculations happen here beyond summing
// lines the engine already produced.

import type { Estimate, LineItem, Money } from '../../shared/pricing/engine';
import type { Answers, PlanConfig, ServiceId, WorkspaceProfile } from '../../shared/types';
import { defaultServiceConfig } from '../../shared/rules';
import type { Dict } from '../i18n/sq';

type Fmt = { money: (n: number) => string; moneyRange: (r: Money, o?: { signed?: boolean }) => string; num: (n: number, d?: number) => string };

export function scopeText(service: ServiceId, plan: PlanConfig, est: Estimate | null, t: Dict): string {
  switch (service) {
    case 'cleaning': {
      const c = plan.cleaning!;
      const by = c.materials === 'client' ? ` · ${t.scope.materialsClient}` : ` · ${t.scope.materialsProvider}`;
      if (c.frequency === 'one_time') return t.scope.cleaningOnce + by;
      const f = c.frequency === 'custom' ? t.scope.cleaningCustom(c.customVisitsPerMonth ?? 0) : t.details.cleaning.perWeek(c.frequency);
      return t.scope.cleaning(f, c.timing === 'outside' ? t.scope.outsideShort : c.timing === 'mixed' ? t.scope.mixedShort : t.scope.duringShort) + by;
    }
    case 'hygiene':
      return plan.hygiene!.mode === 'recurring' ? t.scope.hygieneRecurring : t.scope.hygieneOccasional;
    case 'scenting': {
      const zones = plan.scenting!.zones.map((z) => t.details.scenting.zoneItems[z]).join(', ');
      const line = est?.lines.find((l) => l.id === 'scenting');
      return line ? t.scope.scenting(zones, t.scope.devices(line.facts.devicesMin as number, line.facts.devicesMax as number)) : zones;
    }
    case 'maintenance':
      if (plan.maintenance!.mode === 'on_demand') return t.scope.maintenanceOnDemand;
      const hours = est?.lines.find((l) => l.id === 'maintenance')?.facts.hours;
      return typeof hours === 'number' ? t.scope.maintenancePreventive(hours) : t.details.maintenance.preventiveHint;
    case 'drains':
      return plan.drains!.mode === 'existing' ? t.scope.drainsExisting : t.scope.drainsOnDemand;
    case 'ddd': {
      const d = plan.ddd!;
      if (d.mode === 'prevention') {
        const months = est?.lines.find((l) => l.id === 'ddd_prevention')?.facts.monthsBetween;
        return typeof months === 'number' ? t.scope.dddPrevention(months) : t.details.ddd.preventionHint;
      }
      return t.scope.dddExisting(d.issues.map((i) => t.details.ddd.issueItems[i]).join(', '));
    }
  }
}

/** Main price display for one service row in the plan. */
export function serviceAmount(service: ServiceId, est: Estimate, t: Dict, f: Fmt): { main: string; sub?: string; tone?: 'assess' | 'use' } | null {
  const lines = est.lines.filter((l) => l.service === service && l.id !== 'initial_deep_clean');
  if (!lines.length) return null;
  const sum = (ls: LineItem[], key: 'amount' | 'monthly') => ls.reduce<Money>((a, l) => ({ min: a.min + (l[key]?.min ?? 0), max: a.max + (l[key]?.max ?? 0) }), { min: 0, max: 0 });

  const monthly = lines.filter((l) => l.billing === 'monthly');
  const quarterly = lines.filter((l) => l.billing === 'quarterly');
  const oneTime = lines.filter((l) => l.billing === 'one_time');
  const perUse = lines.filter((l) => l.billing === 'per_intervention');
  const perOrder = lines.filter((l) => l.billing === 'per_order');
  const assess = lines.filter((l) => l.billing === 'assessment');

  const extra = oneTime.length ? `+ ${f.moneyRange(sum(oneTime, 'amount'))} ${t.billing.one_time}` : undefined;
  if (monthly.length) return { main: `${f.moneyRange(sum(monthly, 'monthly'))} ${t.results.perMonth}`, sub: extra };
  if (quarterly.length) return { main: `${f.moneyRange(sum(quarterly, 'amount'))} ${t.billing.quarterly}`, sub: t.billing.quarterlyEq(f.moneyRange(sum(quarterly, 'monthly'))) };
  if (perOrder.length) return { main: `${f.moneyRange(sum(perOrder, 'amount'))} ${t.billing.per_order}` };
  if (oneTime.length) return { main: `${f.moneyRange(sum(oneTime, 'amount'))} ${t.billing.one_time}` };
  if (perUse.length) {
    const first = perUse.find((l) => l.id !== 'maintenance_hourly') ?? perUse[0];
    return { main: `${f.moneyRange(first.amount!)} ${first.id === 'maintenance_hourly' ? t.billing.per_hour : t.billing.per_intervention}`, tone: 'use' };
  }
  if (assess.length) return { main: t.billing.assessment, tone: 'assess' };
  return null;
}

export function lineBasis(l: LineItem, t: Dict, f: Fmt): string {
  const b = t.lineBasis;
  const devices = () => t.scope.devices(l.facts.devicesMin as number, l.facts.devicesMax as number);
  switch (l.id) {
    case 'cleaning':
      return b.cleaning(f.num(l.facts.visitsPerMonth as number, 1), f.moneyRange({ min: l.facts.visitMin as number, max: l.facts.visitMax as number }));
    case 'hygiene':
      return b.hygiene((l.facts.items as string[]).length);
    case 'hygiene_order':
      return b.hygiene_order(f.money(l.facts.delivery as number));
    case 'hygiene_assessment':
      return l.facts.reason === 'no_occupancy' ? b.hygiene_assessment_no_occupancy : b.hygiene_assessment_no_facilities;
    case 'scenting':
      return b.scenting(devices());
    case 'scenting_install':
      return b.scenting_install(devices());
    case 'maintenance':
      return b.maintenance(l.facts.hours as number);
    case 'ddd_prevention':
      return b.ddd_prevention(l.facts.perYear as number);
    case 'bundle_discount':
      return b.bundle_discount(l.facts.pct as number, l.facts.services as number);
    default:
      return b[l.id];
  }
}

export function lineAmount(l: LineItem, t: Dict, f: Fmt): string {
  if (!l.amount) return t.billing.assessment;
  const unit = l.id === 'maintenance_hourly' ? t.billing.per_hour : t.billing[l.billing];
  return `${f.moneyRange(l.amount)} ${unit}`;
}

/** Configuration used when a visitor adds a service on the results page. Reuses their earlier answers when present. */
export function configForAdd(service: ServiceId, answers: Answers, ws: WorkspaceProfile): NonNullable<PlanConfig[ServiceId]> {
  const d = answers.details;
  switch (service) {
    case 'cleaning':
      return d.cleaning.frequency && d.cleaning.frequency !== 'custom'
        ? { frequency: d.cleaning.frequency, timing: d.cleaning.timing ?? 'during', materials: d.cleaning.materials ?? 'provider' }
        : defaultServiceConfig('cleaning', ws);
    case 'hygiene':
      return d.hygiene.mode ? { mode: d.hygiene.mode } : defaultServiceConfig('hygiene', ws);
    case 'scenting':
      return d.scenting.zones.length ? { zones: [...d.scenting.zones], coverageM2: d.scenting.coverageKnown ? d.scenting.coverageM2 : null } : defaultServiceConfig('scenting', ws);
    case 'maintenance':
      return d.maintenance.mode ? { mode: d.maintenance.mode } : defaultServiceConfig('maintenance', ws);
    case 'drains':
      return d.drains.mode ? { mode: d.drains.mode } : defaultServiceConfig('drains', ws);
    case 'ddd':
      return d.ddd.mode ? { mode: d.ddd.mode, issues: [...d.ddd.issues] } : defaultServiceConfig('ddd', ws);
  }
}

export function withService(plan: PlanConfig, service: ServiceId, cfg: NonNullable<PlanConfig[ServiceId]>): PlanConfig {
  return { ...plan, [service]: cfg };
}

export function withoutService(plan: PlanConfig, service: ServiceId): PlanConfig {
  const next = { ...plan };
  delete next[service];
  if (service === 'cleaning') delete next.initialDeepClean;
  return next;
}
