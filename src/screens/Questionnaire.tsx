import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Pencil, Wand2 } from 'lucide-react';
import { useI18n } from '../i18n';
import { useRouter } from '../lib/router';
import { useStore } from '../state/store';
import { useConfig } from '../state/config';
import { profileFor } from '../state/plan';
import { TOTAL_STEPS, firstIncompleteStep, resolveKey, validateStep, type StepErrors } from '../state/answers';
import { Alert, Button, Chip, ChoiceGroup, Counter, Field, OptionCard, PageTitle, TextInput, cx } from '../components/ui';
import { ARRANGEMENT_ICONS, FACILITY_ICONS, SERVICE_ICONS, WORKSPACE_ICONS } from '../components/icons';
import { SERVICES, SERVICE_ORDER } from '../../shared/catalog';
import { isEligible, recommendServices, serviceReason } from '../../shared/rules';
import type {
  Answers,
  AreaRangeId,
  Arrangement,
  CleaningFrequency,
  DddIssue,
  FacilityId,
  ScentZone,
  ServiceId,
  WhoCalled,
  WorkspaceType,
} from '../../shared/types';

const AREA_PRESETS = [80, 150, 250, 400, 700];
const AREA_RANGES: AreaRangeId[] = ['lt100', '100_250', '250_500', '500_1000', '1000_2000', '2000_4000'];
const FACILITIES: FacilityId[] = ['work', 'meeting', 'kitchen', 'toilets', 'reception', 'storage', 'outdoor'];
const TYPES: WorkspaceType[] = ['office', 'coworking', 'retail', 'warehouse', 'other'];
const ARRANGEMENTS: Arrangement[] = ['internal', 'one_provider', 'several_providers', 'as_needed', 'none'];
const WHO: WhoCalled[] = ['manager', 'director', 'anyone', 'undecided'];
const ZONES: ScentZone[] = ['reception', 'toilets', 'meeting', 'work', 'kitchen'];
const ISSUES: DddIssue[] = ['crawling', 'flying', 'rodents', 'disinfection'];

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const parsePositive = (s: string): number | null => {
  const n = Number(s.replace(',', '.').replace(/[^\d.]/g, ''));
  return s.trim() === '' || Number.isNaN(n) ? null : n;
};

export function Questionnaire({ step }: { step: number }) {
  const { t } = useI18n();
  const { state, reachStep } = useStore();
  const { navigate } = useRouter();
  const { answers } = state;
  const [showErrors, setShowErrors] = useState(false);
  const cardRef = useRef<HTMLFormElement>(null);

  // Never allow skipping ahead of the first incomplete step (e.g. via a typed URL or stale history).
  const firstIncomplete = firstIncompleteStep(answers);
  const allowed = Math.min(firstIncomplete, TOTAL_STEPS);
  useEffect(() => {
    if (step > allowed) navigate(`/plan/${allowed}`, { replace: true });
  }, [step, allowed, navigate]);

  useEffect(() => setShowErrors(false), [step]);

  const errors = useMemo(() => validateStep(step, answers), [step, answers]);
  const visibleErrors: StepErrors = showErrors ? errors : {};
  const err = (k: string) => (visibleErrors[k] ? resolveKey(t, visibleErrors[k]) : undefined);

  // After a failed "Continue", move focus to the first field with an error.
  useEffect(() => {
    if (!showErrors) return;
    const el = cardRef.current?.querySelector<HTMLElement>('.has-error input, .has-error button');
    el?.focus();
  }, [showErrors]);

  const goNext = () => {
    if (Object.keys(errors).length) {
      setShowErrors(true);
      return;
    }
    if (step < TOTAL_STEPS) {
      reachStep(step + 1);
      navigate(`/plan/${step + 1}`);
    } else {
      reachStep(TOTAL_STEPS + 1);
      navigate('/rezultati');
    }
  };
  const goBack = () => (step > 1 ? navigate(`/plan/${step - 1}`) : navigate('/'));

  if (step > allowed) return null;
  const label = t.steps.labels[step - 1];

  return (
    <div className="q container">
      <div className="q__layout">
        <div className="q__main">
          <Progress step={step} furthest={Math.min(state.furthestStep, allowed)} />
          <MobileSummary answers={answers} />

          <form
            className="card q__card"
            ref={cardRef}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              goNext();
            }}
            aria-label={label}
          >
            {step === 1 && <StepCompany err={err} />}
            {step === 2 && <StepSpace err={err} />}
            {step === 3 && <StepFacilities err={err} />}
            {step === 4 && <StepPriorities err={err} />}
            {step === 5 && <StepDetails err={err} />}
            {step === 6 && <StepCurrent err={err} />}

            {showErrors && Object.keys(errors).length > 0 && (
              <div className="q__errsum">
                <Alert tone="error">{t.steps.fixErrors}</Alert>
              </div>
            )}

            <div className="q__nav">
              <div className="q__nav-inner">
                <Button variant="ghost" icon={<ArrowLeft size={18} aria-hidden />} onClick={goBack}>
                  {t.common.back}
                </Button>
                <Button type="submit" size="lg" iconRight={<ArrowRight size={18} aria-hidden />}>
                  {step === TOTAL_STEPS ? t.steps.finish : t.common.next}
                </Button>
              </div>
            </div>
          </form>
        </div>

        <aside className="q__aside" aria-label={t.summary.title}>
          <SummaryCard answers={answers} />
        </aside>
      </div>
    </div>
  );
}

