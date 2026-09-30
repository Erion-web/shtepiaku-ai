import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Check, LoaderCircle, Minus, Plus, CircleAlert, Info, CircleCheck } from 'lucide-react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

// ── Button ──────────────────────────────────────────────────────────────────
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'quiet';
  size?: 'md' | 'lg';
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  block?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, iconRight, loading, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('btn', `btn--${variant}`, `btn--${size}`, block && 'btn--block', loading && 'is-loading', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoaderCircle className="btn__spin" size={18} aria-hidden /> : icon}
      <span>{children}</span>
      {iconRight}
    </button>
  );
});

// ── Field wrapper ───────────────────────────────────────────────────────────
export function Field({
  label,
  hint,
  error,
  optional,
  optionalLabel,
  children,
  id,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  optionalLabel?: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <div className={cx('field', error && 'has-error')}>
      <label className="field__label" htmlFor={id}>
        {label}
        {optional && <span className="tag">{optionalLabel}</span>}
      </label>
      {hint && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {children}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="field__error" id={id} role="alert">
      <CircleAlert size={16} aria-hidden />
      {message}
    </p>
  );
}

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & { suffix?: string; invalid?: boolean; describedBy?: string };

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput({ suffix, invalid, describedBy, className, ...rest }, ref) {
  return (
    <div className={cx('input', invalid && 'is-invalid', className)}>
      <input ref={ref} aria-invalid={invalid || undefined} aria-describedby={describedBy} {...rest} />
      {suffix && (
        <span className="input__suffix" aria-hidden>
          {suffix}
        </span>
      )}
    </div>
  );
});

// ── Choice group (fieldset) ─────────────────────────────────────────────────
export function ChoiceGroup({
  legend,
  hint,
  error,
  optional,
  optionalLabel,
  children,
  layout = 'chips',
  className,
}: {
  legend: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  optionalLabel?: string;
  children: ReactNode;
  layout?: 'chips' | 'cards' | 'cards-2' | 'list';
  className?: string;
}) {
  const id = useId();
  return (
    <fieldset className={cx('group', error && 'has-error', className)} aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="group__legend">
        {legend}
        {optional && <span className="tag">{optionalLabel}</span>}
      </legend>
      {hint && <p className="group__hint">{hint}</p>}
      <div className={cx('group__items', `group__items--${layout}`)}>{children}</div>
      <FieldError id={`${id}-err`} message={error} />
    </fieldset>
  );
}

// ── Chip (radio / checkbox) ─────────────────────────────────────────────────
export function Chip({
  type = 'radio',
  name,
  checked,
  onChange,
  children,
  disabled,
}: {
  type?: 'radio' | 'checkbox';
  name: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cx('chip', checked && 'is-checked', disabled && 'is-disabled')}>
      <input className="sr-only" type={type} name={name} checked={checked} onChange={onChange} disabled={disabled} />
      {type === 'checkbox' && (
        <span className="chip__check" aria-hidden>
          <Check size={14} strokeWidth={3} />
        </span>
      )}
      <span>{children}</span>
    </label>
  );
}

// ── Option card (radio / checkbox) ──────────────────────────────────────────
export function OptionCard({
  type = 'radio',
  name,
  checked,
  onChange,
  icon,
  title,
  hint,
  note,
  disabled,
  tone,
}: {
  type?: 'radio' | 'checkbox';
  name: string;
  checked: boolean;
  onChange: () => void;
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  note?: ReactNode;
  disabled?: boolean;
  tone?: 'eco';
}) {
  return (
    <label className={cx('option', checked && 'is-checked', disabled && 'is-disabled', tone && `option--${tone}`)}>
      <input className="sr-only" type={type} name={name} checked={checked} onChange={onChange} disabled={disabled} />
      {icon && (
        <span className="option__icon" aria-hidden>
          {icon}
        </span>
      )}
      <span className="option__body">
        <span className="option__title">{title}</span>
        {hint && <span className="option__hint">{hint}</span>}
        {note && <span className="option__note">{note}</span>}
      </span>
      <span className={cx('option__mark', type === 'radio' && 'option__mark--radio')} aria-hidden>
        <Check size={14} strokeWidth={3} />
      </span>
    </label>
  );
}

// ── Counter ─────────────────────────────────────────────────────────────────
export function Counter({
  id,
  label,
  value,
  min = 0,
  max = 99,
  onChange,
  decLabel,
  incLabel,
}: {
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
  decLabel: string;
  incLabel: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="counter">
      <label htmlFor={id} className="counter__label">
        {label}
      </label>
      <div className="counter__controls">
        <button type="button" className="counter__btn" onClick={() => onChange(clamp(value - 1))} disabled={value <= min} aria-label={`${decLabel}: ${label}`}>
          <Minus size={18} aria-hidden />
        </button>
        <input
          id={id}
          className="counter__input"
          inputMode="numeric"
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
            onChange(Number.isNaN(n) ? min : clamp(n));
          }}
        />
        <button type="button" className="counter__btn" onClick={() => onChange(clamp(value + 1))} disabled={value >= max} aria-label={`${incLabel}: ${label}`}>
          <Plus size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ── Segmented control ───────────────────────────────────────────────────────
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
  hideLabel,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; ariaLabel?: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  hideLabel?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className={cx('segmented', `segmented--${size}`)}>
      <legend className={hideLabel ? 'sr-only' : 'group__legend'}>{label}</legend>
      <div className="segmented__track">
        {options.map((o) => (
          <label key={o.value} className={cx('segmented__opt', value === o.value && 'is-checked')}>
            <input className="sr-only" type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} aria-label={o.ariaLabel} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ── Switch ──────────────────────────────────────────────────────────────────
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={cx('switch', checked && 'is-on')} onClick={() => onChange(!checked)} disabled={disabled}>
      <span className="switch__thumb" />
    </button>
  );
}

// ── Alert ───────────────────────────────────────────────────────────────────
export function Alert({ tone = 'info', children, title, action }: { tone?: 'info' | 'error' | 'success' | 'demo'; children?: ReactNode; title?: ReactNode; action?: ReactNode }) {
  const Icon = tone === 'error' ? CircleAlert : tone === 'success' ? CircleCheck : Info;
  return (
    <div className={cx('alert', `alert--${tone}`)} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={20} aria-hidden className="alert__icon" />
      <div className="alert__body">
        {title && <p className="alert__title">{title}</p>}
        {children && <div className="alert__text">{children}</div>}
      </div>
      {action}
    </div>
  );
}

// ── Modal (native dialog: focus trap, Esc, inert background) ────────────────
export function Modal({
  open,
  onClose,
  title,
  children,
  actions,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  actions: ReactNode;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={labelledBy ?? titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <div className="modal__inner">
          <h2 className="modal__title" id={titleId}>
            {title}
          </h2>
          {children && <div className="modal__body">{children}</div>}
          <div className="modal__actions">{actions}</div>
        </div>
      )}
    </dialog>
  );
}

// ── Heading that receives focus after navigation ────────────────────────────
export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className={cx('page-title', className)}>
      {children}
    </h1>
  );
}
