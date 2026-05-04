export function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
}

export function formatLifeMonths(months: number): string {
  if (!months) return '-'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m}m`
  if (m === 0) return `${y}y`
  return `${y}y ${m}m`
}

export function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Past/today renders red; within 3 days renders amber; otherwise normal text.
export function formatRelativeDate(dateStr: string | null | undefined): { color: string; label: string } {
  if (!dateStr) return { color: 'var(--so-text-tertiary)', label: '—' }
  const date = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  let color = 'var(--so-text-primary)'
  if (diffDays <= 0) color = 'var(--so-danger-text)'
  else if (diffDays <= 3) color = '#d97706'
  const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  let suffix = ''
  if (diffDays <= 0) suffix = ' (today)'
  else if (diffDays === 1) suffix = ' (tomorrow)'
  return { color, label: formatted + suffix }
}
