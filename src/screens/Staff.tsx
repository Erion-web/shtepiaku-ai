import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { ChevronDown, Download, LogOut, Search, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { useStore } from '../state/store';
import { api, ApiError, type StaffLead } from '../lib/api';
import { Alert, Button, Field, PageTitle, Segmented, Switch, TextInput, cx } from '../components/ui';
import { SERVICE_ICONS } from '../components/icons';
import { SERVICES } from '../../shared/catalog';
import { LEAD_STATUSES, type LeadStatus, type ServiceId } from '../../shared/types';

type Session = 'loading' | 'offline' | 'unconfigured' | 'anon' | 'authed';

export function Staff() {
  const { t } = useI18n();
  const [session, setSession] = useState<Session>('loading');

  const check = useCallback(() => {
    api.staff
      .session()
      .then((s) => setSession(!s.configured ? 'unconfigured' : s.authenticated ? 'authed' : 'anon'))
      .catch(() => setSession('offline'));
  }, []);
  useEffect(check, [check]);

  return (
    <div className="staff container">
      {session === 'loading' && <p className="muted">{t.common.loading}</p>}
      {session === 'offline' && <Alert tone="error">{t.staff.offline}</Alert>}
      {session === 'unconfigured' && (
        <div className="staff__login card">
          <PageTitle className="q__title">{t.staff.login}</PageTitle>
          <Alert tone="info">{t.staff.notConfigured}</Alert>
        </div>
      )}
      {session === 'anon' && <Login onDone={() => setSession('authed')} />}
      {session === 'authed' && <Dashboard onLogout={() => setSession('anon')} onUnauthorized={() => setSession('anon')} />}
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const id = useId();
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="staff__login card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api.staff.login(pw);
          setPw('');
          onDone();
        } catch (err) {
          const code = err instanceof ApiError ? err.code : 'network';
          setError(code === 'rate_limited' ? t.staff.rateLimited : code === 'network' ? t.staff.offline : t.staff.invalid);
        } finally {
          setBusy(false);
        }
      }}
    >
      <PageTitle className="q__title">{t.staff.login}</PageTitle>
      <div className="stack-3">
        <Field id={`${id}-pw`} label={t.staff.password} error={error ?? undefined}>
          <TextInput id={`${id}-pw`} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} invalid={!!error} autoFocus />
        </Field>
        <Button type="submit" size="lg" loading={busy} disabled={!pw}>
          {t.staff.signIn}
        </Button>
      </div>
    </form>
  );
}

