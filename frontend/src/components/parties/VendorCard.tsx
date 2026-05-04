import { Star } from 'lucide-react'
import { MobileEntryCard } from '@/components/ui/MobileEntryCard'
import type { Vendor } from '@/types/api'
import { formatCurrency, formatRelativeDate } from '@/lib/format'

interface VendorCardProps {
  vendor: Vendor
  isFavorite?: boolean
  onClick?: () => void
}

export function VendorCard({ vendor, isFavorite = false, onClick }: VendorCardProps) {
  const openPO = parseFloat(vendor.open_po_total || '0')
  const incoming = formatRelativeDate(vendor.next_incoming)

  return (
    <MobileEntryCard
      onClick={onClick}
      header={
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {isFavorite && (
                <Star
                  className="flex-shrink-0"
                  style={{ width: 14, height: 14, color: '#f59e0b', fill: '#f59e0b' }}
                />
              )}
              <span
                className="font-semibold text-[15px] truncate"
                style={{ color: 'var(--so-text-primary)' }}
              >
                {vendor.party_display_name}
              </span>
            </div>
            {vendor.vendor_type && (
              <span
                className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background: 'var(--so-bg)',
                  border: '1px solid var(--so-border)',
                  color: 'var(--so-text-secondary)',
                }}
              >
                {vendor.vendor_type}
              </span>
            )}
          </div>
          <div
            className="text-[12px] font-mono mt-0.5"
            style={{ color: 'var(--so-text-tertiary)' }}
          >
            {vendor.party_code}
            {vendor.payment_terms ? ` · ${vendor.payment_terms}` : ''}
          </div>
        </>
      }
      body={
        <>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--so-text-tertiary)' }}>
                Open PO
              </span>
              <div
                className="font-mono font-semibold text-[14px]"
                style={{ color: openPO > 0 ? 'var(--so-accent)' : 'var(--so-text-tertiary)' }}
              >
                {formatCurrency(vendor.open_po_total)}
              </div>
            </div>
            <div
              className="w-px self-stretch"
              style={{ background: 'var(--so-border-light)' }}
            />
            <div className="flex-1">
              <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--so-text-tertiary)' }}>
                POs
              </span>
              <div
                className="font-semibold text-[14px]"
                style={{ color: vendor.open_po_count > 0 ? 'var(--so-accent)' : 'var(--so-text-tertiary)' }}
              >
                {vendor.open_po_count}
              </div>
            </div>
          </div>
          {vendor.next_incoming && (
            <div className="text-[12px]" style={{ color: incoming.color }}>
              Next Incoming: <span className="font-medium">{incoming.label}</span>
            </div>
          )}
        </>
      }
    />
  )
}
