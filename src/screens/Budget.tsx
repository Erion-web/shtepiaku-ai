// Easy mode: budget-first entry. The visitor sets a monthly budget, picks
// services and an office size, and immediately sees the best plan that fits.

import { useId, useMemo, useState } from 'react';
import { ArrowRight, Ban, CircleCheck, CircleAlert, ListChecks, Plus } from 'lucide-react';
import { useI18n } from '../i18n';
import { useRouter } from '../lib/router';
import { useStore } from '../state/store';
import { useConfig } from '../state/config';
import { Button, Chip, ChoiceGroup, PageTitle, cx } from '../components/ui';
import { SERVICE_ICONS } from '../components/icons';
import { DemoLabel } from '../components/EstimateCard';
import { scopeText } from '../lib/present';
import { SERVICES, SERVICE_ORDER } from '../../shared/catalog';
import { EASY_SIZES, planForBudget, type BudgetOption, type EasySize } from '../../shared/budget';
import { servicesIn } from '../../shared/plans';
import type { Answers, ServiceId } from '../../shared/types';

const BUDGET_PRESETS = [100, 150, 200, 300, 500, 800];
const SIZES: EasySize[] = ['small', 'medium', 'large', 'xl'];

/** Writes the chosen option into the questionnaire so the full flow starts pre-filled. */
export function applyEasyPlan(a: Answers, budget: number, size: EasySize, option: BudgetOption) {
  const t = EASY_SIZES[size];
  const p = option.plan;
  a.space = { areaKnown: true, area: t.area, areaRange: null, peopleKnown: true, people: t.people };
  a.facilities = { selected: ['work', 'kitchen', 'toilets'], kitchens: t.kitchens, toilets: t.toilets };
  a.priorities = { mode: 'choose', selected: servicesIn(p), recommendationReviewed: false };
  if (p.cleaning)
    a.details.cleaning = {
      frequency: p.cleaning.frequency,
      customVisitsPerMonth: p.cleaning.customVisitsPerMonth ?? null,
      timing: p.cleaning.timing,
      materials: p.cleaning.materials ?? 'provider',
    };
  if (p.hygiene) a.details.hygiene = { mode: p.hygiene.mode };
  if (p.scenting) a.details.scenting = { zones: [...p.scenting.zones], coverageKnown: false, coverageM2: null };
  if (p.maintenance) a.details.maintenance = { mode: p.maintenance.mode };
  if (p.drains) a.details.drains = { mode: p.drains.mode };
  if (p.ddd) a.details.ddd = { mode: p.ddd.mode, issues: [...p.ddd.issues] };
  a.budget = budget;
}

