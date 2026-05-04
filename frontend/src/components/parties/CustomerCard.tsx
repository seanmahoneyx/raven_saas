import { Star } from 'lucide-react'
import { MobileEntryCard } from '@/components/ui/MobileEntryCard'
import type { Customer } from '@/types/api'
import { formatCurrency, formatRelativeDate } from '@/lib/format'

interface CustomerCardProps {
  customer: Customer
  isFavorite?: boolean
  onClick?: () => void
}

export function CustomerCard({ customer, isFavorite = false, onClick }: CustomerCardProps) {
  const openSales = parseFloat(customer.open_sales_total || '0')
  const delivery = formatRelativeDate(customer.next_expected_delivery)

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
                {customer.party_display_name}
              </span>
            </div>
            {customer.customer_type && (
              <span
                className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background: 'var(--so-bg)',
                  border: '1px solid var(--so-border)',
                  color: 'var(--so-text-secondary)',
                }}
              >
                {customer.customer_type}
              </span>
            )}
          </div>
          <div
            className="text-[12px] font-mono mt-0.5"
            style={{ color: 'var(--so-text-tertiary)' }}
          >
            {customer.party_code}
            {customer.payment_terms ? ` · ${customer.payment_terms}` : ''}
          </div>
        </>
      }
      body={
        <>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--so-text-tertiary)' }}>
                Open Sales
              </span>
              <div
                className="font-mono font-semibold text-[14px]"
                style={{ color: openSales > 0 ? 'var(--so-success-text)' : 'var(--so-text-tertiary)' }}
              >
                {formatCurrency(customer.open_sales_total)}
              </div>
            </div>
            <div
              className="w-px self-stretch"
              style={{ background: 'var(--so-border-light)' }}
            />
            <div className="flex-1">
              <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--so-text-tertiary)' }}>
                Orders
              </span>
              <div
                className="font-semibold text-[14px]"
                style={{ color: customer.open_order_count > 0 ? 'var(--so-accent)' : 'var(--so-text-tertiary)' }}
              >
                {customer.open_order_count}
              </div>
            </div>
          </div>
          {customer.next_expected_delivery && (
            <div className="text-[12px]" style={{ color: delivery.color }}>
              Next Delivery: <span className="font-medium">{delivery.label}</span>
            </div>
          )}
        </>
      }
    />
  )
}