// ── Progress ────────────────────────────────────────────────────────────────
function Progress({ step, furthest }: { step: number; furthest: number }) {
  const { t } = useI18n();
  const { navigate } = useRouter();
  return (
    <nav className="progress" aria-label={t.steps.progress(step, TOTAL_STEPS)}>
      <p className="progress__text">
        <span className="progress__count">{t.steps.progress(step, TOTAL_STEPS)}</span>
        <span className="progress__dot" aria-hidden>
          ·
        </span>
        <span>{t.steps.labels[step - 1]}</span>
      </p>
      <ol className="progress__bar">
        {t.steps.labels.map((l, i) => {
          const n = i + 1;
          const reachable = n <= furthest;
          const status = n === step ? 'current' : n < step || reachable ? 'done' : 'todo';
          return (
            <li key={l} className={cx('progress__seg', `is-${status}`)}>
              <button
                type="button"
                disabled={!reachable || n === step}
                onClick={() => navigate(`/plan/${n}`)}
                aria-label={t.steps.goTo(l)}
                aria-current={n === step ? 'step' : undefined}
              >
                <span className="progress__fill" />
                <span className="progress__label">{l}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ── Step 1: company ─────────────────────────────────────────────────────────
type ErrFn = (k: string) => string | undefined;

function StepHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="q__head">
      <PageTitle className="q__title">{title}</PageTitle>
      {sub && <p className="q__sub">{sub}</p>}
    </header>
  );
}

function StepCompany({ err }: { err: ErrFn }) {
  const { t } = useI18n();
  const { state, updateAnswers } = useStore();
  const c = state.answers.company;
  const id = useId();
  const isPreset = t.company.cities.includes(c.city);
  const [otherCity, setOtherCity] = useState(() => c.city !== '' && !isPreset);

  return (
    <>
      <StepHeader title={t.company.title} sub={t.company.sub} />
      <div className="stack-4">
        <Field id={`${id}-name`} label={t.company.name} error={err('name')}>
          <TextInput
            id={`${id}-name`}
            value={c.name}
            placeholder={t.company.namePlaceholder}
            autoComplete="organization"
            maxLength={120}
            invalid={!!err('name')}
            describedBy={err('name') ? `${id}-name-error` : undefined}
            onChange={(e) => updateAnswers((a) => void (a.company.name = e.target.value))}
          />
        </Field>

        <ChoiceGroup legend={t.company.city} error={err('city')}>
          {t.company.cities.map((city) => (
            <Chip
              key={city}
              name={`${id}-city`}
              checked={!otherCity && c.city === city}
              onChange={() => {
                setOtherCity(false);
                updateAnswers((a) => void (a.company.city = city));
              }}
            >
              {city}
            </Chip>
          ))}
          <Chip
            name={`${id}-city`}
            checked={otherCity}
            onChange={() => {
              setOtherCity(true);
              updateAnswers((a) => void (a.company.city = isPreset ? '' : a.company.city));
            }}
          >
            {t.company.other}
          </Chip>
        </ChoiceGroup>
        {otherCity && (
          <Field id={`${id}-city-other`} label={t.company.cityOther}>
            <TextInput
              id={`${id}-city-other`}
              value={c.city}
              maxLength={80}
              autoComplete="address-level2"
              autoFocus
              onChange={(e) => updateAnswers((a) => void (a.company.city = e.target.value))}
            />
          </Field>
        )}

        <ChoiceGroup legend={t.company.type} error={err('type')} layout="cards">
          {TYPES.map((ty) => {
            const I = WORKSPACE_ICONS[ty];
            return (
              <OptionCard
                key={ty}
                name={`${id}-type`}
                checked={c.workspaceType === ty}
                onChange={() => updateAnswers((a) => void (a.company.workspaceType = ty))}
                icon={<I size={22} strokeWidth={1.75} />}
                title={t.company.types[ty].label}
                hint={t.company.types[ty].hint}
              />
            );
          })}
        </ChoiceGroup>
      </div>
    </>
  );
}

// ── Step 2: space ───────────────────────────────────────────────────────────
function StepSpace({ err }: { err: ErrFn }) {
  const { t, num } = useI18n();
  const { state, updateAnswers } = useStore();
  const s = state.answers.space;
  const id = useId();
  const [areaText, setAreaText] = useState(s.area ? String(s.area) : '');
  const [peopleText, setPeopleText] = useState(s.people !== null ? String(s.people) : '');

  return (
    <>
      <StepHeader title={t.space.title} sub={t.space.sub} />
      <div className="stack-5">
        <div className="stack-2">
          {s.areaKnown ? (
            <Field id={`${id}-area`} label={t.space.area} hint={t.space.areaHint} error={err('area')}>
              <TextInput
                id={`${id}-area`}
                className="input--num"
                inputMode="decimal"
                suffix={t.common.m2}
                value={areaText}
                invalid={!!err('area')}
                describedBy={`${id}-area-hint${err('area') ? ` ${id}-area-error` : ''}`}
                onChange={(e) => {
                  setAreaText(e.target.value);
                  const n = parsePositive(e.target.value);
                  updateAnswers((a) => void (a.space.area = n && n > 0 ? Math.min(n, 100000) : null));
                }}
              />
            </Field>
          ) : null}
          {s.areaKnown && (
            <div className="presets" role="group" aria-label={t.space.presets}>
              {AREA_PRESETS.map((p) => (
                <button
                  type="button"
                  key={p}
                  className={cx('preset', s.area === p && 'is-checked')}
                  aria-pressed={s.area === p}
                  onClick={() => {
                    setAreaText(String(p));
                    updateAnswers((a) => void (a.space.area = p));
                  }}
                >
                  {num(p)} m²
                </button>
              ))}
            </div>
          )}
          <label className="checkline">
            <input
              type="checkbox"
              checked={!s.areaKnown}
              onChange={(e) =>
                updateAnswers((a) => {
                  a.space.areaKnown = !e.target.checked;
                })
              }
            />
            <span className="checkline__box" aria-hidden>
              <Check size={14} strokeWidth={3} />
            </span>
            <span>{t.space.unknownArea}</span>
          </label>
          {!s.areaKnown && (
            <div className="reveal stack-2">
              <ChoiceGroup legend={t.space.rangeLabel} error={err('area')}>
                {AREA_RANGES.map((r) => (
                  <Chip key={r} name={`${id}-range`} checked={s.areaRange === r} onChange={() => updateAnswers((a) => void (a.space.areaRange = r))}>
                    {t.space.ranges[r]}
                  </Chip>
                ))}
              </ChoiceGroup>
              <p className="note">{t.space.rangeNote}</p>
            </div>
          )}
        </div>

        <div className="stack-2">
          {s.peopleKnown && (
            <Field id={`${id}-people`} label={t.space.people} hint={t.space.peopleHint} error={err('people')}>
              <TextInput
                id={`${id}-people`}
                className="input--num"
                inputMode="numeric"
                value={peopleText}
                invalid={!!err('people')}
                describedBy={`${id}-people-hint${err('people') ? ` ${id}-people-error` : ''}`}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 5);
                  setPeopleText(digits);
                  updateAnswers((a) => void (a.space.people = digits === '' ? null : parseInt(digits, 10)));
                }}
              />
            </Field>
          )}
          {!s.peopleKnown && <p className="field__label">{t.space.people}</p>}
          <label className="checkline">
            <input type="checkbox" checked={!s.peopleKnown} onChange={(e) => updateAnswers((a) => void (a.space.peopleKnown = !e.target.checked))} />
            <span className="checkline__box" aria-hidden>
              <Check size={14} strokeWidth={3} />
            </span>
            <span>{t.space.unknownPeople}</span>
          </label>
          {!s.peopleKnown && <p className="note reveal">{t.space.peopleNote}</p>}
        </div>
      </div>
    </>
  );
}

// ── Step 3: facilities ──────────────────────────────────────────────────────
function StepFacilities({ err }: { err: ErrFn }) {
  const { t } = useI18n();
  const { state, updateAnswers } = useStore();
  const f = state.answers.facilities;
  const id = useId();
  return (
    <>
      <StepHeader title={t.facilities.title} sub={t.facilities.sub} />
      <ChoiceGroup legend={<span className="sr-only">{t.facilities.title}</span>} error={err('facilities')} layout="cards">
        {FACILITIES.map((fac) => {
          const I = FACILITY_ICONS[fac];
          return (
            <OptionCard
              key={fac}
              type="checkbox"
              name={`${id}-fac`}
              checked={f.selected.includes(fac)}
              onChange={() => updateAnswers((a) => void (a.facilities.selected = toggle(a.facilities.selected, fac)))}
              icon={<I size={22} strokeWidth={1.75} />}
              title={t.facilities.items[fac].label}
              hint={t.facilities.items[fac].hint}
            />
          );
        })}
      </ChoiceGroup>
      {(f.selected.includes('kitchen') || f.selected.includes('toilets')) && (
        <div className="counters reveal">
          {f.selected.includes('kitchen') && (
            <Counter
              id={`${id}-kitchens`}
              label={t.facilities.kitchens}
              value={f.kitchens}
              min={1}
              max={50}
              decLabel={t.facilities.decrease}
              incLabel={t.facilities.increase}
              onChange={(n) => updateAnswers((a) => void (a.facilities.kitchens = n))}
            />
          )}
          {f.selected.includes('toilets') && (
            <Counter
              id={`${id}-toilets`}
              label={t.facilities.toilets}
              value={f.toilets}
              min={1}
              max={200}
              decLabel={t.facilities.decrease}
              incLabel={t.facilities.increase}
              onChange={(n) => updateAnswers((a) => void (a.facilities.toilets = n))}
            />
          )}
        </div>
      )}
    </>
  );
}

// ── Step 4: priorities ──────────────────────────────────────────────────────
function StepPriorities({ err }: { err: ErrFn }) {
  const { t, lang } = useI18n();
  const { state, updateAnswers } = useStore();
  const { pricing } = useConfig();
  const p = state.answers.priorities;
  const ws = profileFor(state.answers, pricing);
  const id = useId();
  const proposed = useMemo(() => (ws ? recommendServices(ws) : []), [ws]);

  const serviceCard = (s: ServiceId, note?: string) => {
    const eligible = ws ? isEligible(s, ws) : true;
    const I = SERVICE_ICONS[s];
    return (
      <OptionCard
        key={s}
        type="checkbox"
        name={`${id}-svc`}
        checked={p.selected.includes(s)}
        disabled={!eligible}
        onChange={() =>
          updateAnswers((a) => {
            a.priorities.selected = toggle(a.priorities.selected, s);
          })
        }
        icon={<I size={22} strokeWidth={1.75} />}
        title={SERVICES[s].name[lang]}
        hint={note ?? SERVICES[s].short[lang]}
        note={!eligible ? t.priorities.ineligible : undefined}
        tone={s === 'ddd' ? 'eco' : undefined}
      />
    );
  };

  if (p.mode === 'recommend') {
    const others = SERVICE_ORDER.filter((s) => !proposed.includes(s));
    return (
      <>
        <StepHeader title={t.priorities.title} sub={t.priorities.notSureHint} />
        <div className="rec reveal">
          <div className="rec__head">
            <span className="rec__icon" aria-hidden>
              <Wand2 size={20} strokeWidth={1.75} />
            </span>
            <div>
              <h2 className="rec__title">{t.priorities.recTitle}</h2>
              <p className="rec__sub">{t.priorities.recSub}</p>
            </div>
          </div>
          <ChoiceGroup legend={<span className="sr-only">{t.priorities.recTitle}</span>} layout="list" error={err('services')}>
            {proposed.map((s) => serviceCard(s, ws ? serviceReason(s, ws)[lang] : undefined))}
          </ChoiceGroup>
          {others.length > 0 && (
            <ChoiceGroup legend={t.priorities.otherServices} layout="list">
              {others.map((s) => serviceCard(s))}
            </ChoiceGroup>
          )}
          <div className="rec__actions">
            {p.recommendationReviewed ? (
              <p className="rec__confirmed" role="status">
                <Check size={18} strokeWidth={2.5} aria-hidden /> {t.priorities.confirmed}
              </p>
            ) : (
              <Button variant="secondary" icon={<Check size={18} aria-hidden />} disabled={p.selected.length === 0} onClick={() => updateAnswers((a) => void (a.priorities.recommendationReviewed = true))}>
                {t.priorities.confirm}
              </Button>
            )}
            <Button variant="quiet" onClick={() => updateAnswers((a) => ((a.priorities.mode = 'choose'), (a.priorities.recommendationReviewed = false)))}>
              {t.priorities.backToChoose}
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <StepHeader title={t.priorities.title} sub={t.priorities.sub} />
      <ChoiceGroup legend={<span className="sr-only">{t.priorities.title}</span>} layout="cards-2" error={err('services')}>
        {SERVICE_ORDER.map((s) => serviceCard(s))}
      </ChoiceGroup>
      <button
        type="button"
        className="notsure"
        onClick={() =>
          updateAnswers((a) => {
            a.priorities.mode = 'recommend';
            a.priorities.selected = [...proposed];
            a.priorities.recommendationReviewed = false;
          })
        }
      >
        <span className="notsure__icon" aria-hidden>
          <Wand2 size={20} strokeWidth={1.75} />
        </span>
        <span className="notsure__body">
          <span className="notsure__title">{t.priorities.notSure}</span>
          <span className="notsure__hint">{t.priorities.notSureHint}</span>
        </span>
        <ArrowRight size={18} aria-hidden />
      </button>
    </>
  );
}

// ── Step 5: details ─────────────────────────────────────────────────────────
function DetailSection({ service, children }: { service: ServiceId; children: React.ReactNode }) {
  const { lang } = useI18n();
  const I = SERVICE_ICONS[service];
  return (
    <section className={cx('detail', service === 'ddd' && 'detail--eco')} aria-labelledby={`detail-${service}`}>
      <h2 className="detail__title" id={`detail-${service}`}>
        <span className="detail__icon" aria-hidden>
          <I size={18} strokeWidth={1.75} />
        </span>
        {SERVICES[service].name[lang]}
      </h2>
      <div className="stack-3">{children}</div>
    </section>
  );
}

function StepDetails({ err }: { err: ErrFn }) {
  const { t } = useI18n();
  const { state, updateAnswers } = useStore();
  const { pricing } = useConfig();
  const a = state.answers;
  const d = a.details;
  const ws = profileFor(a, pricing);
  const selected = SERVICE_ORDER.filter((s) => a.priorities.selected.includes(s) && (!ws || isEligible(s, ws)));
  const id = useId();
  const [coverageText, setCoverageText] = useState(d.scenting.coverageM2 ? String(d.scenting.coverageM2) : '');
  const [customText, setCustomText] = useState(d.cleaning.customVisitsPerMonth ? String(d.cleaning.customVisitsPerMonth) : '');
  const set = (fn: (x: Answers['details']) => void) => updateAnswers((ans) => fn(ans.details));
  const freqs: CleaningFrequency[] = [1, 2, 3, 4, 5];

  return (
    <>
      <StepHeader title={t.details.title} sub={t.details.sub} />
      <div className="stack-3">
        {selected.includes('cleaning') && (
          <DetailSection service="cleaning">
            <ChoiceGroup legend={t.details.cleaning.frequency} error={err('frequency')}>
              {freqs.map((f) => (
                <Chip key={f} name={`${id}-freq`} checked={d.cleaning.frequency === f} onChange={() => set((x) => void (x.cleaning.frequency = f))}>
                  {t.details.cleaning.perWeek(f as number)}
                </Chip>
              ))}
              <Chip name={`${id}-freq`} checked={d.cleaning.frequency === 'custom'} onChange={() => set((x) => void (x.cleaning.frequency = 'custom'))}>
                {t.details.cleaning.custom}
              </Chip>
              <Chip name={`${id}-freq`} checked={d.cleaning.frequency === 'one_time'} onChange={() => set((x) => void (x.cleaning.frequency = 'one_time'))}>
                {t.details.cleaning.oneTime}
              </Chip>
            </ChoiceGroup>
            {d.cleaning.frequency === 'custom' && (
              <Field id={`${id}-custom`} label={t.details.cleaning.customLabel} error={err('custom')}>
                <TextInput
                  id={`${id}-custom`}
                  className="input--num input--short"
                  inputMode="numeric"
                  value={customText}
                  invalid={!!err('custom')}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                    setCustomText(v);
                    set((x) => void (x.cleaning.customVisitsPerMonth = v ? parseInt(v, 10) : null));
                  }}
                />
              </Field>
            )}
            <ChoiceGroup legend={t.details.cleaning.timing} error={err('timing')} layout="cards-2">
              <OptionCard name={`${id}-timing`} checked={d.cleaning.timing === 'during'} onChange={() => set((x) => void (x.cleaning.timing = 'during'))} title={t.details.cleaning.during} />
              <OptionCard
                name={`${id}-timing`}
                checked={d.cleaning.timing === 'outside'}
                onChange={() => set((x) => void (x.cleaning.timing = 'outside'))}
                title={t.details.cleaning.outside}
                hint={t.details.cleaning.outsideHint}
              />
            </ChoiceGroup>
          </DetailSection>
        )}

        {selected.includes('hygiene') && (
          <DetailSection service="hygiene">
            <ChoiceGroup legend={t.details.hygiene.mode} error={err('hygiene')} layout="cards-2">
              <OptionCard
                name={`${id}-hyg`}
                checked={d.hygiene.mode === 'recurring'}
                onChange={() => set((x) => void (x.hygiene.mode = 'recurring'))}
                title={t.details.hygiene.recurring}
                hint={t.details.hygiene.recurringHint}
              />
              <OptionCard
                name={`${id}-hyg`}
                checked={d.hygiene.mode === 'occasional'}
                onChange={() => set((x) => void (x.hygiene.mode = 'occasional'))}
                title={t.details.hygiene.occasional}
                hint={t.details.hygiene.occasionalHint}
              />
            </ChoiceGroup>
          </DetailSection>
        )}

        {selected.includes('scenting') && (
          <DetailSection service="scenting">
            <ChoiceGroup legend={t.details.scenting.zones} error={err('zones')}>
              {ZONES.map((z) => (
                <Chip key={z} type="checkbox" name={`${id}-zone`} checked={d.scenting.zones.includes(z)} onChange={() => set((x) => void (x.scenting.zones = toggle(x.scenting.zones, z)))}>
                  {t.details.scenting.zoneItems[z]}
                </Chip>
              ))}
            </ChoiceGroup>
            <div className="stack-2">
              {d.scenting.coverageKnown ? (
                <Field id={`${id}-cov`} label={t.details.scenting.coverage} error={err('coverage')}>
                  <TextInput
                    id={`${id}-cov`}
                    className="input--num input--short"
                    inputMode="decimal"
                    suffix={t.common.m2}
                    value={coverageText}
                    invalid={!!err('coverage')}
                    onChange={(e) => {
                      setCoverageText(e.target.value);
                      const n = parsePositive(e.target.value);
                      set((x) => void (x.scenting.coverageM2 = n && n > 0 ? n : null));
                    }}
                  />
                </Field>
              ) : (
                <p className="field__label">{t.details.scenting.coverage}</p>
              )}
              <label className="checkline">
                <input type="checkbox" checked={!d.scenting.coverageKnown} onChange={(e) => set((x) => void (x.scenting.coverageKnown = !e.target.checked))} />
                <span className="checkline__box" aria-hidden>
                  <Check size={14} strokeWidth={3} />
                </span>
                <span>{t.details.scenting.coverageUnknown}</span>
              </label>
              {!d.scenting.coverageKnown && <p className="note">{t.details.scenting.coverageNote}</p>}
            </div>
          </DetailSection>
        )}

        {selected.includes('maintenance') && (
          <DetailSection service="maintenance">
            <ChoiceGroup legend={t.details.maintenance.mode} error={err('maintenance')} layout="cards-2">
              <OptionCard
                name={`${id}-mnt`}
                checked={d.maintenance.mode === 'preventive'}
                onChange={() => set((x) => void (x.maintenance.mode = 'preventive'))}
                title={t.details.maintenance.preventive}
                hint={t.details.maintenance.preventiveHint}
              />
              <OptionCard
                name={`${id}-mnt`}
                checked={d.maintenance.mode === 'on_demand'}
                onChange={() => set((x) => void (x.maintenance.mode = 'on_demand'))}
                title={t.details.maintenance.onDemand}
                hint={t.details.maintenance.onDemandHint}
              />
            </ChoiceGroup>
          </DetailSection>
        )}

        {selected.includes('drains') && (
          <DetailSection service="drains">
            <ChoiceGroup legend={t.details.drains.mode} error={err('drains')} layout="cards-2">
              <OptionCard
                name={`${id}-drn`}
                checked={d.drains.mode === 'existing'}
                onChange={() => set((x) => void (x.drains.mode = 'existing'))}
                title={t.details.drains.existing}
                hint={t.details.drains.existingHint}
              />
              <OptionCard
                name={`${id}-drn`}
                checked={d.drains.mode === 'on_demand'}
                onChange={() => set((x) => void (x.drains.mode = 'on_demand'))}
                title={t.details.drains.onDemand}
                hint={t.details.drains.onDemandHint}
              />
            </ChoiceGroup>
          </DetailSection>
        )}

        {selected.includes('ddd') && (
          <DetailSection service="ddd">
            <ChoiceGroup legend={t.details.ddd.mode} error={err('ddd')} layout="cards-2">
              <OptionCard
                name={`${id}-ddd`}
                checked={d.ddd.mode === 'prevention'}
                onChange={() => set((x) => void (x.ddd.mode = 'prevention'))}
                title={t.details.ddd.prevention}
                hint={t.details.ddd.preventionHint}
                tone="eco"
              />
              <OptionCard
                name={`${id}-ddd`}
                checked={d.ddd.mode === 'existing'}
                onChange={() => set((x) => void (x.ddd.mode = 'existing'))}
                title={t.details.ddd.existing}
                hint={t.details.ddd.existingHint}
                tone="eco"
              />
            </ChoiceGroup>
            {d.ddd.mode === 'existing' && (
              <ChoiceGroup legend={t.details.ddd.issues} error={err('issues')} className="reveal">
                {ISSUES.map((i) => (
                  <Chip key={i} type="checkbox" name={`${id}-iss`} checked={d.ddd.issues.includes(i)} onChange={() => set((x) => void (x.ddd.issues = toggle(x.ddd.issues, i)))}>
                    {t.details.ddd.issueItems[i]}
                  </Chip>
                ))}
              </ChoiceGroup>
            )}
          </DetailSection>
        )}
      </div>
    </>
  );
}

