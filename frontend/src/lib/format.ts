/**
 * Format a number or numeric string as USD currency.
 */
export function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
}

/**
 * Format a number of months as a human-readable duration (e.g., "5y 3m").
 */
export function formatLifeMonths(months: number): string {
  if (!months) return '-'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m}m`
  if (m === 0) return `${y}y`
  return `${y}y ${m}m`
}
