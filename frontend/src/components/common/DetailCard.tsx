import type { ReactNode, CSSProperties } from 'react'

interface DetailCardProps {
  /** Card title shown in the header */
  title?: string
  /** Optional right-side content in header (e.g. count badge) */
  headerRight?: ReactNode
  /** Card content */
  children: ReactNode
  /** Additional className on outer wrapper */
  className?: string
  /** Extra inline styles on outer wrapper */
  style?: CSSProperties
  /** Animation delay class like "delay-2", "delay-3" etc */
  animateDelay?: string
}

export function DetailCard({ title, headerRight, children, className = '', style, animateDelay }: DetailCardProps) {
  return (
    <div
      className={`rounded-[14px] border overflow-hidden ${animateDelay ? `animate-in ${animateDelay}` : ''} ${className}`}
      style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)', ...style }}
    >
      {title && (
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--so-border-light)' }}
        >
          <span className="text-sm font-semibold">{title}</span>
          {headerRight}
        </div>
      )}
      {children}
    </div>
  )
}
