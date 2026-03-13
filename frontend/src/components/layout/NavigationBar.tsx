import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Derives a human-readable page label from a pathname.
 */
function getPageLabel(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return 'Dashboard'

  const labels: Record<string, string> = {
    customers: 'Customers',
    vendors: 'Vendors',
    items: 'Items',
    orders: 'Orders',
    invoices: 'Invoices',
    estimates: 'Estimates',
    contracts: 'Contracts',
    rfqs: 'RFQs',
    reports: 'Reports',
    settings: 'Settings',
    dashboard: 'Dashboard',
  }

  const parts: string[] = []

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (labels[seg]) {
      parts.push(labels[seg])
    } else if (seg === 'sales') {
      parts.push('Sales Orders')
    } else if (seg === 'purchase') {
      parts.push('Purchase Orders')
    } else if (seg === 'open-orders') {
      parts.push('Open Orders')
    } else if (seg === 'new') {
      parts.push('New')
    } else if (/^\d+$/.test(seg)) {
      // ID segment — skip, the detail page shows its own title
    } else {
      // Capitalize kebab-case
      parts.push(seg.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))
    }
  }

  return parts.join(' / ') || 'Dashboard'
}

const btnClass =
  'inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors cursor-pointer'

export default function NavigationBar() {
  const navigate = useNavigate()
  const location = useLocation()

  const pageLabel = getPageLabel(location.pathname)

  return (
    <div
      className="flex items-center gap-2 px-4 py-1.5 border-b shrink-0"
      style={{ background: 'var(--so-bg)', borderColor: 'var(--so-border-light)' }}
      data-print-hide
    >
      {/* Back / Forward */}
      <div className="flex items-center gap-0.5">
        <button
          className={btnClass}
          style={{ color: 'var(--so-text-secondary)' }}
          onClick={() => navigate(-1)}
          title="Go back (Alt+←)"
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-border-light)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          className={btnClass}
          style={{ color: 'var(--so-text-secondary)' }}
          onClick={() => navigate(1)}
          title="Go forward (Alt+→)"
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-border-light)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Current page breadcrumb */}
      <span
        className="text-[12.5px] font-medium"
        style={{ color: 'var(--so-text-tertiary)' }}
      >
        {pageLabel}
      </span>
    </div>
  )
}
