import type { LucideIcon } from 'lucide-react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ActionMenu, type MenuAction } from './ActionMenu'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'

interface BreadcrumbItem {
  label: string
  to?: string
}

interface PrimaryAction {
  label: string
  onClick: () => void
  icon?: LucideIcon
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
}

interface PageHeaderProps {
  title: string
  description?: string
  /** Breadcrumb trail. Last item rendered as plain text; earlier items as links */
  breadcrumb?: BreadcrumbItem[]
  /** Primary call-to-action — always visible */
  primary?: PrimaryAction
  /** Secondary actions — collapsed into an overflow "⋯" menu */
  actions?: MenuAction[]
  /** Custom content rendered between primary and the ActionMenu (e.g. ExportButton) */
  trailing?: React.ReactNode
  /** Show a chevron-back button next to the title (uses navigate(-1)) */
  showBack?: boolean
  /** Additional right-side content rendered next to the actions (e.g., status pills) */
  meta?: React.ReactNode
}

export function PageHeader({
  title,
  description,
  breadcrumb,
  primary,
  actions = [],
  trailing,
  showBack = false,
  meta,
}: PageHeaderProps) {
  const navigate = useNavigate()

  return (
    <div className="mb-6 animate-in">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="flex items-center gap-2 mb-3 text-[13px] flex-wrap" style={{ color: 'var(--so-text-tertiary)' }}>
          {breadcrumb.map((item, idx) => (
            <span key={idx} className="inline-flex items-center gap-2">
              {item.to && idx < breadcrumb.length - 1 ? (
                <button
                  type="button"
                  onClick={() => navigate(item.to!)}
                  className="font-medium transition-colors cursor-pointer"
                  style={{ color: 'var(--so-text-tertiary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
                >
                  {idx === 0 && <ArrowLeft className="inline h-3.5 w-3.5 mr-1" />}
                  {item.label}
                </button>
              ) : (
                <span className="font-medium" style={{ color: 'var(--so-text-secondary)' }}>{item.label}</span>
              )}
              {idx < breadcrumb.length - 1 && (
                <span style={{ color: 'var(--so-border)' }}>/</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {showBack && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className={outlineBtnClass + ' !px-2 shrink-0'}
              style={outlineBtnStyle}
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold leading-tight break-words" style={{ letterSpacing: '-0.03em' }}>{title}</h1>
            {description && (
              <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>{description}</p>
            )}
            {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
          </div>
        </div>

        {(primary || trailing || actions.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {primary && (
              <button
                type={primary.type ?? 'button'}
                onClick={primary.onClick}
                disabled={primary.disabled || primary.loading}
                className={primaryBtnClass + (primary.loading || primary.disabled ? ' opacity-50 pointer-events-none' : '')}
                style={primaryBtnStyle}
              >
                {primary.icon && <primary.icon className="h-3.5 w-3.5 mr-1" />}
                {primary.loading ? 'Working…' : primary.label}
              </button>
            )}
            {trailing}
            {actions.length > 0 && <ActionMenu actions={actions} />}
          </div>
        )}
      </div>
    </div>
  )
}
