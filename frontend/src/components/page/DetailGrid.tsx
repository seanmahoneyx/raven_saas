interface DetailGridProps {
  /** Optional card title rendered as a header strip */
  title?: string
  children: React.ReactNode
  /** Desktop columns. Mobile is always 2-up (or 1 if `compact`). Default 4. */
  columns?: 2 | 3 | 4
  /** When true, render a single column on the smallest viewports for maximum readability */
  compact?: boolean
  className?: string
}

const COL_CLASS: Record<number, string> = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
}

export function DetailGrid({ title, children, columns = 4, compact = false, className = '' }: DetailGridProps) {
  const baseGrid = compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2'
  return (
    <div
      className={`rounded-[14px] overflow-hidden ${className}`}
      style={{ background: 'var(--so-surface)', border: '1px solid var(--so-border)' }}
    >
      {title && (
        <div className="px-4 md:px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
          <span className="text-sm font-semibold">{title}</span>
        </div>
      )}
      <div className={`grid ${baseGrid} ${COL_CLASS[columns]}`}>
        {children}
      </div>
    </div>
  )
}

interface DetailCellProps {
  label: string
  children: React.ReactNode
  /** Style as muted/italic when value is missing or "Not set" */
  empty?: boolean
  /** Span all columns at md+ (useful for long descriptions in a grid) */
  fullWidth?: boolean
}

export function DetailCell({ label, children, empty = false, fullWidth = false }: DetailCellProps) {
  return (
    <div
      className={`px-5 py-4 ${fullWidth ? 'col-span-full' : ''}`}
      style={{
        borderRight: '1px solid var(--so-border-light)',
        borderBottom: '1px solid var(--so-border-light)',
      }}
    >
      <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
        {label}
      </div>
      <div
        className="text-sm font-medium break-words"
        style={{
          color: empty ? 'var(--so-text-tertiary)' : 'var(--so-text-primary)',
          fontStyle: empty ? 'italic' : 'normal',
        }}
      >
        {children}
      </div>
    </div>
  )
}