// ── Step 6: current arrangement ─────────────────────────────────────────────
function StepCurrent({ err }: { err: ErrFn }) {
  const { t } = useI18n();
  const { state, updateAnswers } = useStore();
  const c = state.answers.current;
  const id = useId();
  return (
    <>
      <StepHeader title={t.current.title} sub={t.current.sub} />
      <div className="stack-5">
        <ChoiceGroup legend={<span className="sr-only">{t.current.title}</span>} error={err('arrangement')} layout="cards">
          {ARRANGEMENTS.map((ar) => {
            const I = ARRANGEMENT_ICONS[ar];
            return (
              <OptionCard
                key={ar}
                name={`${id}-arr`}
                checked={c.arrangement === ar}
                onChange={() => updateAnswers((a) => void (a.current.arrangement = ar))}
                icon={<I size={22} strokeWidth={1.75} />}
                title={t.current.options[ar].label}
                hint={t.current.options[ar].hint}
              />
            );
          })}
        </ChoiceGroup>
        <ChoiceGroup legend={t.current.whoTitle} hint={t.current.skip} optional optionalLabel={t.common.optional}>
          {WHO.map((w) => (
            <Chip
              key={w}
              type="checkbox"
              name={`${id}-who`}
              checked={c.whoGetsCalled === w}
              onChange={() => updateAnswers((a) => void (a.current.whoGetsCalled = a.current.whoGetsCalled === w ? null : w))}
            >
              {t.current.who[w]}
            </Chip>
          ))}
        </ChoiceGroup>
      </div>
    </>
  );
}

