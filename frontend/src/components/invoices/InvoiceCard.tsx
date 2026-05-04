import { getStatusBadge } from '@/components/ui/StatusBadge'
import { MobileEntryCard } from '@/components/ui/MobileEntryCard'
import type { Invoice } from '@/api/invoicing'
import { formatCurrency, formatShortDate } from '@/lib/format'

interface InvoiceCardProps {
  invoice: Invoice
  onClick?: () => void
}

export function InvoiceCard({ invoice, onClick }: InvoiceCardProps) {
  const balance = parseFloat(invoice.balance_due || '0')
  const total = parseFloat(invoice.total_amount || '0')

  return (
    <MobileEntryCard
      onClick={onClick}
      header={
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono font-semibold text-[15px]" style={{ color: 'var(--so-text-primary)' }}>
                {invoice.invoice_number}
              </span>
              <span
                className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background: 'var(--so-bg)',
                  border: '1px solid var(--so-border)',
                  color: 'var(--so-text-secondary)',
                }}
              >
                {invoice.invoice_type === 'AR' ? 'Receivable' : 'Payable'}
              </span>
            </div>
            {getStatusBadge(invoice.status)}
          </div>
          <div className="text-[13px] mt-1 font-medium truncate" style={{ color: 'var(--so-text-secondary)' }}>
            {invoice.party_name || '—'}
          </div>
        </>
      }
      body={
        <>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--so-text-tertiary)' }}>Total</div>
              <div className="font-mono font-semibold text-[14px]" style={{ color: 'var(--so-text-primary)' }}>
                {formatCurrency(total)}
              </div>
            </div>
            <div className="w-px self-stretch" style={{ background: 'var(--so-border-light)' }} />
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--so-text-tertiary)' }}>Balance</div>
              <div
                className="font-mono font-semibold text-[14px]"
                style={{ color: balance > 0 ? 'var(--so-danger-text)' : 'var(--so-success-text)' }}
              >
                {formatCurrency(balance)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
            <span>Issued: <span className="font-medium">{formatShortDate(invoice.invoice_date)}</span></span>
            <span>Due: <span className="font-medium">{formatShortDate(invoice.due_date)}</span></span>
          </div>
        </>
      }
    />
  )
}
