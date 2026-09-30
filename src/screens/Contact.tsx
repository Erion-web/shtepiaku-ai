import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Check, Lock, Send } from 'lucide-react';
import { useI18n } from '../i18n';
import { useRouter } from '../lib/router';
import { useStore } from '../state/store';
import { useConfig } from '../state/config';
import { usePlanModel } from '../state/plan';
import { firstIncompleteStep, TOTAL_STEPS } from '../state/answers';
import { api, ApiError } from '../lib/api';
import { contactSchema } from '../../shared/schema';
import { servicesIn } from '../../shared/plans';
import { SERVICES } from '../../shared/catalog';
import { Alert, Button, Field, PageTitle, Segmented, TextInput, cx } from '../components/ui';
import { SERVICE_ICONS } from '../components/icons';
import { EstimateCard } from '../components/EstimateCard';
import { scopeText } from '../lib/present';
import type { ContactDraft } from '../state/store';

type FieldKey = 'fullName' | 'email' | 'phone' | 'preferredContact';

export function Contact() {
  const { t, lang } = useI18n();
  const { state, booth, setContact, setRequestType, setLead } = useStore();
  const { config } = useConfig();
  const { navigate } = useRouter();
  const model = usePlanModel();
  const id = useId();
  const c = state.contact;
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const openedAt = useRef(Date.now());
  const inFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const incomplete = firstIncompleteStep(state.answers);

  useEffect(() => {
    if (incomplete <= TOTAL_STEPS) navigate(state.answers.company.name ? `/plan/${incomplete}` : '/', { replace: true });
  }, [incomplete, navigate, state.answers.company.name]);

  if (incomplete <= TOTAL_STEPS || !model.plan || !model.ws) return null;
  const plan = model.plan;

  const update = (patch: Partial<ContactDraft>) => {
    setContact(patch);
    if (serverError) setServerError(null);
  };

  const validate = () => {
    const parsed = contactSchema.safeParse(c);
    if (parsed.success) {
      setErrors({});
      return parsed.data;
    }
    const next: Partial<Record<FieldKey, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as FieldKey;
      if (next[field]) continue;
      next[field] = issue.message === 'name' || field === 'fullName' ? t.contact.errors.name : (t.contact.errors[issue.message as keyof typeof t.contact.errors] ?? t.contact.errors.email_or_phone);
    }
    setErrors(next);
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    return null;
  };

  const submit = async () => {
    if (inFlight.current) return;
    const contact = validate();
    if (!contact) return;
    inFlight.current = true;
    setSending(true);
    setServerError(null);
    try {
      const res = await api.submitLead({
        idempotencyKey: state.idempotencyKey,
        requestType: state.requestType,
        lang,
        answers: state.answers as never,
        planTier: model.tier,
        planCustomized: model.customized,
        plan: plan as never,
        contact,
        website: c.website,
        elapsedMs: Date.now() - openedAt.current,
        booth,
      });
      setLead({ id: res.id, dataset: res.dataset });
      navigate('/faleminderit', { replace: true });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'network';
      const E = t.contact.errors;
      setServerError(
        code === 'network' ? E.network : code === 'rate_limited' ? E.rate_limited : code === 'rejected' ? E.rejected : code === 'invalid_request' ? E.rejected : E.server,
      );
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  const err = (k: FieldKey) => errors[k];
  const services = servicesIn(plan);

  return (
    <div className="contact container">
      <Button variant="quiet" icon={<ArrowLeft size={18} aria-hidden />} onClick={() => navigate('/rezultati')} className="contact__back">
        {t.contact.backToPlan}
      </Button>
      <div className="contact__layout">
        <form
          ref={formRef}
          className="card contact__form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <PageTitle className="q__title">{state.requestType === 'visit' ? t.contact.titleVisit : t.contact.titleOffer}</PageTitle>
          <p className="q__sub">{t.contact.sub}</p>

          <div className="stack-4">
            <Segmented
              label={t.contact.type}
              value={state.requestType}
              onChange={setRequestType}
              options={[
                { value: 'offer', label: t.contact.typeOffer },
                { value: 'visit', label: t.contact.typeVisit },
              ]}
            />

            <div className="grid-2">
              <Field id={`${id}-name`} label={t.contact.fullName} error={err('fullName')}>
                <TextInput
                  id={`${id}-name`}
                  value={c.fullName}
                  autoComplete={booth ? 'off' : 'name'}
                  maxLength={120}
                  invalid={!!err('fullName')}
                  describedBy={err('fullName') ? `${id}-name-error` : undefined}
                  onChange={(e) => update({ fullName: e.target.value })}
                />
              </Field>
              <Field id={`${id}-role`} label={t.contact.role} optional optionalLabel={t.common.optional}>
                <TextInput
                  id={`${id}-role`}
                  value={c.role}
                  placeholder={t.contact.rolePlaceholder}
                  autoComplete={booth ? 'off' : 'organization-title'}
                  maxLength={120}
                  onChange={(e) => update({ role: e.target.value })}
                />
              </Field>
            </div>

            <div className="stack-1">
              <p className="field__hint" id={`${id}-one`}>
                {t.contact.oneRequired}
              </p>
              <div className="grid-2">
                <Field id={`${id}-email`} label={t.contact.email} error={err('email')}>
                  <TextInput
                    id={`${id}-email`}
                    type="email"
                    inputMode="email"
                    value={c.email}
                    autoComplete={booth ? 'off' : 'email'}
                    maxLength={200}
                    invalid={!!err('email')}
                    describedBy={`${id}-one${err('email') ? ` ${id}-email-error` : ''}`}
                    onChange={(e) => update({ email: e.target.value })}
                  />
                </Field>
                <Field id={`${id}-phone`} label={t.contact.phone} error={err('phone')}>
                  <TextInput
                    id={`${id}-phone`}
                    type="tel"
                    inputMode="tel"
                    value={c.phone}
                    placeholder={t.contact.phonePlaceholder}
                    autoComplete={booth ? 'off' : 'tel'}
                    maxLength={40}
                    invalid={!!err('phone')}
                    describedBy={`${id}-one${err('phone') ? ` ${id}-phone-error` : ''}`}
                    onChange={(e) => update({ phone: e.target.value })}
                  />
                </Field>
              </div>
            </div>

            <div className={cx(err('preferredContact') && 'has-error')}>
              <Segmented
                label={t.contact.preferred}
                value={c.preferredContact}
                onChange={(v) => update({ preferredContact: v })}
                options={[
                  { value: 'email', label: t.contact.methods.email },
                  { value: 'phone', label: t.contact.methods.phone },
                  { value: 'whatsapp', label: t.contact.methods.whatsapp },
                ]}
              />
              {err('preferredContact') && (
                <p className="field__error" role="alert">
                  {err('preferredContact')}
                </p>
              )}
            </div>

            <Field id={`${id}-note`} label={t.contact.note} optional optionalLabel={t.common.optional}>
              <div className="input input--area">
                <textarea id={`${id}-note`} rows={3} maxLength={1000} value={c.note} placeholder={t.contact.notePlaceholder} onChange={(e) => update({ note: e.target.value })} />
              </div>
            </Field>

            {/* Honeypot for bots: hidden from people and assistive technology. */}
            <div className="hp" aria-hidden="true">
              <label>
                Website
                <input tabIndex={-1} autoComplete="off" name="website" value={c.website} onChange={(e) => update({ website: e.target.value })} />
              </label>
            </div>

            <label className="checkline checkline--top">
              <input type="checkbox" checked={c.marketingOptIn} onChange={(e) => update({ marketingOptIn: e.target.checked })} />
              <span className="checkline__box" aria-hidden>
                <Check size={14} strokeWidth={3} />
              </span>
              <span>
                {t.contact.marketing} <span className="tag">{t.common.optional}</span>
              </span>
            </label>

            <p className="privacy">
              <Lock size={16} aria-hidden />
              {t.contact.privacy}
            </p>

            {serverError && (
              <Alert tone="error" action={<Button variant="secondary" onClick={() => void submit()} loading={sending}>{t.common.retry}</Button>}>
                {serverError}
              </Alert>
            )}
            {config && !config.online && !serverError && <Alert tone="info">{t.common.apiOffline}</Alert>}

            <div className="contact__submit">
              <Button type="submit" size="lg" loading={sending} icon={!sending ? <Send size={18} aria-hidden /> : undefined}>
                {sending ? t.contact.sending : t.contact.submit}
              </Button>
            </div>
          </div>
        </form>

        <aside className="contact__aside" aria-labelledby="chosen-plan">
          <div className="card">
            <h2 className="section-title" id="chosen-plan">
              {t.contact.planTitle}
            </h2>
            <p className="contact__tier">
              {t.results.tiers[model.tier].name}
              {model.customized && <span className="tier__badge">{t.results.customized}</span>}
            </p>
            <ul className="mini-plan">
              {services.map((s) => {
                const I = SERVICE_ICONS[s];
                return (
                  <li key={s}>
                    <span className="mini-plan__icon" aria-hidden>
                      <I size={16} strokeWidth={1.75} />
                    </span>
                    <span>
                      <strong>{SERVICES[s].name[lang]}</strong>
                      <span className="mini-plan__scope">{scopeText(s, plan, model.estimate, t)}</span>
                    </span>
                  </li>
                );
              })}
              {plan.initialDeepClean && plan.cleaning?.frequency !== 'one_time' && (
                <li>
                  <span className="mini-plan__icon" aria-hidden />
                  <span>
                    <strong>{t.services.initialDeepClean.name}</strong>
                  </span>
                </li>
              )}
            </ul>
            <div className="contact__estimate">
              <EstimateCard est={model.estimate} estimatesEnabled={Boolean(config?.estimatesEnabled && model.pricing)} actions={false} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