// ── Summary ─────────────────────────────────────────────────────────────────
function useSummaryRows(answers: Answers) {
  const { t, lang, num } = useI18n();
  const rows: { key: string; label: string; value: string; step: number }[] = [];
  const c = answers.company;
  if (c.name || c.workspaceType)
    rows.push({ key: 'company', label: t.summary.company, value: [c.name, c.workspaceType && t.company.types[c.workspaceType].label, c.city].filter(Boolean).join(' · '), step: 1 });
  const s = answers.space;
  if ((s.areaKnown && s.area) || (!s.areaKnown && s.areaRange)) rows.push({ key: 'space', label: t.summary.space, value: s.areaKnown ? `${num(s.area!)} m²` : t.space.ranges[s.areaRange!], step: 2 });
  if (!s.peopleKnown || s.people !== null) rows.push({ key: 'people', label: t.summary.people, value: s.peopleKnown ? num(s.people!) : t.summary.unknown, step: 2 });
  const f = answers.facilities;
  if (f.selected.length)
    rows.push({
      key: 'facilities',
      label: t.summary.facilities,
      value: FACILITIES.filter((x) => f.selected.includes(x))
        .map((x) => {
          const l = t.facilities.items[x].label;
          if (x === 'kitchen' && f.kitchens > 1) return `${l} ×${f.kitchens}`;
          if (x === 'toilets') return `${l} ×${f.toilets}`;
          return l;
        })
        .join(', '),
      step: 3,
    });
  const p = answers.priorities;
  if (p.selected.length)
    rows.push({ key: 'services', label: t.summary.services, value: SERVICE_ORDER.filter((x) => p.selected.includes(x)).map((x) => SERVICES[x].name[lang]).join(', '), step: 4 });
  if (answers.current.arrangement) rows.push({ key: 'arr', label: t.summary.arrangement, value: t.current.options[answers.current.arrangement].label, step: 6 });
  return rows;
}

