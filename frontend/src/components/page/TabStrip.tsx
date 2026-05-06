import type { LucideIcon } from 'lucide-react'

export interface TabItem {
  id: string
  label: string
  icon?: LucideIcon
  count?: number
  hidden?: boolean
}

interface TabStripProps {
  tabs: TabItem[]
  active: string
  onChange: (id: string) => void
  /** When tab count >= this threshold, render a Select picker on mobile to avoid wrapping into many rows. Default 6. */
  mobileSelectThreshold?: number
  className?: string
}

export function TabStrip({ tabs, active, onChange, mobileSelectThreshold = 6, className = '' }: TabStripProps) {
  const visible = tabs.filter((t) => !t.hidden)
  const useSelectOnMobile = visible.length >= mobileSelectThreshold

  return (
    <div className={className}>
      {useSelectOnMobile && (
        <div className="md:hidden mb-2">
          <select
            value={active}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-11 px-3 rounded-xl text-sm appearance-none cursor-pointer"
            style={{
              background: 'var(--so-surface)',
              border: '1px solid var(--so-border)',
              color: 'var(--so-text-primary)',
              backgroundImage:
                "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              backgroundSize: '16px',
              paddingRight: '36px',
            }}
          >
            {visible.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}{tab.count != null ? ` (${tab.count})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className={`flex flex-wrap gap-1.5 ${useSelectOnMobile ? 'hidden md:flex' : ''}`}>
        {visible.map((tab) => {
          const isActive = active === tab.id
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer"
              style={{
                background: isActive ? 'var(--so-accent)' : 'var(--so-surface)',
                color: isActive ? '#fff' : 'var(--so-text-secondary)',
                border: `1px solid ${isActive ? 'var(--so-accent)' : 'var(--so-border)'}`,
              }}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              <span>{tab.label}</span>
              {tab.count != null && (
                <span
                  className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[11px] font-semibold"
                  style={{
                    background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--so-border-light)',
                    color: isActive ? '#fff' : 'var(--so-text-tertiary)',
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
