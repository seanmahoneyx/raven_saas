import React from 'react'

export const ITEM_TYPE_BADGE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  inventory: { bg: 'rgba(74,144,92,0.1)', color: 'var(--so-success, #4a905c)', label: 'Inventory' },
  crossdock: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', label: 'Crossdock' },
  non_stockable: { bg: 'rgba(168,85,247,0.1)', color: '#a855f7', label: 'Non-Stockable' },
  other_charge: { bg: 'var(--so-bg)', color: 'var(--so-text-tertiary)', label: 'Other Charge' },
}

export function getItemTypeBadge(itemType: string) {
  const s = ITEM_TYPE_BADGE_STYLES[itemType] || ITEM_TYPE_BADGE_STYLES.inventory
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
      style={{ background: s.bg, border: '1px solid transparent', color: s.color }}
    >
      {s.label}
    </span>
  )
}

const statusConfigs: Record<string, { bg: string; border: string; text: string }> = {
  draft:       { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
  confirmed:   { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
  scheduled:   { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
  picking:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
  shipped:     { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
  complete:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
  cancelled:   { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
  active:      { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
  inactive:    { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
  sent:        { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
  accepted:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
  rejected:    { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
  converted:   { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
  posted:      { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
  paid:        { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
  partial:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
  overdue:     { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
  void:        { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
  received:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
  pending:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
  approved:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
  expired:     { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
  closed:      { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
  open:        { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
  in_progress: { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
  completed:   { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
  crossdock:        { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
  // Shipping
  in_transit:       { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
  delivered:        { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
  printed:          { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
  signed:           { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
  // Inventory
  available:        { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
  reserved:         { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
  damaged:          { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
  quarantine:       { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
  // Pipeline
  pending_approval: { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
  planned:          { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
  loading:          { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
}

export function getStatusBadge(status: string) {
  const c = statusConfigs[status] || { bg: 'var(--so-warning-bg)', border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ background: c.text }} />
      {status}
    </span>
  )
}
