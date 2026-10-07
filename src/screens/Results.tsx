import { useEffect, useId, useMemo } from 'react';
import { ArrowRight, Ban, ChevronDown, Minus, Pencil, Plus } from 'lucide-react';
import { useI18n } from '../i18n';
import { useRouter } from '../lib/router';
import { useStore } from '../state/store';
import { useConfig } from '../state/config';
import { usePlanModel } from '../state/plan';
import { firstIncompleteStep, TOTAL_STEPS } from '../state/answers';
import { Button, PageTitle, cx } from '../components/ui';
import { DeepCleanIcon, SERVICE_ICONS } from '../components/icons';
import { EstimateCard, DemoLabel } from '../components/EstimateCard';
import { Explanation } from '../components/Explanation';
import { configForAdd, lineAmount, lineBasis, scopeText, serviceAmount, withService, withoutService } from '../lib/present';
import { SERVICES, SERVICE_ORDER } from '../../shared/catalog';
import { isEligible, serviceReason } from '../../shared/rules';
import { priceDelta, type Estimate } from '../../shared/pricing/engine';
import { servicesIn } from '../../shared/plans';
import type { CleaningFrequency, PlanConfig, PlanTier, ServiceId, WorkspaceProfile } from '../../shared/types';
import type { PricingConfig } from '../../shared/pricing/config';

const TIERS: PlanTier[] = ['basic', 'recommended', 'full'];

export function Results() {
  const { t } = useI18n();
  const { state, setRequestType } = useStore();
  const { config } = useConfig();
  const { navigate } = useRouter();
  const model = usePlanModel();
  const incomplete = firstIncompleteStep(state.answers);

  useEffect(() => {
    if (incomplete <= TOTAL_STEPS) navigate(state.answers.company.name ? `/plan/${incomplete}` : '/', { replace: true });
  }, [incomplete, navigate, state.answers.company.name]);

  if (incomplete <= TOTAL_STEPS || !model.ws || !model.plan || !model.tiers) return null;
  const { ws, plan, estimate: est, pricing } = model;
  const estimatesEnabled = Boolean(config?.estimatesEnabled && pricing);

  const request = (type: 'offer' | 'visit') => {
    setRequestType(type);
    navigate('/kerkese');
  };

  return (
    <div className="results container">
      <ResultsHeader ws={ws} />

      <div className="results__layout">
        <div className="results__side">
          <div className="results__sticky">
            <div className="card card--estimate">
              <EstimateCard est={est} estimatesEnabled={estimatesEnabled} onOffer={() => request('offer')} onVisit={() => request('visit')} />
            </div>
            {est && <PerUseCard est={est} />}
          </div>
        </div>

        <div className="results__main">
          <Explanation ws={ws} plan={plan} arrangement={state.answers.current.arrangement} />
          <TierPicker model={model} />
          <IncludedServices ws={ws} plan={plan} est={est} pricing={pricing} onChange={model.setPlan} />
          <OptionalServices ws={ws} plan={plan} pricing={pricing} onChange={model.setPlan} />
          {est && est.exclusions.length > 0 && <Exclusions est={est} />}
          {est && <HowCalculated est={est} />}
        </div>
      </div>

      <div className="mobile-cta" role="region" aria-label={t.results.estimateLabel}>
        <div className="mobile-cta__price">
          <span className="mobile-cta__label">{t.results.mobileFrom}</span>
          <MobilePrice est={est} />
        </div>
        <Button onClick={() => request('offer')} iconRight={<ArrowRight size={18} aria-hidden />}>
          {t.contact.typeOffer}
        </Button>
      </div>
    </div>
  );
}

