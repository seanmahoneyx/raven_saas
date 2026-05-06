interface StickyFooterProps {
  children: React.ReactNode
  /** When true (default), pin to viewport bottom on mobile so the primary action is always reachable */
  stickyOnMobile?: boolean
  /** Additional content rendered above the actions, e.g. an error banner */
  banner?: React.ReactNode
  className?: string
}

export function StickyFooter({ children, stickyOnMobile = true, banner, className = '' }: StickyFooterProps) {
  return (
    <div
      className={`${stickyOnMobile ? 'sticky bottom-0 md:static' : ''} z-10 ${className}`}
      style={{
        background: 'var(--so-surface)',
        borderTop: '1px solid var(--so-border-light)',
      }}
    >
      {banner && (
        <div className="px-4 md:px-6 pt-3">
          {banner}
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2 px-4 md:px-6 py-3">
        {children}
      </div>
    </div>
  )
}
