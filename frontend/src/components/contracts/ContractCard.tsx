import { getStatusBadge } from '@/components/ui/StatusBadge'
import { MobileEntryCard } from '@/components/ui/MobileEntryCard'
import { formatShortDate } from '@/lib/format'
import type { Contract } from '@/types/api'

interface ContractCardProps {
  contract: Contract
  onClick?: () => void
}

export function ContractCard({ contract, onClick }: ContractCardProps) {
  const contractNum = String(contract.contract_number).startsWith('CTR-')
    ? contract.contract_number
    : `CTR-${contract.contract_number}`

  return (
    <MobileEntryCard
      onClick={onClick}
      header={
        <>
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono font-semibold text-[15px]" style={{ color: 'var(--so-text-primary)' }}>
              {contractNum}
            </span>
            {getStatusBadge(contract.status)}
          </div>
          <div className="text-[13px] mt-1 font-medium truncate" style={{ color: 'var(--so-text-secondary)' }}>
            {contract.customer_name || '—'}
          </div>
        </>
      }
      body={
        <>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--so-text-tertiary)' }}>Committed</div>
              <div className="font-mono font-semibold text-[14px]" style={{ color: 'var(--so-text-primary)' }}>
                {(contract.total_committed_qty ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="w-px self-stretch" style={{ background: 'var(--so-border-light)' }} />
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--so-text-tertiary)' }}>Progress</div>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--so-border)' }}>
                  <div
                    className="h-full"
                    style={{ width: `${Math.min(contract.completion_percentage ?? 0, 100)}%`, background: 'var(--so-accent)' }}
                  />
                </div>
                <span className="text-[11px] font-medium" style={{ color: 'var(--so-text-tertiary)' }}>
                  {contract.completion_percentage ?? 0}%
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
            <span>{formatShortDate(contract.issue_date)} – {formatShortDate(contract.end_date)}</span>
            {contract.blanket_po && (
              <span className="font-mono" style={{ color: 'var(--so-text-secondary)' }}>
                PO: {contract.blanket_po}
              </span>
            )}
          </div>
        </>
      }
    />
  )
}
