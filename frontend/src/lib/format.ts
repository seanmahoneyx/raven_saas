export interface FormatCurrencyOptions {
  /** Number of fraction digits to display (controls both min and max). Default: 2. */
  decimals?: number
}

export function formatCurrency(value: string | number | null | undefined, options?: FormatCurrencyOptions): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value ?? NaN)
  if (typeof num !== 'number' || isNaN(num)) return '$0.00'
  const decimals = options?.decimals ?? 2
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)
}

/**
 * Strip a user-typed numeric string down to a raw, comma-free value safe to
 * store in state and send to the API. Keeps an optional leading minus, digits,
 * and at most one decimal point (preserving a trailing "." while typing).
 */
export function parseNumericInput(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return ''
  let s = String(input).replace(/,/g, '')
  const neg = s.startsWith('-')
  s = s.replace(/[^0-9.]/g, '')
  const firstDot = s.indexOf('.')
  if (firstDot !== -1) {
    // collapse any extra decimal points, keep the first
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '')
  }
  return (neg ? '-' : '') + s
}

/**
 * Format a raw numeric string/number for display with thousands separators,
 * preserving a trailing decimal point and decimal digits as the user types.
 * Does NOT round — display only. Returns '' for empty/nullish input.
 */
export function formatWithCommas(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return ''
  let s = String(raw)
  const neg = s.startsWith('-')
  if (neg) s = s.slice(1)
  const dot = s.indexOf('.')
  let intPart = dot === -1 ? s : s.slice(0, dot)
  const decPart = dot === -1 ? '' : s.slice(dot) // includes the '.'
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (neg ? '-' : '') + intPart + decPart
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