function Dashboard({ onLogout, onUnauthorized }: { onLogout: () => void; onUnauthorized: () => void }) {
  const { t, lang, moneyRange } = useI18n();
  const { booth, setBooth } = useStore();
  const [dataset, setDataset] = useState<'live' | 'demo'>('demo');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<LeadStatus | ''>('');
  const [type, setType] = useState<'' | 'offer' | 'visit'>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [leads, setLeads] = useState<StaffLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ dataset });
    if (q.trim()) p.set('q', q.trim());
    if (status) p.set('status', status);
    if (type) p.set('type', type);
    if (from) p.set('from', new Date(`${from}T00:00:00`).toISOString());
    if (to) {
      const d = new Date(`${to}T00:00:00`);
      d.setDate(d.getDate() + 1);
      p.set('to', d.toISOString());
    }
    return p.toString();
  }, [dataset, q, status, type, from, to]);

  const load = useCallback(() => {
    api.staff
      .leads(qs)
      .then((r) => {
        setLeads(r.leads);
        setError(null);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) onUnauthorized();
        else setError(t.staff.loadError);
      });
  }, [qs, onUnauthorized, t.staff.loadError]);

  useEffect(() => {
    const id = setTimeout(load, 200);
    return () => clearTimeout(id);
  }, [load]);

  const patch = async (lead: StaffLead, change: { status?: LeadStatus; staffNotes?: string }) => {
    try {
      const r = await api.staff.update(lead.id, lead.dataset, change);
      setLeads((ls) => ls?.map((l) => (l.id === lead.id ? r.lead : l)) ?? null);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onUnauthorized();
      else setError(t.staff.updateError);
      return false;
    }
  };

  const fmtDate = (iso: string) => new Intl.DateTimeFormat(lang === 'sq' ? 'sq-AL' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  const open = leads?.find((l) => l.id === openId) ?? null;

  return (
    <>
      <div className="staff__head">
        <PageTitle className="results__title">{t.staff.title}</PageTitle>
        <div className="staff__head-actions">
          <div className="booth-toggle">
            <div>
              <p className="booth-toggle__label">{t.staff.boothDevice}</p>
              <p className="booth-toggle__hint">{t.staff.boothHint}</p>
            </div>
            <Switch checked={booth} onChange={setBooth} label={t.staff.boothDevice} />
          </div>
          <Button
            variant="ghost"
            icon={<LogOut size={18} aria-hidden />}
            onClick={async () => {
              await api.staff.logout().catch(() => undefined);
              onLogout();
            }}
          >
            {t.staff.logout}
          </Button>
        </div>
      </div>

      <div className="card staff__panel">
        <div className="staff__toolbar">
          <Segmented
            label={t.staff.leads}
            hideLabel
            value={dataset}
            onChange={setDataset}
            options={[
              { value: 'live', label: t.staff.datasetLive },
              { value: 'demo', label: t.staff.datasetDemo },
            ]}
          />
          <div className="staff__search">
            <Search size={18} aria-hidden />
            <input type="search" aria-label={t.staff.search} placeholder={t.staff.search} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <SelectBox label={t.staff.cols.status} value={status} onChange={(v) => setStatus(v as LeadStatus | '')}>
            <option value="">{t.staff.allStatuses}</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t.staff.status[s]}
              </option>
            ))}
          </SelectBox>
          <SelectBox label={t.staff.cols.type} value={type} onChange={(v) => setType(v as '' | 'offer' | 'visit')}>
            <option value="">{t.staff.allTypes}</option>
            <option value="offer">{t.staff.type.offer}</option>
            <option value="visit">{t.staff.type.visit}</option>
          </SelectBox>
          <label className="date-box">
            <span>{t.staff.from}</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="date-box">
            <span>{t.staff.to}</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <a className="btn btn--secondary btn--md" href={`/api/staff/leads.csv?${qs}`} download>
            <Download size={18} aria-hidden />
            <span>{t.staff.export}</span>
          </a>
        </div>
        {dataset === 'demo' && <p className="note">{t.staff.datasetNote}</p>}
        {error && <Alert tone="error">{error}</Alert>}

        {leads && (
          <p className="staff__count" role="status">
            {t.staff.count(leads.length)}
          </p>
        )}
        {leads && leads.length === 0 && <p className="staff__empty">{t.staff.empty}</p>}
        {leads && leads.length > 0 && (
          <div className="table-wrap">
            <table className="leads">
              <thead>
                <tr>
                  <th scope="col">{t.staff.cols.date}</th>
                  <th scope="col">{t.staff.cols.company}</th>
                  <th scope="col">{t.staff.cols.contact}</th>
                  <th scope="col">{t.staff.cols.services}</th>
                  <th scope="col">{t.staff.cols.estimate}</th>
                  <th scope="col">{t.staff.cols.type}</th>
                  <th scope="col">{t.staff.cols.status}</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td className="nowrap">{fmtDate(l.createdAt)}</td>
                    <td>
                      <button type="button" className="link-btn" onClick={() => setOpenId(l.id)}>
                        {l.companyName}
                      </button>
                      <span className="sub">{l.city}</span>
                    </td>
                    <td>
                      {l.contact.fullName}
                      <span className="sub">{l.contact.email || l.contact.phone}</span>
                    </td>
                    <td>
                      <span className="svc-icons" aria-label={l.services.map((s) => SERVICES[s as ServiceId]?.name[lang]).join(', ')}>
                        {l.services.map((s) => {
                          const I = SERVICE_ICONS[s as ServiceId];
                          return I ? <I key={s} size={16} strokeWidth={1.75} aria-hidden /> : null;
                        })}
                      </span>
                    </td>
                    <td className="nowrap">{l.monthlyMin !== null && l.monthlyMax !== null ? moneyRange({ min: l.monthlyMin, max: l.monthlyMax }) : '—'}</td>
                    <td>
                      <span className={cx('pill', l.requestType === 'visit' && 'pill--visit')}>{t.staff.type[l.requestType]}</span>
                    </td>
                    <td>
                      <SelectBox label={`${t.staff.cols.status}: ${l.companyName}`} value={l.status} onChange={(v) => void patch(l, { status: v as LeadStatus })} tone={l.status}>
                        {LEAD_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {t.staff.status[s]}
                          </option>
                        ))}
                      </SelectBox>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && <LeadDrawer lead={open} onClose={() => setOpenId(null)} onSave={(notes) => patch(open, { staffNotes: notes })} fmtDate={fmtDate} />}
    </>
  );
}

