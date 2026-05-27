import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Receipt as ReceiptIcon, FileText } from 'lucide-react'
import { format } from 'date-fns'

import { usePageTitle } from '@/hooks/usePageTitle'
import { useItemReceipt, useCreateBillFromReceipt } from '@/api/inventory'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { formatCurrency } from '@/lib/format'
import { primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'

export default function ItemReceiptDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const receiptId = parseInt(id ?? '0', 10)

  const { data: receipt, isLoading } = useItemReceipt(receiptId)
  const createBill = useCreateBillFromReceipt()
  const [busy, setBusy] = useState(false)

  usePageTitle(receipt ? `Receipt ${receipt.receipt_number}` : 'Receipt')

  if (isLoading) {
    return (
      <div className="so-detail-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
            Loading…
          </div>
        </div>
      </div>
    )
  }

  if (!receipt) {
    return (
      <div className="so-detail-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
            Receipt not found
          </div>
        </div>
      </div>
    )
  }

  const hasUnbilled = receipt.lines.some(l => l.quantity_remaining_to_bill > 0)
  const canCreateBill = receipt.status !== 'void' && hasUnbilled

  const handleCreateBill = async () => {
    setBusy(true)
    try {
      const bill = await createBill.mutateAsync({ receiptId })
      navigate(`/bills/${bill.id}`)
    } catch {
      // toast handled in hook
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="so-detail-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-7 pb-16">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate('/item-receipts')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Item Receipts
          </button>
          <span style={{ color: 'var(--so-border)' }} className="text-[13px]">/</span>
          <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>
            {receipt.receipt_number}
          </span>
        </div>

        {/* Title */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-7 animate-in delay-1">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>
                Receipt {receipt.receipt_number}
              </h1>
              {getStatusBadge(receipt.status)}
            </div>
            <div className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>
              <strong className="font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                {receipt.vendor_name}
              </strong>
              {receipt.purchase_order_number && (
                <>
                  {' '}<span style={{ color: 'var(--so-text-tertiary)' }}>·</span>{' '}
                  <button
                    className="font-mono hover:underline"
                    style={{ color: 'var(--so-accent)' }}
                    onClick={() => receipt.purchase_order && navigate(`/orders/purchase/${receipt.purchase_order}`)}
                  >
                    {receipt.purchase_order_number}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canCreateBill && (
              <button
                className={primaryBtnClass + (busy ? ' opacity-50 pointer-events-none' : '')}
                style={primaryBtnStyle}
                onClick={handleCreateBill}
              >
                <FileText className="h-3.5 w-3.5" />
                {busy ? 'Creating…' : 'Create Bill from Receipt'}
              </button>
            )}
          </div>
        </div>

        {/* Header summary */}
        <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <ReceiptIcon className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
            <span className="text-sm font-semibold">Receipt Details</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4">
            {[
              { label: 'Received', value: format(new Date(receipt.received_date + 'T00:00:00'), 'MMM d, yyyy') },
              { label: 'Warehouse', value: receipt.warehouse_code, mono: true },
              { label: 'Lines', value: String(receipt.lines.length) },
              { label: 'Subtotal', value: formatCurrency(receipt.subtotal), mono: true },
            ].map((item, idx) => (
              <div
                key={idx}
                className="px-5 py-4"
                style={{
                  borderRight: '1px solid var(--so-border-light)',
                  borderBottom: '1px solid var(--so-border-light)',
                }}
              >
                <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                  {item.label}
                </div>
                <div
                  className={`text-sm font-medium ${item.mono ? 'font-mono' : ''}`}
                  style={{ color: 'var(--so-text-primary)' }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>
          {receipt.notes && (
            <div
              className="flex items-start gap-2.5 px-5 py-4"
              style={{ borderTop: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}
            >
              <FileText className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--so-text-tertiary)', opacity: 0.6 }} />
              <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--so-text-secondary)' }}>
                {receipt.notes}
              </p>
            </div>
          )}
        </div>

        {/* Lines */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-3"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Lines</span>
          </div>
          {receipt.lines.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Item', 'Qty', 'Unit Cost', 'Amount', 'Billed', 'Remaining'].map((label, i) => (
                      <th
                        key={label}
                        className={`text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 ${i === 0 ? 'pl-6 text-left' : 'text-right'}`}
                        style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)' }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {receipt.lines.map((line) => (
                    <tr key={line.id} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                      <td className="py-3.5 px-4 pl-6">
                        <div className="font-mono text-[12.5px]" style={{ color: 'var(--so-text-primary)' }}>
                          {line.item_sku}
                        </div>
                        <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--so-text-secondary)' }}>
                          {line.item_name}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold">
                        {line.quantity.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono" style={{ color: 'var(--so-text-secondary)' }}>
                        {formatCurrency(line.unit_cost)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold">
                        {formatCurrency(line.amount)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono" style={{ color: 'var(--so-text-secondary)' }}>
                        {line.quantity_billed.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono pr-6"
                        style={{ color: line.quantity_remaining_to_bill > 0 ? 'var(--so-warning-text)' : 'var(--so-success-text)' }}
                      >
                        {line.quantity_remaining_to_bill.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
              No lines on this receipt
            </div>
          )}
        </div>

        {!canCreateBill && receipt.status !== 'void' && (
          <div className="mt-4 text-[13px] text-center" style={{ color: 'var(--so-text-tertiary)' }}>
            All lines on this receipt are fully billed.
          </div>
        )}
      </div>
    </div>
  )
}
