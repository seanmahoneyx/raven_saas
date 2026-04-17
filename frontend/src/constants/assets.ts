export const DEPRECIATION_METHODS = [
  { value: 'straight_line', label: 'Straight-Line' },
  { value: 'declining_balance', label: 'Declining Balance' },
  { value: 'double_declining', label: 'Double Declining' },
  { value: 'sum_of_years', label: 'Sum of Years' },
  { value: 'units_of_production', label: 'Units of Production' },
] as const

export const DISPOSAL_METHODS = [
  { value: 'sold', label: 'Sold' },
  { value: 'scrapped', label: 'Scrapped' },
  { value: 'donated', label: 'Donated' },
  { value: 'traded_in', label: 'Traded In' },
  { value: 'stolen', label: 'Stolen/Lost' },
] as const

export const DEPRECIATION_METHOD_MAP: Record<string, string> = Object.fromEntries(
  DEPRECIATION_METHODS.map(m => [m.value, m.label])
)

export const DISPOSAL_METHOD_MAP: Record<string, string> = Object.fromEntries(
  DISPOSAL_METHODS.map(m => [m.value, m.label])
)
