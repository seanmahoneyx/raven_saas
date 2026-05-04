import { getStatusBadge } from '@/components/ui/StatusBadge'
import { MobileEntryCard } from '@/components/ui/MobileEntryCard'
import type { SalesOrder, PurchaseOrder } from '@/types/api'
import { Calendar } from 'lucide-react'
import { formatCurrency, formatShortDate } from '@/lib/format'

interface SalesOrderCardProps {
  order: SalesOrder
  onClick?: () => void
}

export function SalesOrderCard({ order, onClick }: SalesOrderCardProps) {
  const total = parseFloat(order.subtotal || '0')

  return (
    <MobileEntryCard
      onClick={onClick}
      header={
        <>
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono font-semibold text-[15px]" style={{ color: 'var(--so-text-primary)' }}>
              {order.order_number}
            </span>
            {getStatusBadge(order.status)}
          </div>
          <div className="text-[13px] mt-1 font-medium truncate" style={{ color: 'var(--so-text-secondary)' }}>
            {order.customer_name || '—'}
          </div>
        </>
      }
      body={
        <>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--so-text-tertiary)' }}>Total</div>
              <div className="font-mono font-semibold text-[14px]" style={{ color: total > 0 ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}>
                {formatCurrency(order.subtotal)}
              </div>
            </div>
            <div className="w-px self-stretch" style={{ background: 'var(--so-border-light)' }} />
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--so-text-tertiary)' }}>Lines</div>
              <div className="font-semibold text-[14px]" style={{ color: 'var(--so-text-primary)' }}>
                {order.num_lines ?? 0}
              </div>
            </div>
          </div>
          {order.scheduled_date && (
            <div className="flex items-center gap-1 text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
              <Calendar className="h-3 w-3" />
              <span>Scheduled: <span className="font-medium" style={{ color: 'var(--so-text-secondary)' }}>{formatShortDate(order.scheduled_date)}</span></span>
            </div>
          )}
        </>
      }
    />
  )
}

interface PurchaseOrderCardProps {
  order: PurchaseOrder
  onClick?: () => void
}

export function PurchaseOrderCard({ order, onClick }: PurchaseOrderCardProps) {
  const total = parseFloat(order.subtotal || '0')

  return (
    <MobileEntryCard
      onClick={onClick}
      header={
        <>
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono font-semibold text-[15px]" style={{ color: 'var(--so-text-primary)' }}>
              {order.po_number}
            </span>
            {getStatusBadge(order.status)}
          </div>
          <div className="text-[13px] mt-1 font-medium truncate" style={{ color: 'var(--so-text-secondary)' }}>
            {order.vendor_name || '—'}
          </div>
        </>
      }
      body={
        <>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--so-text-tertiary)' }}>Total</div>
              <div className="font-mono font-semibold text-[14px]" style={{ color: total > 0 ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}>
                {formatCurrency(order.subtotal)}
              </div>
            </div>
            <div className="w-px self-stretch" style={{ background: 'var(--so-border-light)' }} />
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--so-text-tertiary)' }}>Lines</div>
              <div className="font-semibold text-[14px]" style={{ color: 'var(--so-text-primary)' }}>
                {order.num_lines ?? 0}
              </div>
            </div>
          </div>
          {order.scheduled_date && (
            <div className="flex items-center gap-1 text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
              <Calendar className="h-3 w-3" />
              <span>Scheduled: <span className="font-medium" style={{ color: 'var(--so-text-secondary)' }}>{formatShortDate(order.scheduled_date)}</span></span>
            </div>
          )}
          {order.expected_date && !order.scheduled_date && (
            <div className="flex items-center gap-1 text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
              <Calendar className="h-3 w-3" />
              <span>Expected: <span className="font-medium" style={{ color: 'var(--so-text-secondary)' }}>{formatShortDate(order.expected_date)}</span></span>
            </div>
          )}
        </>
      }
    />
  )
}