function SummaryList({ answers }: { answers: Answers }) {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const { state } = useStore();
  const rows = useSummaryRows(answers);
  if (!rows.length) return <p className="summary__empty">{t.summary.empty}</p>;
  return (
    <dl className="summary__list">
      {rows.map((r) => (
        <div className="summary__row" key={r.key}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
          {r.step <= state.furthestStep && (
            <button type="button" className="summary__edit" onClick={() => navigate(`/plan/${r.step}`)} aria-label={`${t.common.edit}: ${r.label}`}>
              <Pencil size={14} aria-hidden />
            </button>
          )}
        </div>
      ))}
    </dl>
  );
}

function SummaryCard({ answers }: { answers: Answers }) {
  const { t } = useI18n();
  return (
    <div className="summary">
      <h2 className="summary__title">{t.summary.title}</h2>
      <SummaryList answers={answers} />
    </div>
  );
}

function MobileSummary({ answers }: { answers: Answers }) {
  const { t } = useI18n();
  const count = useSummaryRows(answers).length;
  return (
    <details className="msummary">
      <summary>
        <span>{t.summary.toggle(count)}</span>
        <ChevronDown size={18} aria-hidden className="msummary__chev" />
      </summary>
      <div className="msummary__body">
        <SummaryList answers={answers} />
      </div>
    </details>
  );
}
