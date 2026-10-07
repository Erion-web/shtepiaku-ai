import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { CircleAlert, History, RotateCcw, Save } from 'lucide-react';
import { useI18n } from '../../i18n';
import { api, ApiError, type StaffPricing } from '../../lib/api';
import { Alert, Button, Modal, Segmented, TextInput, cx } from '../../components/ui';
import { estimate, type Money } from '../../../shared/pricing/engine';
import { fromStored, validateStoredPricing, type StoredPricing } from '../../../shared/pricing/stored';
import type { PlanConfig, WorkspaceProfile } from '../../../shared/types';
import { buildSections, getAt, normaliseCities, setAt, type Field } from './pricingFields';

type Status = 'demo' | 'approved';
const NAME_KEY = 'sh_staff_name';

// ── Example offices used for the live preview ───────────────────────────────
const office = (area: number, people: number, kitchens: number, toilets: number, facilities: WorkspaceProfile['facilities']): WorkspaceProfile => ({
  type: 'office',
  city: 'Prishtinë',
  area: { min: area, max: area, exact: true },
  people: { known: true, min: people, max: people },
  facilities,
  kitchens,
  toilets,
});
const SCENARIOS: { id: 'small' | 'medium' | 'large'; ws: WorkspaceProfile; plan: PlanConfig }[] = [
  {
    id: 'small',
    ws: office(80, 6, 1, 1, ['work', 'kitchen', 'toilets']),
    plan: { cleaning: { frequency: 2, timing: 'during' }, hygiene: { mode: 'recurring' } },
  },
  {
    id: 'medium',
    ws: office(220, 18, 1, 2, ['work', 'meeting', 'kitchen', 'toilets', 'reception']),
    plan: { cleaning: { frequency: 3, timing: 'outside' }, hygiene: { mode: 'recurring' }, scenting: { zones: ['reception', 'toilets'], coverageM2: null } },
  },
  {
    id: 'large',
    ws: office(600, 50, 2, 6, ['work', 'meeting', 'kitchen', 'toilets', 'reception']),
    plan: { cleaning: { frequency: 5, timing: 'outside' }, hygiene: { mode: 'recurring' }, maintenance: { mode: 'preventive' }, ddd: { mode: 'prevention', issues: [] } },
  },
];

// ── Number display helpers ──────────────────────────────────────────────────
const toDisplay = (kind: Field['kind'], v: number) => (kind === 'percent' || kind === 'factor' ? Number((v * 100).toFixed(4)) : v);
const fromDisplay = (kind: Field['kind'], v: number) => (kind === 'percent' || kind === 'factor' ? v / 100 : v);
const parseNum = (s: string): number | null => {
  const t = s.trim().replace(',', '.');
  if (t === '' || !/^-?\d*\.?\d+$/.test(t)) return null;
  return Number(t);
};
const show = (n: unknown) => (typeof n === 'number' ? String(Number(n.toFixed(4))) : '—');

function safeStorage(fn: () => string | null | void) {
  try {
    return fn();
  } catch {
    return null;
  }
}

