import type { LucideIcon } from 'lucide-react'

interface KpiGridProps {
  children: React.ReactNode
  /** Desktop columns. Mobile is always 2-up. Default 4. */
  columns?: 2 | 3 | 4 | 5 | 6
  className?: string
}

const COL_CLASS: Record<number, string> = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
  6: 'md:grid-cols-6',
}

export function KpiGrid({ children, columns = 4, className = '' }: KpiGridProps) {
  return (
    <div className={`grid grid-cols-2 ${COL_CLASS[columns]} gap-3 ${className}`}>
      {children}
    </div>
  )
}

interface KpiCardProps {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: LucideIcon
  tone?: 'default' | 'positive' | 'negative' | 'warning' | 'accent'
  onClick?: () => void
}

const TONE_VALUE_COLOR: Record<string, string> = {
  default: 'var(--so-text-primary)',
  positive: 'var(--so-success, #4a905c)',
  negative: 'var(--so-danger-text)',
  warning: '#b76200',
  accent: 'var(--so-accent)',
}

export function KpiCard({ label, value, hint, icon: Icon, tone = 'default', onClick }: KpiCardProps) {
  const interactive = !!onClick
  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.() } : undefined}
      className="rounded-xl px-4 py-3.5 flex flex-col gap-1.5 transition-shadow"
      style={{
        background: 'var(--so-surface)',
        border: '1px solid var(--so-border)',
        cursor: interactive ? 'pointer' : undefined,
      }}
      onMouseEnter={interactive ? (e) => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)') : undefined}
      onMouseLeave={interactive ? (e) => (e.currentTarget.style.boxShadow = '') : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--so-text-tertiary)' }}>
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4 shrink-0" style={{ color: 'var(--so-text-tertiary)' }} />}
      </div>
      <div className="text-2xl font-bold leading-tight" style={{ color: TONE_VALUE_COLOR[tone] }}>{value}</div>
      {hint && <div className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>{hint}</div>}
    </div>
  )
}