export function Budget() {
  const { t, lang, moneyRange, money } = useI18n();
  const { state, updateAnswers, reachStep } = useStore();
  const { pricing } = useConfig();
  const { navigate } = useRouter();
  const ids = useId();
  const E = t.easy;

  const [budgetText, setBudgetText] = useState(() => String(state.answers.budget ?? 200));
  const [services, setServices] = useState<ServiceId[]>(() => (state.answers.priorities.selected.length ? state.answers.priorities.selected : ['cleaning', 'hygiene']));
  const [size, setSize] = useState<EasySize>('medium');

  const budget = Math.max(0, Math.min(100_000, Number(budgetText.replace(/[^\d]/g, '')) || 0));
  const result = useMemo(() => (pricing && services.length && budget > 0 ? planForBudget({ budget, services, size }, pricing) : null), [pricing, services, budget, size]);
  const option = result?.best ?? null;
  const toggle = (s: ServiceId) => setServices((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]));

  const proceed = () => {
    if (!option) return;
    updateAnswers((a) => applyEasyPlan(a, budget, size, option));
    reachStep(1);
    navigate('/plan/1');
  };

  const assumption = EASY_SIZES[size];

  return (
    <div className="easy container">
      <header className="easy__head">
        <p className="eyebrow">{E.eyebrow}</p>
        <PageTitle className="results__title">{E.title}</PageTitle>
        <p className="q__sub">{E.sub}</p>
      </header>

      <div className="easy__layout">
        <div className="card easy__inputs">
          <div className="stack-2">
            <label className="field__label" htmlFor={`${ids}-budget`}>
              {E.budget}
            </label>
            <div className="budget-input">
              <span aria-hidden>€</span>
              <input
                id={`${ids}-budget`}
                inputMode="numeric"
                value={budgetText}
                aria-describedby={`${ids}-budget-hint`}
                onChange={(e) => setBudgetText(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
              />
              <span className="budget-input__unit">{E.perMonth}</span>
            </div>
            <p className="field__hint" id={`${ids}-budget-hint`}>
              {E.budgetHint}
            </p>
            <div className="presets" role="group" aria-label={t.space.presets}>
              {BUDGET_PRESETS.map((b) => (
                <button type="button" key={b} className={cx('preset', budget === b && 'is-checked')} aria-pressed={budget === b} onClick={() => setBudgetText(String(b))}>
                  {money(b)}
                </button>
              ))}
            </div>
          </div>

          <ChoiceGroup legend={E.services} hint={E.servicesHint}>
            {SERVICE_ORDER.map((s) => {
              const I = SERVICE_ICONS[s];
              return (
                <Chip key={s} type="checkbox" name={`${ids}-svc`} checked={services.includes(s)} onChange={() => toggle(s)}>
                  <span className="chip__label">
                    <I size={16} strokeWidth={1.75} aria-hidden />
                    {SERVICES[s].name[lang]}
                  </span>
                </Chip>
              );
            })}
          </ChoiceGroup>

          <ChoiceGroup legend={E.size}>
            {SIZES.map((z) => (
              <Chip key={z} name={`${ids}-size`} checked={size === z} onChange={() => setSize(z)}>
                <span className="chip__label">
                  {E.sizes[z].name}
                  <span className="chip__sub">{E.sizes[z].desc}</span>
                </span>
              </Chip>
            ))}
          </ChoiceGroup>
        </div>

        <section id="easy-result" className="card card--estimate easy__result" aria-live="polite" aria-labelledby={`${ids}-result`}>
          {pricing?.status === 'demo' && <DemoLabel compact />}
          <h2 className="section-title" id={`${ids}-result`}>
            {E.resultTitle(money(budget))}
          </h2>

          {!pricing ? (
            <p>{E.noPrices}</p>
          ) : services.length === 0 ? (
            <p className="muted">{E.pickService}</p>
          ) : option ? (
            <OptionView option={option} />
          ) : (
            <div className="easy__low">
              <p className="easy__fit easy__fit--over">
                <CircleAlert size={18} aria-hidden /> {E.tooLow}
              </p>
              {result?.cheapest?.estimate.monthly && <p className="easy__cheapest">{E.cheapest(moneyRange(result.cheapest.estimate.monthly))}</p>}
              <p className="muted">{E.tooLowHint}</p>
            </div>
          )}

          {option && result?.upgrade && (
            <div className="easy__upgrade">
              <p className="easy__upgrade-title">
                <Plus size={16} aria-hidden /> {E.upgrade(moneyRange(result.upgrade.estimate.monthly ?? { min: 0, max: 0 }))}
              </p>
              <ul>
                {servicesIn(result.upgrade.plan)
                  .filter((s) => JSON.stringify(result.upgrade!.plan[s]) !== JSON.stringify(option.plan[s]))
                  .map((s) => (
                    <li key={s}>
                      <strong>{SERVICES[s].name[lang]}</strong> · {scopeText(s, result.upgrade!.plan, result.upgrade!.estimate, t)}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {pricing && services.length > 0 && <p className="note">{E.assumption(assumption.area, assumption.people, assumption.kitchens, assumption.toilets)}</p>}

          <div className="estimate__actions">
            <Button size="lg" block iconRight={<ArrowRight size={18} aria-hidden />} onClick={proceed} disabled={!option}>
              {E.continue}
            </Button>
            <Button variant="secondary" block icon={<ListChecks size={18} aria-hidden />} onClick={() => navigate('/plan/1')}>
              {E.stepByStep}
            </Button>
          </div>
        </section>
      </div>

      {option && (
        <div className="mobile-cta" role="region" aria-label={E.estimate}>
          <div className="mobile-cta__price">
            <span className="mobile-cta__label">{option.fit === 'within' ? E.within : E.maybe}</span>
            <span className="mobile-cta__value">
              {option.estimate.monthly ? moneyRange(option.estimate.monthly) : '€0'} <small>{t.results.perMonth}</small>
            </span>
          </div>
          <Button onClick={() => document.getElementById('easy-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{E.see}</Button>
        </div>
      )}
    </div>
  );
}

function OptionView({ option }: { option: BudgetOption }) {
  const { t, lang, moneyRange } = useI18n();
  const E = t.easy;
  const est = option.estimate;
  return (
    <>
      <p className={cx('easy__fit', `easy__fit--${option.fit}`)}>
        {option.fit === 'within' ? <CircleCheck size={18} aria-hidden /> : <CircleAlert size={18} aria-hidden />}
        {option.fit === 'within' ? E.within : E.maybe}
      </p>
      <ul className="mini-plan easy__plan">
        {servicesIn(option.plan).map((s) => {
          const I = SERVICE_ICONS[s];
          return (
            <li key={s}>
              <span className="mini-plan__icon" aria-hidden>
                <I size={16} strokeWidth={1.75} />
              </span>
              <span>
                <strong>{SERVICES[s].name[lang]}</strong>
                <span className="mini-plan__scope">{scopeText(s, option.plan, est, t)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="easy__price">
        <span className="estimate__label">{E.estimate}</span>
        {est.monthly ? (
          <p className="estimate__price">
            <span className="estimate__amount">{moneyRange(est.monthly)}</span>
            <span className="estimate__unit">{t.results.perMonth}</span>
          </p>
        ) : (
          <p className="muted">{E.perUseOnly}</p>
        )}
        {est.oneTime && <p className="note">{E.oneTime(moneyRange(est.oneTime))}</p>}
      </div>
      {option.dropped.length > 0 && (
        <p className="easy__dropped">
          <Ban size={16} aria-hidden />
          <span>
            {E.dropped}: {option.dropped.map((s) => SERVICES[s].name[lang]).join(', ')}
          </span>
        </p>
      )}
    </>
  );
}
