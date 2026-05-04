import { getStatusBadge } from '@/components/ui/StatusBadge'
import { MobileEntryCard } from '@/components/ui/MobileEntryCard'
import type { Estimate } from '@/types/api'
import { AlertTriangle } from 'lucide-react'
import { formatCurrency, formatShortDate } from '@/lib/format'

interface EstimateCardProps {
  estimate: Estimate
  onClick?: () => void
}

export function EstimateCard({ estimate, onClick }: EstimateCardProps) {
  const total = parseFloat(estimate.total_amount || '0')

  return (
    <MobileEntryCard
      onClick={onClick}
      header={
        <>
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono font-semibold text-[15px]" style={{ color: 'var(--so-text-primary)' }}>
              {estimate.estimate_number}
            </span>
            {getStatusBadge(estimate.status)}
          </div>
          <div className="text-[13px] mt-1 font-medium truncate" style={{ color: 'var(--so-text-secondary)' }}>
            {estimate.customer_name || '—'}
          </div>
        </>
      }
      body={
        <>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--so-text-tertiary)' }}>Total</div>
              <div className="font-mono font-semibold text-[14px]" style={{ color: total > 0 ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)' }}>
                {formatCurrency(estimate.total_amount)}
              </div>
            </div>
            <div className="w-px self-stretch" style={{ background: 'var(--so-border-light)' }} />
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--so-text-tertiary)' }}>Lines</div>
              <div className="font-semibold text-[14px]" style={{ color: 'var(--so-text-primary)' }}>
                {estimate.num_lines ?? 0}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
            <span>Date: <span className="font-medium">{formatShortDate(estimate.date)}</span></span>
            {estimate.expiration_date && (
              <span
                className="flex items-center gap-1"
                style={{ color: estimate.is_expired ? 'var(--so-danger-text)' : 'var(--so-text-tertiary)' }}
              >
                {estimate.is_expired && <AlertTriangle className="h-3 w-3" />}
                Expires: <span className="font-medium">{formatShortDate(estimate.expiration_date)}</span>
              </span>
            )}
          </div>
        </>
      }
    />
  )
}