function SelectBox({
  label,
  value,
  onChange,
  children,
  tone,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  tone?: string;
}) {
  const id = useId();
  return (
    <div className={cx('select-field', tone && `status--${tone}`)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="select">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {children}
        </select>
        <ChevronDown size={16} aria-hidden />
      </div>
    </div>
  );
}

function LeadDrawer({ lead, onClose, onSave, fmtDate }: { lead: StaffLead; onClose: () => void; onSave: (notes: string) => Promise<boolean>; fmtDate: (s: string) => string }) {
  const { t, lang, moneyRange, num } = useI18n();
  const [notes, setNotes] = useState(lead.staffNotes);
  const [saved, setSaved] = useState(false);
  const a = lead.answers;
  const id = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const area = a.space.areaKnown ? `${num(a.space.area ?? 0)} m²` : a.space.areaRange ? t.space.ranges[a.space.areaRange] : '—';
  const people = a.space.peopleKnown ? String(a.space.people ?? '—') : t.summary.unknown;

  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
      <div className="drawer__scrim" onClick={onClose} />
      <div className="drawer__panel">
        <div className="drawer__head">
          <div>
            <h2 id={`${id}-title`} className="drawer__title">
              {lead.companyName}
            </h2>
            <p className="muted">
              {fmtDate(lead.createdAt)} · {t.staff.type[lead.requestType]} · {t.staff.status[lead.status]}
              {lead.booth && ` · ${t.staff.detail.booth}`}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t.common.close} autoFocus>
            <X size={20} aria-hidden />
          </button>
        </div>

        <dl className="kv">
          <h3 className="kv__h">{t.staff.detail.contact}</h3>
          <div>
            <dt>{t.contact.fullName}</dt>
            <dd>
              {lead.contact.fullName}
              {lead.contact.role && ` · ${lead.contact.role}`}
            </dd>
          </div>
          {lead.contact.email && (
            <div>
              <dt>{t.contact.email}</dt>
              <dd>
                <a href={`mailto:${lead.contact.email}`}>{lead.contact.email}</a>
              </dd>
            </div>
          )}
          {lead.contact.phone && (
            <div>
              <dt>{t.contact.phone}</dt>
              <dd>
                <a href={`tel:${lead.contact.phone.replace(/\s/g, '')}`}>{lead.contact.phone}</a>
              </dd>
            </div>
          )}
          <div>
            <dt>{t.staff.detail.preferred}</dt>
            <dd>{t.contact.methods[lead.contact.preferredContact as 'email'] ?? lead.contact.preferredContact}</dd>
          </div>
          <div>
            <dt>{t.staff.detail.marketing}</dt>
            <dd>{lead.contact.marketingOptIn ? '✓' : '—'}</dd>
          </div>

          <h3 className="kv__h">{t.staff.detail.workspace}</h3>
          <div>
            <dt>{t.summary.company}</dt>
            <dd>
              {t.company.types[a.company.workspaceType ?? 'other'].label} · {a.company.city}
            </dd>
          </div>
          <div>
            <dt>{t.summary.space}</dt>
            <dd>{area}</dd>
          </div>
          <div>
            <dt>{t.summary.people}</dt>
            <dd>{people}</dd>
          </div>
          <div>
            <dt>{t.summary.facilities}</dt>
            <dd>
              {a.facilities.selected
                .map((f) => {
                  const l = t.facilities.items[f].label;
                  return f === 'kitchen' ? `${l} ×${a.facilities.kitchens}` : f === 'toilets' ? `${l} ×${a.facilities.toilets}` : l;
                })
                .join(', ')}
            </dd>
          </div>
          {a.current.arrangement && (
            <div>
              <dt>{t.staff.detail.arrangement}</dt>
              <dd>{t.current.options[a.current.arrangement].label}</dd>
            </div>
          )}
          {a.current.whoGetsCalled && (
            <div>
              <dt>{t.staff.detail.whoCalled}</dt>
              <dd>{t.current.who[a.current.whoGetsCalled]}</dd>
            </div>
          )}

          <h3 className="kv__h">{t.staff.detail.plan}</h3>
          <div>
            <dt>{t.staff.detail.tier}</dt>
            <dd>
              {t.results.tiers[lead.planTier as 'basic']?.name ?? lead.planTier}
              {lead.planCustomized && ` (${t.staff.detail.customized})`}
            </dd>
          </div>
          <div>
            <dt>{t.summary.services}</dt>
            <dd>{lead.services.map((s) => SERVICES[s as ServiceId]?.name[lang] ?? s).join(', ')}</dd>
          </div>
          <div>
            <dt>{t.staff.cols.estimate}</dt>
            <dd>
              {lead.monthlyMin !== null && lead.monthlyMax !== null ? `${moneyRange({ min: lead.monthlyMin, max: lead.monthlyMax })} ${t.results.perMonth}` : '—'}
              {lead.estimate?.oneTime && ` · ${t.results.oneTime(moneyRange(lead.estimate.oneTime))}`}
            </dd>
          </div>
          <div>
            <dt>{t.staff.detail.pricing}</dt>
            <dd>
              {lead.pricingId ?? '—'} {lead.pricingStatus === 'demo' && <span className="demo-label__tag">{t.common.demoPrices}</span>}
            </dd>
          </div>
          {lead.contact.note && (
            <>
              <h3 className="kv__h">{t.staff.detail.visitorNote}</h3>
              <p className="kv__note">{lead.contact.note}</p>
            </>
          )}
        </dl>

        <div className="stack-2">
          <label className="field__label" htmlFor={`${id}-notes`}>
            {t.staff.detail.staffNotes}
          </label>
          <div className="input input--area">
            <textarea
              id={`${id}-notes`}
              rows={4}
              maxLength={4000}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          <div className="row-between">
            <span className="muted" role="status">
              {saved ? t.staff.detail.saved : ''}
            </span>
            <Button variant="secondary" onClick={async () => setSaved(await onSave(notes))} disabled={notes === lead.staffNotes}>
              {t.staff.detail.save}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
