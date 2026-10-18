/**
 * Shared UI primitives for the ChannelAI design system.
 * Plain components + class names; styling lives in styles/*.css.
 */

import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { relativeTime } from '../lib/format'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// ---------------------------------------------------------------- Buttons ---

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
}

export function Button({ variant = 'secondary', size = 'md', className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx('btn', `btn--${variant}`, size === 'sm' && 'btn--sm', className)}
      {...rest}
    />
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
}

export function IconButton({ label, className, ...rest }: IconButtonProps) {
  return <button type="button" className={cx('btn-icon', className)} aria-label={label} title={label} {...rest} />
}

// ------------------------------------------------------------------ Cards ---

interface CardProps {
  title?: string
  subtitle?: string
  icon?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  flush?: boolean
}

export function Card({ title, subtitle, icon, actions, children, className, flush }: CardProps) {
  const hasHead = Boolean(title || actions)
  return (
    <section className={cx('card', flush && 'card--flush', className)}>
      {hasHead && (
        <header className="card__head">
          <div className="card__title-wrap">
            {icon}
            <div>
              {title && <h2 className="card__title">{title}</h2>}
              {subtitle && <p className="card__subtitle">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      <div className={cx(!flush && 'card__body')}>{children}</div>
    </section>
  )
}

interface StatCardProps {
  icon: ReactNode
  label: string
  value: string | number
  hint: string
}

export function StatCard({ icon, label, value, hint }: StatCardProps) {
  return (
    <div className="stat">
      <div className="stat__icon">{icon}</div>
      <div className="stat__meta">
        <span className="stat__label">{label}</span>
        <span className="stat__value">{value}</span>
        <span className="stat__hint">{hint}</span>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- Badges ---

export function Badge({
  tone = 'muted',
  children,
  className,
}: {
  tone?: 'muted' | 'accent' | 'ok' | 'warn' | 'danger' | 'processing'
  children: ReactNode
  className?: string
}) {
  return <span className={cx('badge', `badge--${tone}`, className)}>{children}</span>
}

export function StatusBadge({ status }: { status: 'queued' | 'processing' | 'done' }) {
  if (status === 'done') return <Badge tone="ok">Completed · simulated</Badge>
  if (status === 'processing') return <Badge tone="processing">Processing · simulated</Badge>
  return <Badge tone="muted">Queued</Badge>
}

// ----------------------------------------------------------- Page headers ---

interface PageHeaderProps {
  title: string
  description: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="page-head">
      <div>
        <h1 className="page-head__title">{title}</h1>
        <p className="page-head__desc">{description}</p>
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </header>
  )
}

// ------------------------------------------------------------ Empty states ---

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty" role="status">
      <div className="empty__icon">{icon}</div>
      <h3 className="empty__title">{title}</h3>
      <p className="empty__desc">{description}</p>
      {action && <div className="empty__action">{action}</div>}
    </div>
  )
}

// ---------------------------------------------------------------- Fields ---

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  error?: string | null
  required?: boolean
  children: ReactNode
}) {
  return (
    <div className={cx('field', error && 'field--error')}>
      <label className="field__label" htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="field__req" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="field__hint">{hint}</p>}
      {error && (
        <p className="field__msg" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

// ------------------------------------------------------------- Segmented ---

interface SegmentedOption<T extends string | number> {
  value: T
  label: string
  hint?: string
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (next: T) => void
  ariaLabel: string
  className?: string
}) {
  const id = useId()
  return (
    <div className={cx('segmented', className)} role="radiogroup" aria-label={ariaLabel} id={id}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={cx('segmented__opt', active && 'is-active')}
            onClick={() => !active && onChange(option.value)}
          >
            <span>{option.label}</span>
            {option.hint && <small>{option.hint}</small>}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: string
}) {
  const toggleId = useId()
  return (
    <div className="toggle-row">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={toggleId}
        className={cx('toggle', checked && 'is-on')}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle__knob" aria-hidden="true" />
      </button>
      <div className="toggle-row__text">
        <span id={toggleId} className="toggle-row__label">
          {label}
        </span>
        {hint && <small className="toggle-row__hint">{hint}</small>}
      </div>
    </div>
  )
}

// --------------------------------------------------------------- Progress ---

export function Progress({ value, label }: { value: number; label?: string }) {
  const clamped = Math.round(value)
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Progress'}
    >
      <div className="progress__bar" style={{ width: `${clamped}%` }} />
    </div>
  )
}

// ----------------------------------------------------------------- Modal ---

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const modalRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return undefined
    const dialog = modalRef.current
    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusables = (): HTMLElement[] => {
      if (!dialog) return []
      return Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null)
    }
    // Initial focus: first control, else the dialog itself.
    ;(focusables()[0] ?? dialog)?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        dialog?.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement
      if (event.shiftKey) {
        if (current === first || current === dialog) {
          event.preventDefault()
          last.focus()
        }
      } else if (current === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={modalRef}
        className="modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="modal__head">
          <h2 className="modal__title" id={titleId}>
            {title}
          </h2>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Notes ---

/** Small, clearly labelled demo/simulation notice. */
export function DemoNote({ children }: { children: ReactNode }) {
  return (
    <p className="demo-note">
      <Info size={14} aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

/** Relative timestamp with a stable tooltip-ish title. */
export function RelTime({ at }: { at: number }) {
  return (
    <time className="reltime" dateTime={new Date(at).toISOString()} title={new Date(at).toLocaleString()}>
      {relativeTime(at)}
    </time>
  )
}

// ---------------------------------------------------------------- Toaster ---

export function Toaster() {
  const { toasts, dismissToast } = useApp()
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((item) => (
        <div key={item.id} className={cx('toast', `toast--${item.kind}`)}>
          <span className="toast__icon" aria-hidden="true">
            {item.kind === 'success' && <CheckCircle2 size={17} />}
            {item.kind === 'error' && <CircleAlert size={17} />}
            {item.kind === 'info' && <Info size={17} />}
          </span>
          <div className="toast__text">
            <strong>{item.title}</strong>
            {item.detail && <span>{item.detail}</span>}
          </div>
          <IconButton label="Dismiss notification" className="toast__close" onClick={() => dismissToast(item.id)}>
            <X size={14} aria-hidden="true" />
          </IconButton>
        </div>
      ))}
    </div>
  )
}
