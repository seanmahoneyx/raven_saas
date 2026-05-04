import { MobileEntryCard } from '@/components/ui/MobileEntryCard'
import type { Item } from '@/types/api'

const itemTypeConfig: Record<string, { bg: string; color: string; label: string }> = {
  inventory:     { bg: 'rgba(74,144,92,0.1)',   color: 'var(--so-success, #4a905c)', label: 'Inventory' },
  crossdock:     { bg: 'rgba(59,130,246,0.1)',  color: '#3b82f6',                   label: 'Crossdock' },
  non_stockable: { bg: 'rgba(168,85,247,0.1)', color: '#a855f7',                   label: 'Non-Stockable' },
  other_charge:  { bg: 'var(--so-bg)',          color: 'var(--so-text-tertiary)',    label: 'Other Charge' },
}

const lifecycleConfig: Record<string, { label: string; bg: string; text: string }> = {
  draft:            { label: 'Draft',        bg: 'rgba(168,85,247,0.1)',  text: '#a855f7' },
  pending_design:   { label: 'Design Req',   bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
  in_design:        { label: 'In Design',    bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
  design_complete:  { label: 'Design Done',  bg: 'rgba(16,185,129,0.1)', text: '#10b981' },
  pending_approval: { label: 'Pending',      bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
  active:           { label: 'Active',       bg: 'rgba(74,144,92,0.1)',  text: 'var(--so-success, #4a905c)' },
}

interface ItemCardProps {
  item: Item
  onClick?: () => void
}

export function ItemCard({ item, onClick }: ItemCardProps) {
  const typeConf = itemTypeConfig[item.item_type] || itemTypeConfig.inventory
  const lcConf = lifecycleConfig[item.lifecycle_status] || lifecycleConfig.active
  const onHand = item.qty_on_hand ?? 0
  const onSO = item.qty_on_open_so ?? 0

  return (
    <MobileEntryCard
      onClick={onClick}
      header={
        <>
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono font-semibold text-[15px] truncate" style={{ color: 'var(--so-text-primary)' }}>
              {item.sku}
            </span>
            <span
              className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider"
              style={{ background: lcConf.bg, color: lcConf.text }}
            >
              {lcConf.label}
            </span>
          </div>
          <div className="text-[13px] mt-1 font-medium truncate" style={{ color: 'var(--so-text-secondary)' }}>
            {item.name}
          </div>
          <div className="mt-1">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium"
              style={{ background: typeConf.bg, color: typeConf.color }}
            >
              {typeConf.label}
            </span>
          </div>
        </>
      }
      body={
        <>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--so-text-tertiary)' }}>On Hand</div>
              <div
                className="font-mono font-semibold text-[14px]"
                style={{ color: onHand > 0 ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}
              >
                {onHand.toLocaleString()}
              </div>
            </div>
            <div className="w-px self-stretch" style={{ background: 'var(--so-border-light)' }} />
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--so-text-tertiary)' }}>Open SO</div>
              <div
                className="font-mono font-semibold text-[14px]"
                style={{ color: onSO > 0 ? 'var(--so-accent)' : 'var(--so-text-tertiary)' }}
              >
                {onSO.toLocaleString()}
              </div>
            </div>
          </div>
          {item.preferred_vendor_name && (
            <div className="text-[12px] truncate" style={{ color: 'var(--so-text-tertiary)' }}>
              Vendor: <span className="font-medium" style={{ color: 'var(--so-text-secondary)' }}>{item.preferred_vendor_name}</span>
            </div>
          )}
        </>
      }
    />
  )
}