function MobilePrice({ est }: { est: Estimate | null }) {
  const { t, moneyRange } = useI18n();
  if (!est) return <span className="mobile-cta__value">—</span>;
  if (est.monthly)
    return (
      <span className="mobile-cta__value">
        {moneyRange(est.monthly)} <small>{t.results.perMonth}</small>
      </span>
    );
  if (est.oneTime)
    return (
      <span className="mobile-cta__value">
        {moneyRange(est.oneTime)} <small>{t.results.oneTimeSuffix}</small>
      </span>
    );
  return <span className="mobile-cta__value">{t.billing.assessment}</span>;
}

// ── Header with workspace summary ───────────────────────────────────────────
function ResultsHeader({ ws }: { ws: WorkspaceProfile }) {
  const { t, num } = useI18n();
  const { state } = useStore();
  const { navigate } = useRouter();
  const a = state.answers;
  const chips = [
    t.company.types[ws.type].label,
    a.company.city,
    ws.area.exact ? `${num(ws.area.min)} m²` : t.space.ranges[a.space.areaRange!],
    ws.people.known ? t.common.people(ws.people.min) : t.common.peopleApprox(ws.people.min, ws.people.max),
    ws.kitchens ? `${t.facilities.items.kitchen.label} ×${ws.kitchens}` : null,
    ws.toilets ? `${t.facilities.items.toilets.label} ×${ws.toilets}` : null,
  ].filter(Boolean) as string[];

  return (
    <header className="results__head">
      <div>
        <PageTitle className="results__title">{t.results.title(a.company.name.trim())}</PageTitle>
        <ul className="ws-chips" aria-label={t.summary.space}>
          {chips.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
      <Button variant="quiet" icon={<Pencil size={16} aria-hidden />} onClick={() => navigate('/plan/1')}>
        {t.results.editAnswers}
      </Button>
    </header>
  );
}

// ── Tier picker ─────────────────────────────────────────────────────────────
function TierPicker({ model }: { model: ReturnType<typeof usePlanModel> }) {
  const { t, lang } = useI18n();
  const name = useId();
  const keys = model.tierKeys!;
  return (
    <fieldset className="tiers">
      <legend className="section-title">{t.results.tiersTitle}</legend>
      <div className="tiers__track">
        {TIERS.map((tier) => {
          const same = tier !== 'recommended' && keys[tier] === keys.recommended;
          const checked = model.tier === tier;
          const services = servicesIn(model.tiers![tier]);
          return (
            <label key={tier} className={cx('tier', checked && 'is-checked', same && 'is-disabled')}>
              <input className="sr-only" type="radio" name={name} checked={checked} disabled={same} onChange={() => model.setTier(tier)} />
              <span className="tier__name">
                {t.results.tiers[tier].name}
                {checked && model.customized && <span className="tier__badge">{t.results.customized}</span>}
              </span>
              <span className="tier__hint">{same ? t.results.sameAs : t.results.tiers[tier].hint}</span>
              {!same && (
                <span className="tier__services" aria-label={services.map((s) => SERVICES[s].name[lang]).join(', ')}>
                  {services.map((s) => {
                    const I = SERVICE_ICONS[s];
                    return <I key={s} size={16} strokeWidth={1.75} aria-hidden />;
                  })}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// ── Included services ───────────────────────────────────────────────────────
function IncludedServices({
  ws,
  plan,
  est,
  pricing,
  onChange,
}: {
  ws: WorkspaceProfile;
  plan: PlanConfig;
  est: Estimate | null;
  pricing: PricingConfig | null;
  onChange: (p: PlanConfig) => void;
}) {
  const i18n = useI18n();
  const { t, lang, moneyRange } = i18n;
  const services = servicesIn(plan);
  const onlyOne = services.length <= 1;
  const freqId = useId();

  return (
    <section className="card" aria-labelledby="included-title">
      <h2 className="section-title" id="included-title">
        {t.results.included}
      </h2>
      <ul className="svc-list">
        {services.map((s) => {
          const amount = est ? serviceAmount(s, est, t, i18n) : null;
          const I = SERVICE_ICONS[s];
          return (
            <li key={s} className={cx('svc', s === 'ddd' && 'svc--eco')}>
              <span className="svc__icon" aria-hidden>
                <I size={20} strokeWidth={1.75} />
              </span>
              <div className="svc__body">
                <div className="svc__top">
                  <h3 className="svc__name">{SERVICES[s].name[lang]}</h3>
                  {amount && (
                    <p className={cx('svc__amount', amount.tone && `svc__amount--${amount.tone}`)}>
                      {amount.main}
                      {amount.sub && <span className="svc__amount-sub">{amount.sub}</span>}
                    </p>
                  )}
                </div>
                <p className="svc__scope">{scopeText(s, plan, est, t)}</p>
                <p className="svc__reason">{serviceReason(s, ws)[lang]}</p>
                {s === 'cleaning' && plan.cleaning && (
                  <div className="svc__control">
                    <label htmlFor={freqId}>{t.results.frequencyLabel}</label>
                    <div className="select">
                      <select
                        id={freqId}
                        value={String(plan.cleaning.frequency)}
                        onChange={(e) => {
                          const v = e.target.value;
                          const frequency: CleaningFrequency = v === 'one_time' || v === 'custom' ? v : (Number(v) as 1 | 2 | 3 | 4 | 5);
                          const next: PlanConfig = { ...plan, cleaning: { ...plan.cleaning!, frequency } };
                          if (frequency === 'one_time') delete next.initialDeepClean;
                          onChange(next);
                        }}
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {t.details.cleaning.perWeek(n)}
                          </option>
                        ))}
                        {plan.cleaning.frequency === 'custom' && <option value="custom">{t.scope.cleaningCustom(plan.cleaning.customVisitsPerMonth ?? 0)}</option>}
                        <option value="one_time">{t.details.cleaning.oneTime}</option>
                      </select>
                      <ChevronDown size={16} aria-hidden />
                    </div>
                  </div>
                )}
              </div>
              <Button
                variant="quiet"
                className="svc__action"
                icon={<Minus size={16} aria-hidden />}
                onClick={() => onChange(withoutService(plan, s))}
                disabled={onlyOne}
                aria-label={t.results.removeService(SERVICES[s].name[lang])}
                title={onlyOne ? t.results.lastRemoved : undefined}
              >
                {t.results.remove}
              </Button>
            </li>
          );
        })}
        {plan.initialDeepClean && plan.cleaning && plan.cleaning.frequency !== 'one_time' && (
          <li className="svc">
            <span className="svc__icon" aria-hidden>
              <DeepCleanIcon size={20} strokeWidth={1.75} />
            </span>
            <div className="svc__body">
              <div className="svc__top">
                <h3 className="svc__name">{t.services.initialDeepClean.name}</h3>
                {est && (
                  <p className="svc__amount">
                    {(() => {
                      const l = est.lines.find((x) => x.id === 'initial_deep_clean');
                      return l?.amount ? `${moneyRange(l.amount)} ${t.billing.one_time}` : null;
                    })()}
                  </p>
                )}
              </div>
              <p className="svc__scope">{t.services.initialDeepClean.short}</p>
            </div>
            <Button
              variant="quiet"
              className="svc__action"
              icon={<Minus size={16} aria-hidden />}
              onClick={() => onChange({ ...plan, initialDeepClean: false })}
              aria-label={t.results.removeService(t.services.initialDeepClean.name)}
            >
              {t.results.remove}
            </Button>
          </li>
        )}
      </ul>
      {!pricing && <p className="note">{t.results.noEstimate}</p>}
    </section>
  );
}

// ── Optional services with price deltas ─────────────────────────────────────
function OptionalServices({ ws, plan, pricing, onChange }: { ws: WorkspaceProfile; plan: PlanConfig; pricing: PricingConfig | null; onChange: (p: PlanConfig) => void }) {
  const i18n = useI18n();
  const { t, lang, moneyRange } = i18n;
  const { state } = useStore();

  const options = useMemo(() => {
    const list: { key: string; name: string; desc: string; icon: React.ReactNode; next: PlanConfig; eco?: boolean }[] = [];
    if (plan.cleaning && plan.cleaning.frequency !== 'one_time' && !plan.initialDeepClean) {
      list.push({
        key: 'initialDeepClean',
        name: t.services.initialDeepClean.name,
        desc: t.services.initialDeepClean.short,
        icon: <DeepCleanIcon size={20} strokeWidth={1.75} />,
        next: { ...plan, initialDeepClean: true },
      });
    }
    for (const s of SERVICE_ORDER as ServiceId[]) {
      if (plan[s] || !isEligible(s, ws)) continue;
      const I = SERVICE_ICONS[s];
      list.push({
        key: s,
        name: SERVICES[s].name[lang],
        desc: serviceReason(s, ws)[lang],
        icon: <I size={20} strokeWidth={1.75} />,
        next: withService(plan, s, configForAdd(s, state.answers, ws)),
        eco: s === 'ddd',
      });
    }
    return list;
  }, [plan, ws, lang, t, state.answers]);

  const deltaText = (next: PlanConfig) => {
    if (!pricing) return null;
    const d = priceDelta(ws, plan, next, pricing);
    const parts: string[] = [];
    if (d.monthly) parts.push(t.results.deltaMonthly(moneyRange(d.monthly, { signed: true })));
    if (d.oneTime) parts.push(t.results.deltaOneTime(moneyRange(d.oneTime, { signed: true })));
    if (parts.length) return parts.join(' · ');
    const added = servicesIn(next).find((s) => !plan[s]);
    const cfg = added ? next[added] : undefined;
    if (cfg && 'mode' in cfg && (cfg.mode === 'existing')) return t.results.deltaAssessment;
    if (cfg && 'mode' in cfg && (cfg.mode === 'on_demand')) return t.results.deltaPerUse;
    return t.results.deltaNone;
  };

  return (
    <section className="card" aria-labelledby="optional-title">
      <h2 className="section-title" id="optional-title">
        {t.results.optional}
      </h2>
      {options.length === 0 ? (
        <p className="muted">{t.results.optionalEmpty}</p>
      ) : (
        <ul className="svc-list">
          {options.map((o) => (
            <li key={o.key} className={cx('svc svc--optional', o.eco && 'svc--eco')}>
              <span className="svc__icon" aria-hidden>
                {o.icon}
              </span>
              <div className="svc__body">
                <div className="svc__top">
                  <h3 className="svc__name">{o.name}</h3>
                  {pricing && <p className="svc__delta">{deltaText(o.next)}</p>}
                </div>
                <p className="svc__reason">{o.desc}</p>
              </div>
              <Button variant="secondary" className="svc__action" icon={<Plus size={16} aria-hidden />} onClick={() => onChange(o.next)} aria-label={t.results.addService(o.name)}>
                {t.results.add}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Pay-per-use rates ───────────────────────────────────────────────────────
function PerUseCard({ est }: { est: Estimate }) {
  const i18n = useI18n();
  const { t } = i18n;
  const lines = est.lines.filter((l) => l.billing === 'per_intervention' || l.billing === 'per_order');
  if (!lines.length) return null;
  return (
    <section className="card card--quiet peruse" aria-labelledby="peruse-title">
      <h2 className="peruse__title" id="peruse-title">
        {t.results.perUse}
      </h2>
      <ul>
        {lines.map((l) => (
          <li key={l.id}>
            <span>{t.lines[l.id]}</span>
            <strong>{lineAmount(l, t, i18n)}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Exclusions ──────────────────────────────────────────────────────────────
function Exclusions({ est }: { est: Estimate }) {
  const { t } = useI18n();
  return (
    <section className="card card--quiet" aria-labelledby="excl-title">
      <h2 className="section-title" id="excl-title">
        {t.results.excluded}
      </h2>
      <ul className="excl">
        {est.exclusions.map((x) => (
          <li key={x}>
            <Ban size={16} aria-hidden />
            <span>{t.exclusions[x]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── How it was calculated ───────────────────────────────────────────────────
function HowCalculated({ est }: { est: Estimate }) {
  const i18n = useI18n();
  const { t, moneyRange, money, num } = i18n;
  const a = (id: string) => est.assumptions.find((x) => x.id === id)?.facts ?? {};
  const assumptionText = (id: (typeof est.assumptions)[number]['id']): string => {
    const f = a(id);
    const A = t.assumptions;
    switch (id) {
      case 'weeks_per_month':
        return A.weeks_per_month(num(f.weeks as number, 2));
      case 'workdays_per_month':
        return A.workdays_per_month(num(f.days as number, 2));
      case 'area_approximate':
        return A.area_approximate(num(f.min as number), num(f.max as number));
      case 'people_estimated':
        return A.people_estimated(f.min as number, f.max as number);
      case 'cleaning_minimum':
        return A.cleaning_minimum(money(f.minimum as number));
      case 'cleaning_materials_client':
        return A.cleaning_materials_client(f.pct as number);
      case 'cleaning_mixed_hours':
        return A.cleaning_mixed_hours(f.pct as number, f.share as number);
      case 'cleaning_outside_hours':
        return A.cleaning_outside_hours(f.pct as number);
      case 'location_adjustment':
        return A.location_adjustment(f.city as string, f.pct as number);
      case 'scenting_devices_estimated':
        return A.scenting_devices_estimated(f.low as number, f.high as number);
      case 'scenting_devices_coverage':
        return A.scenting_devices_coverage(f.m2 as number);
      case 'maintenance_allowance':
        return A.maintenance_allowance(f.hours as number);
      case 'ddd_quarterly':
        return A.ddd_quarterly(f.perYear as number);
      case 'bundle_discount':
        return A.bundle_discount(f.pct as number, f.n as number);
      case 'vat':
        return A.vat(f.pct as number, f.included === 'yes');
      default:
        return A[id] as string;
    }
  };

  return (
    <details className="card how">
      <summary className="how__summary">
        <span className="section-title">{t.results.how}</span>
        <ChevronDown size={20} aria-hidden className="how__chev" />
      </summary>
      <div className="how__body">
        <p className="muted">{t.results.howIntro}</p>
        {est.pricingStatus === 'demo' && <DemoLabel />}
        <h3 className="how__h">{t.results.breakdown}</h3>
        <div className="table-wrap">
          <table className="breakdown">
            <thead>
              <tr>
                <th scope="col">{t.results.col.item}</th>
                <th scope="col">{t.results.col.basis}</th>
                <th scope="col" className="num">
                  {t.results.col.amount}
                </th>
              </tr>
            </thead>
            <tbody>
              {est.lines.map((l) => (
                <tr key={l.id} className={cx(l.billing === 'discount' && 'is-discount', !l.monthly && 'is-outside')}>
                  <th scope="row">{t.lines[l.id]}</th>
                  <td>{lineBasis(l, t, i18n)}</td>
                  <td className="num">
                    {lineAmount(l, t, i18n)}
                    {l.billing === 'quarterly' && l.monthly && <span className="breakdown__eq">{t.billing.quarterlyEq(moneyRange(l.monthly))}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            {est.monthly && (
              <tfoot>
                <tr>
                  <th scope="row" colSpan={2}>
                    {t.results.monthlyTotal}
                  </th>
                  <td className="num">
                    {moneyRange(est.monthly)} {t.results.perMonth}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <h3 className="how__h">{t.results.assumptions}</h3>
        <ul className="assumptions">
          {est.assumptions.map((x) => (
            <li key={x.id}>{assumptionText(x.id)}</li>
          ))}
        </ul>
        <p className="how__version">{t.results.pricingVersion(est.pricingId)}</p>
      </div>
    </details>
  );
}
