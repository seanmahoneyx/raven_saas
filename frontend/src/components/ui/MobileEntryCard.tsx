import type { ReactNode } from 'react'

interface MobileEntryCardProps {
  header: ReactNode
  body: ReactNode
  onClick?: () => void
}

export function MobileEntryCard({ header, body, onClick }: MobileEntryCardProps) {
  return (
    <div
      onClick={onClick}
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--so-surface)',
        border: '1px solid var(--so-border)',
        cursor: onClick ? 'pointer' : undefined,
        transition: 'transform 0.1s ease, box-shadow 0.1s ease',
      }}
      onPointerDown={(e) => {
        const el = e.currentTarget
        el.style.transform = 'scale(0.985)'
        el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)'
      }}
      onPointerUp={(e) => {
        const el = e.currentTarget
        el.style.transform = ''
        el.style.boxShadow = ''
      }}
      onPointerLeave={(e) => {
        const el = e.currentTarget
        el.style.transform = ''
        el.style.boxShadow = ''
      }}
    >
      <div className="px-4 pt-3.5 pb-3" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
        {header}
      </div>
      <div className="px-4 py-3 flex flex-col gap-1.5">
        {body}
      </div>
    </div>
  )
}
