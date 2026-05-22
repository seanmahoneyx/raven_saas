/**
 * Shared label maps for slug-style enum values.
 *
 * Backend stores divisions/types as snake_case slugs (e.g. `non_stockable`).
 * UI should display human-readable labels (e.g. "Non-Inv"). Keep these maps
 * in one place so any new label is picked up wherever the enum is rendered.
 */

export const DIVISION_LABELS: Record<string, string> = {
  corrugated: 'Corrugated',
  packaging: 'Packaging',
  tooling: 'Tooling',
  janitorial: 'Janitorial',
  misc: 'Misc',
  non_stockable: 'Non-Stockable',
}

export function getDivisionLabel(division: string | null | undefined): string {
  if (!division) return '-'
  return DIVISION_LABELS[division] ?? division
}

export const ITEM_TYPE_LABELS: Record<string, string> = {
  inventory: 'Inv',
  crossdock: 'Cross',
  non_stockable: 'Non-Inv',
  other_charge: 'Other',
}

export function getItemTypeLabel(itemType: string | null | undefined): string {
  if (!itemType) return '-'
  return ITEM_TYPE_LABELS[itemType] ?? itemType
}