export function PricingEditor({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { t, lang } = useI18n();
  const P = t.staff.pricing;
  const [data, setData] = useState<StaffPricing | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState<StoredPricing | null>(null);
  const [status, setStatus] = useState<Status>('demo');
  const [badText, setBadText] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [author, setAuthor] = useState(() => safeStorage(() => localStorage.getItem(NAME_KEY)) ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: 'approve' } | { kind: 'restore'; version: number; status: Status }>(null);
  const [formKey, setFormKey] = useState(0);
  const ids = useId();

  const load = useCallback(async () => {
    try {
      const d = await api.staff.pricing();
      setData(d);
      setDraft(normaliseCities(d.active));
      setStatus(d.active.status);
      setBadText(new Set());
      setFormKey((k) => k + 1);
      setLoadError(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onUnauthorized();
      else setLoadError(true);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const baseline = useMemo(() => (data ? normaliseCities(data.active) : null), [data]);
  const sections = useMemo(() => (draft ? buildSections(draft) : []), [draft]);
  const allFields = useMemo(() => sections.flatMap((s) => s.fields), [sections]);

  const validation = useMemo(() => (draft ? validateStoredPricing({ ...draft, status }) : null), [draft, status]);
  const issueFor = useMemo(() => {
    const map = new Map<string, string>();
    if (validation && !validation.ok)
      for (const issue of validation.issues) {
        const field = allFields.find((f) => issue.path === f.key || issue.path.startsWith(f.key + '.'));
        if (field && !map.has(field.key)) map.set(field.key, issue.message === 'low_above_high' ? P.lowAboveHigh : P.outOfRange);
      }
    return map;
  }, [validation, allFields, P]);

  const changed = useMemo(
    () => new Set(allFields.filter((f) => baseline && draft && JSON.stringify(getAt(draft, f.path) ?? 0) !== JSON.stringify(getAt(baseline, f.path) ?? 0)).map((f) => f.key)),
    [allFields, draft, baseline],
  );
  const statusChanged = data ? status !== data.active.status : false;
  const dirty = changed.size > 0 || statusChanged;
  const valid = Boolean(validation?.ok) && badText.size === 0;

  const setValue = (field: Field, value: unknown) => setDraft((d) => (d ? setAt(d, field.path, value) : d));
  const markText = (fieldKey: string, ok: boolean) =>
    setBadText((s) => {
      if (ok === !s.has(fieldKey)) return s;
      const n = new Set(s);
      if (ok) n.delete(fieldKey);
      else n.add(fieldKey);
      return n;
    });

  const doSave = async (body: Parameters<typeof api.staff.savePricing>[0]) => {
    setSaving(true);
    setMessage(null);
    safeStorage(() => localStorage.setItem(NAME_KEY, author.trim()));
    try {
      const r = await api.staff.savePricing(body);
      setNote('');
      await load();
      setMessage({ tone: 'success', text: P.saved(r.version) });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onUnauthorized();
      setMessage({ tone: 'error', text: e instanceof ApiError && e.code === 'invalid_pricing' ? P.invalid : P.saveError });
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (!draft || !data) return;
    if (!valid) {
      setMessage({ tone: 'error', text: P.invalid });
      return;
    }
    const becomesApproved = status === 'approved' && (data.active.status !== 'approved' || data.version === null);
    if (becomesApproved) setConfirm({ kind: 'approve' });
    else void doSave({ status, note, author, config: { ...draft, status } });
  };

  const preview = useMemo(() => {
    if (!data || !draft) return null;
    const now = fromStored(data.active);
    const next = valid ? fromStored({ ...draft, status }) : null;
    return SCENARIOS.map((s) => ({ ...s, now: estimate(s.ws, s.plan, now), next: next ? estimate(s.ws, s.plan, next) : null }));
  }, [data, draft, status, valid]);

  if (loadError) return <Alert tone="error">{P.loadError}</Alert>;
  if (!data || !draft || !baseline) return <p className="muted">{t.common.loading}</p>;

  return (
    <div className="pe">
      <div className="pe__head">
        <h2 className="pe__title">{P.title}</h2>
        <p className="muted">{P.intro}</p>
        {data.version === null && <Alert tone="info">{P.usingBundled}</Alert>}
        {data.pricingMode === 'live' && status === 'demo' && <Alert tone="info">{P.liveModeNote}</Alert>}
        <nav className="pe__jump" aria-label={P.jump}>
          {sections.map((s) => (
            <a key={s.id} href={`#pe-${s.id}`} className="preset">
              {s.title[lang]}
            </a>
          ))}
        </nav>
      </div>

      <div className="pe__layout">
        <div className="pe__main" key={formKey}>
          <p className="note">{P.lowHigh}</p>
          {sections.map((s) => (
            <section key={s.id} id={`pe-${s.id}`} className="card pe__section" aria-labelledby={`pe-${s.id}-title`}>
              <h2 className="section-title" id={`pe-${s.id}-title`}>
                {s.title[lang]}
              </h2>
              <p className="muted pe__intro">{s.intro[lang]}</p>
              <div className="pe__rows">
                {s.fields.map((f) => (
                  <FieldRow
                    key={f.key}
                    field={f}
                    value={getAt(draft, f.path)}
                    before={getAt(baseline, f.path)}
                    changed={changed.has(f.key)}
                    error={issueFor.get(f.key)}
                    onValue={(v) => setValue(f, v)}
                    onTextValid={(ok) => markText(f.key, ok)}
                  />
                ))}
              </div>
            </section>
          ))}
          <HistoryCard data={data} onRestore={(version, st) => setConfirm({ kind: 'restore', version, status: st })} />
        </div>

        <aside className="pe__side">
          <div className="pe__sticky">
            <section className="card pe__save" aria-label={P.save}>
              <p className={cx('pe__dirty', dirty && 'is-dirty')} role="status">
                {dirty ? P.changed(changed.size + (statusChanged ? 1 : 0)) : P.noChanges}
              </p>
              <Segmented
                label={P.status}
                value={status}
                onChange={(v) => setStatus(v)}
                options={[
                  { value: 'demo', label: P.statusDemo },
                  { value: 'approved', label: P.statusApproved },
                ]}
              />
              <p className="note">{status === 'demo' ? P.statusDemoHint : P.statusApprovedHint}</p>
              {dirty && (
                <>
                  <label className="field__label" htmlFor={`${ids}-note`}>
                    {P.note} <span className="tag">{t.common.optional}</span>
                  </label>
                  <TextInput id={`${ids}-note`} value={note} maxLength={500} placeholder={P.notePlaceholder} onChange={(e) => setNote(e.target.value)} />
                  <label className="field__label" htmlFor={`${ids}-author`}>
                    {P.author} <span className="tag">{t.common.optional}</span>
                  </label>
                  <TextInput id={`${ids}-author`} value={author} maxLength={80} autoComplete="name" onChange={(e) => setAuthor(e.target.value)} />
                </>
              )}
              {message && <Alert tone={message.tone}>{message.text}</Alert>}
              <div className="pe__actions">
                <Button size="lg" block icon={<Save size={18} aria-hidden />} onClick={save} loading={saving} disabled={!dirty}>
                  {saving ? P.saving : P.save}
                </Button>
                {dirty && (
                  <Button variant="ghost" block icon={<RotateCcw size={18} aria-hidden />} onClick={() => void load()} disabled={saving}>
                    {P.discard}
                  </Button>
                )}
              </div>
            </section>

            {preview && <PreviewCard rows={preview} valid={valid} />}
          </div>
        </aside>
      </div>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'restore' ? P.restoreTitle(confirm.version) : P.confirmApprovedTitle}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              {t.common.cancel}
            </Button>
            <Button
              onClick={() => {
                const c = confirm;
                setConfirm(null);
                if (!c || !draft) return;
                if (c.kind === 'approve') void doSave({ status, note, author, config: { ...draft, status } });
                else void doSave({ status: c.status, note: note || `${P.restore} v${c.version}`, author, restoreOf: c.version });
              }}
            >
              {confirm?.kind === 'restore' ? P.restoreCta : P.confirmApprovedCta}
            </Button>
          </>
        }
      >
        <p>{confirm?.kind === 'restore' ? P.restoreBody : P.confirmApprovedBody}</p>
      </Modal>
    </div>
  );
}

// ── One editable row ────────────────────────────────────────────────────────
function FieldRow({
  field,
  value,
  before,
  changed,
  error,
  onValue,
  onTextValid,
}: {
  field: Field;
  value: unknown;
  before: unknown;
  changed: boolean;
  error?: string;
  onValue: (v: unknown) => void;
  onTextValid: (ok: boolean) => void;
}) {
  const { t, lang } = useI18n();
  const P = t.staff.pricing;
  const id = useId();
  const [badBoxes, setBadBoxes] = useState<Set<string>>(new Set());
  const textErr = badBoxes.size > 0;
  const report = (box: string) => (ok: boolean) =>
    setBadBoxes((prev) => {
      if (ok === !prev.has(box)) return prev;
      const next = new Set(prev);
      if (ok) next.delete(box);
      else next.add(box);
      return next;
    });
  useEffect(() => onTextValid(!textErr), [textErr]); // eslint-disable-line react-hooks/exhaustive-deps
  // What the person is typing right now matters most: an unreadable number outranks older validation errors.
  const shown = textErr ? P.notNumber : error;
  const unit = field.unit?.[lang];

  const beforeText = (() => {
    if (field.kind === 'bool') return before ? P.yes : P.no;
    if (field.kind === 'range' && Array.isArray(before)) return `${show(before[0])}–${show(before[1])}`;
    return show(toDisplay(field.kind, typeof before === 'number' ? before : 0));
  })();

  return (
    <div className={cx('pe__row', changed && 'is-changed', shown && 'has-error')}>
      <div className="pe__label">
        <label htmlFor={field.kind === 'bool' ? undefined : `${id}-a`} id={`${id}-label`}>
          {field.label[lang]}
        </label>
        {unit && field.kind !== 'bool' && <span className="pe__unit">{unit}</span>}
        {field.hint && <span className="pe__hint">{field.hint[lang]}</span>}
      </div>
      <div className="pe__inputs">
        {field.kind === 'bool' ? (
          <Segmented
            label={field.label[lang]}
            hideLabel
            size="sm"
            value={value ? 'yes' : 'no'}
            onChange={(v) => onValue(v === 'yes')}
            options={[
              { value: 'no', label: P.no },
              { value: 'yes', label: P.yes },
            ]}
          />
        ) : field.kind === 'range' ? (
          <>
            <NumberBox
              id={`${id}-a`}
              ariaLabel={`${field.label[lang]}: ${P.low}`}
              caption={P.low}
              value={(value as [number, number])[0]}
              onNumber={(n) => onValue([n, (value as [number, number])[1]])}
              onValid={report('low')}
              invalid={Boolean(shown)}
            />
            <span className="pe__dash" aria-hidden>
              –
            </span>
            <NumberBox
              id={`${id}-b`}
              ariaLabel={`${field.label[lang]}: ${P.high}`}
              caption={P.high}
              value={(value as [number, number])[1]}
              onNumber={(n) => onValue([(value as [number, number])[0], n])}
              onValid={report('high')}
              invalid={Boolean(shown)}
            />
          </>
        ) : (
          <NumberBox
            id={`${id}-a`}
            ariaLabel={field.label[lang]}
            value={toDisplay(field.kind, typeof value === 'number' ? value : 0)}
            integer={field.kind === 'int'}
            onNumber={(n) => onValue(fromDisplay(field.kind, n))}
            onValid={report('value')}
            invalid={Boolean(shown)}
          />
        )}
      </div>
      {changed && <p className="pe__was">{P.was(beforeText + (unit && field.kind !== 'bool' ? ` ${unit}` : ''))}</p>}
      {shown && (
        <p className="field__error pe__err" role="alert">
          <CircleAlert size={16} aria-hidden />
          {shown}
        </p>
      )}
    </div>
  );
}

function NumberBox({
  id,
  ariaLabel,
  caption,
  value,
  onNumber,
  onValid,
  invalid,
  integer,
}: {
  id: string;
  ariaLabel: string;
  caption?: string;
  value: number;
  onNumber: (n: number) => void;
  onValid: (ok: boolean) => void;
  invalid: boolean;
  integer?: boolean;
}) {
  const [text, setText] = useState(() => show(value));
  return (
    <span className="pe__num">
      {caption && (
        <span className="pe__cap" aria-hidden>
          {caption}
        </span>
      )}
      <input
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseNum(e.target.value);
          const ok = n !== null && n >= 0 && (!integer || Number.isInteger(n));
          onValid(ok);
          if (ok) onNumber(n);
        }}
      />
    </span>
  );
}

// ── Preview of example offices ──────────────────────────────────────────────
function PreviewCard({ rows, valid }: { rows: { id: 'small' | 'medium' | 'large'; now: ReturnType<typeof estimate>; next: ReturnType<typeof estimate> | null }[]; valid: boolean }) {
  const { t, moneyRange } = useI18n();
  const P = t.staff.pricing;
  const fmt = (e: ReturnType<typeof estimate>) => {
    const parts: string[] = [];
    if (e.monthly) parts.push(`${moneyRange(e.monthly)} ${P.monthly}`);
    if (e.oneTime) parts.push(`+ ${moneyRange(e.oneTime)} ${P.once}`);
    return parts.join(' ') || '—';
  };
  const diff = (a: Money | null, b: Money | null) => (a && b ? (b.min + b.max) / 2 - (a.min + a.max) / 2 : 0);
  return (
    <section className="card pe__preview" aria-labelledby="pe-preview-title">
      <h2 className="section-title" id="pe-preview-title">
        {P.preview}
      </h2>
      <p className="note">{P.previewIntro}</p>
      {!valid && <p className="note pe__err-note">{P.previewInvalid}</p>}
      <ul className="pe__scen">
        {rows.map((r) => {
          const d = r.next ? diff(r.now.monthly, r.next.monthly) : 0;
          return (
            <li key={r.id}>
              <p className="pe__scen-name">{P.scenarios[r.id].name}</p>
              <p className="pe__scen-desc">{P.scenarios[r.id].desc}</p>
              <dl className="pe__scen-vals">
                <div>
                  <dt>{P.previewNow}</dt>
                  <dd>{fmt(r.now)}</dd>
                </div>
                {r.next && (
                  <div className={cx(d > 0.5 && 'is-up', d < -0.5 && 'is-down')}>
                    <dt>{P.previewNew}</dt>
                    <dd>{fmt(r.next)}</dd>
                  </div>
                )}
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Version history ─────────────────────────────────────────────────────────
function HistoryCard({ data, onRestore }: { data: StaffPricing; onRestore: (version: number, status: Status) => void }) {
  const { t, lang } = useI18n();
  const P = t.staff.pricing;
  const fmtDate = (iso: string) => new Intl.DateTimeFormat(lang === 'sq' ? 'sq-AL' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  return (
    <section className="card pe__section" aria-labelledby="pe-history-title">
      <h2 className="section-title pe__hist-title" id="pe-history-title">
        <History size={20} aria-hidden /> {P.history}
      </h2>
      {data.history.length === 0 ? (
        <p className="muted">{P.historyEmpty}</p>
      ) : (
        <ul className="pe__hist">
          {data.history.map((h) => (
            <li key={h.version}>
              <div>
                <p className="pe__hist-line">
                  <strong>v{h.version}</strong>
                  <span className={cx('pill', h.status === 'approved' && 'pill--ok')}>{h.status === 'approved' ? P.statusApproved : P.statusDemo}</span>
                  {h.version === data.version && <span className="pill pill--visit">{P.active}</span>}
                </p>
                <p className="pe__hist-meta">
                  {fmtDate(h.createdAt)}
                  {h.author && ` · ${P.by(h.author)}`}
                  {h.note && ` · ${h.note}`}
                </p>
              </div>
              {h.version !== data.version && (
                <Button variant="secondary" icon={<RotateCcw size={16} aria-hidden />} onClick={() => onRestore(h.version, h.status)}>
                  {P.restore}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
