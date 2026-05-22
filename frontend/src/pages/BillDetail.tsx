import { useState } from 'react'
import { formatCurrency } from '@/lib/format'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useCollaborationPanel } from '@/hooks/useCollaborationPanel'
import { TransactionPanel } from '@/components/collaboration/TransactionPanel'
import { PanelToggleButton } from '@/components/collaboration/PanelToggleButton'
import {
  ArrowLeft, Send, Ban, FileText, DollarSign, Pencil, Plus, Trash2,
} from 'lucide-react'
import FileUpload from '@/components/common/FileUpload'
import { format } from 'date-fns'
import { useBill, usePostBill, useVoidBill, useBillPayments, useDeleteBillLine } from '@/api/invoicing'
import { FieldHistoryTab } from '@/components/common/FieldHistoryTab'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { FolderTabs } from '@/components/ui/folder-tabs'
import { primaryBtnClass, primaryBtnStyle, outlineBtnClass, outlineBtnStyle } from '@/components/ui/button-styles'
import { RecordBillPaymentDialog } from '@/components/invoices/RecordBillPaymentDialog'
import { EditBillHeaderDialog } from '@/components/invoices/EditBillHeaderDialog'
import { AddBillLineDialog } from '@/components/invoices/AddBillLineDialog'

const dangerBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const dangerBtnStyle: React.CSSProperties = { background: 'var(--so-danger-text)', border: '1px solid var(--so-danger-text)' }

type TabType = 'lines' | 'payments' | 'attachments' | 'audit'

export default function BillDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const billId = parseInt(id || '0', 10)
  const { panelOpen, togglePanel, closePanel } = useCollaborationPanel()

  const [activeTab, setActiveTab] = useState<TabType>('lines')
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [addLineDialogOpen, setAddLineDialogOpen] = useState(false)
  const deleteBillLine = useDeleteBillLine()

  const { data: bill, isLoading } = useBill(billId)
  const { data: paymentsData } = useBillPayments(billId)
  const postBill = usePostBill()
  const voidBill = useVoidBill()

  usePageTitle(bill ? `Bill ${bill.bill_number}` : 'Bill')

  const handlePost = async () => {
    if (!bill || bill.status !== 'draft') return
    try {
      await postBill.mutateAsync(billId)
    } catch {
      /* toast handled by hook */
    }
  }

  const handleVoid = async () => {
    if (!bill) return
    if (!confirm('Are you sure you want to void this bill? Any associated journal entry will be reversed.')) return
    try {
      await voidBill.mutateAsync(billId)
    } catch {
      /* toast handled by hook */
    }
  }

  /* ── Loading / Not Found ───────────────────────── */
  if (isLoading) {
    return (
      <div className="so-detail-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!bill) {
    return (
      <div className="so-detail-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Bill not found</div>
        </div>
      </div>
    )
  }

  const balanceNum = parseFloat(bill.balance_due)
  const payments = paymentsData?.results ?? bill.payments ?? []

  const tabs: { id: TabType; label: string }[] = [
    { id: 'lines', label: 'Lines' },
    { id: 'payments', label: 'Payments' },
    { id: 'attachments', label: 'Attachments' },
    { id: 'audit', label: 'Audit History' },
  ]

  return (
    <div className="so-detail-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-7 pb-16">

        {/* ── Breadcrumb ─────────────────────────── */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate('/invoices')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Invoices
          </button>
          <span style={{ color: 'var(--so-border)' }} className="text-[13px]">/</span>
          <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>{bill.bill_number}</span>
        </div>

        {/* ── Title row ──────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-7 animate-in delay-1">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Bill {bill.bill_number}</h1>
              {getStatusBadge(bill.status)}
            </div>
            <div className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>
              <strong className="font-semibold" style={{ color: 'var(--so-text-primary)' }}>{bill.vendor_name}</strong>
              {bill.vendor_invoice_number && (
                <>
                  {' '}<span style={{ color: 'var(--so-text-tertiary)' }}>·</span>{' '}
                  <span className="font-mono">Vendor Inv #{bill.vendor_invoice_number}</span>
                </>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {bill.status === 'draft' && (
              <button
                className={outlineBtnClass}
                style={outlineBtnStyle}
                onClick={() => setEditDialogOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
            )}
            {bill.status === 'draft' && (
              <button
                className={primaryBtnClass + (postBill.isPending ? ' opacity-50 pointer-events-none' : '')}
                style={primaryBtnStyle}
                onClick={handlePost}
              >
                <Send className="h-3.5 w-3.5" />
                {postBill.isPending ? 'Posting...' : 'Post'}
              </button>
            )}
            {(bill.status === 'posted' || bill.status === 'partial') && (
              <button
                className={primaryBtnClass}
                style={primaryBtnStyle}
                onClick={() => setPaymentDialogOpen(true)}
              >
                <DollarSign className="h-3.5 w-3.5" />
                Record Payment
              </button>
            )}
            {bill.status !== 'void' && bill.status !== 'paid' && (
              <button
                className={dangerBtnClass + (voidBill.isPending ? ' opacity-50 pointer-events-none' : '')}
                style={dangerBtnStyle}
                onClick={handleVoid}
              >
                <Ban className="h-3.5 w-3.5" />
                {voidBill.isPending ? 'Voiding...' : 'Void'}
              </button>
            )}
          </div>
        </div>

        {/* ── Bill Details Card ─────────────────── */}
        <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Bill Details</span>
          </div>

          {/* Row 1: Bill Date | Due Date | Vendor Inv # | PO # */}
          <div className="grid grid-cols-2 md:grid-cols-4" style={{ borderTop: 'none' }}>
            <div className="px-5 py-4" style={{ borderRight: '1px solid var(--so-border-light)', borderBottom: '1px solid var(--so-border-light)' }}>
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Bill Date</div>
              <div className="text-sm font-medium" style={{ color: 'var(--so-text-primary)' }}>
                {format(new Date(bill.bill_date + 'T00:00:00'), 'MMM d, yyyy')}
              </div>
            </div>
            <div className="px-5 py-4" style={{ borderRight: '1px solid var(--so-border-light)', borderBottom: '1px solid var(--so-border-light)' }}>
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Due Date</div>
              <div className="text-sm font-medium" style={{ color: 'var(--so-text-primary)' }}>
                {format(new Date(bill.due_date + 'T00:00:00'), 'MMM d, yyyy')}
              </div>
            </div>
            <div className="px-5 py-4" style={{ borderRight: '1px solid var(--so-border-light)', borderBottom: '1px solid var(--so-border-light)' }}>
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Vendor Inv #</div>
              <div
                className="text-sm font-medium font-mono"
                style={{
                  color: bill.vendor_invoice_number ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)',
                  fontStyle: bill.vendor_invoice_number ? 'normal' : 'italic',
                }}
              >
                {bill.vendor_invoice_number || 'Not set'}
              </div>
            </div>
            <div className="px-5 py-4" style={{ borderRight: '1px solid var(--so-border-light)', borderBottom: '1px solid var(--so-border-light)' }}>
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>PO #</div>
              {bill.purchase_order ? (
                <button
                  type="button"
                  onClick={() => navigate(`/orders/purchase/${bill.purchase_order}`)}
                  className="text-sm font-medium font-mono hover:underline cursor-pointer"
                  style={{ color: 'var(--so-accent)' }}
                >
                  PO {bill.purchase_order}
                </button>
              ) : (
                <div className="text-sm font-medium font-mono" style={{ color: 'var(--so-text-tertiary)', fontStyle: 'italic' }}>
                  Not linked
                </div>
              )}
            </div>
          </div>

          {/* Summary row: Total | Paid | Balance Due | Tax */}
          <div className="grid grid-cols-2 md:grid-cols-4" style={{ background: 'var(--so-bg)' }}>
            <div className="px-5 py-4" style={{ borderRight: '1px solid var(--so-border-light)' }}>
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Total
              </div>
              <div className="text-sm font-bold font-mono" style={{ color: 'var(--so-text-primary)' }}>
                {formatCurrency(bill.total_amount)}
              </div>
            </div>
            <div className="px-5 py-4" style={{ borderRight: '1px solid var(--so-border-light)' }}>
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Paid
              </div>
              <div className="text-sm font-bold font-mono" style={{ color: 'var(--so-success-text)' }}>
                {formatCurrency(bill.amount_paid)}
              </div>
            </div>
            <div className="px-5 py-4" style={{ borderRight: '1px solid var(--so-border-light)' }}>
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Balance Due
              </div>
              <div
                className="text-sm font-bold font-mono"
                style={{ color: balanceNum > 0 ? 'var(--so-danger-text)' : 'var(--so-success-text)' }}
              >
                {formatCurrency(bill.balance_due)}
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Tax
              </div>
              <div className="text-sm font-bold font-mono" style={{ color: 'var(--so-text-primary)' }}>
                {formatCurrency(bill.tax_amount)}
              </div>
            </div>
          </div>

          {/* Notes section */}
          {bill.notes && (
            <div
              className="flex items-start gap-2.5 px-5 py-4"
              style={{ borderTop: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}
            >
              <FileText className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--so-text-tertiary)', opacity: 0.6 }} />
              <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--so-text-secondary)' }}>
                {bill.notes}
              </p>
            </div>
          )}
        </div>

        {/* ── Tabbed Content Card ────────────────────── */}
        <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 pt-3">
            <FolderTabs tabs={tabs} activeTab={activeTab} onTabChange={(id) => setActiveTab(id as TabType)} />
          </div>

          {/* ── Lines Tab ────────────────────────────── */}
          {activeTab === 'lines' && (
            <>
              {bill.status === 'draft' && (
                <div className="px-6 py-3 flex justify-end" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                  <button
                    type="button"
                    className={outlineBtnClass}
                    style={outlineBtnStyle}
                    onClick={() => setAddLineDialogOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Line
                  </button>
                </div>
              )}
              {bill.lines.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {[
                          { label: 'Item', align: 'text-left', cls: 'pl-6 w-[38%]' },
                          { label: 'Qty', align: 'text-right', cls: '' },
                          { label: 'Unit Price', align: 'text-right', cls: '' },
                          { label: 'Expense Acct', align: 'text-left', cls: '' },
                          { label: 'Amount', align: 'text-right', cls: bill.status === 'draft' ? '' : 'pr-6' },
                          ...(bill.status === 'draft' ? [{ label: '', align: '', cls: 'pr-6 w-10' }] : []),
                        ].map((col, i) => (
                          <th
                            key={col.label || `blank-${i}`}
                            className={`text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 ${col.align} ${col.cls}`}
                            style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)' }}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bill.lines.map((line) => (
                        <tr key={line.id} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                          <td className="py-3.5 px-4 pl-6">
                            <div className="font-mono text-[12.5px]" style={{ color: 'var(--so-text-primary)' }}>
                              {line.item_sku || '—'}
                            </div>
                            <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--so-text-secondary)' }}>{line.description}</div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-semibold">
                            {parseFloat(line.quantity).toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono" style={{ color: 'var(--so-text-secondary)' }}>
                            {formatCurrency(line.unit_price)}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[12.5px]" style={{ color: 'var(--so-text-secondary)' }}>
                            {line.expense_account_code || '—'}
                          </td>
                          <td className={`py-3.5 px-4 text-right font-mono font-bold ${bill.status === 'draft' ? '' : 'pr-6'}`}>
                            {formatCurrency(line.amount)}
                          </td>
                          {bill.status === 'draft' && (
                            <td className="py-3.5 px-4 pr-6">
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`Remove this line?`)) {
                                    deleteBillLine.mutate({ billId, lineId: line.id })
                                  }
                                }}
                                className="inline-flex items-center justify-center h-7 w-7 rounded transition-colors cursor-pointer"
                                style={{ color: 'var(--so-danger-text)' }}
                                title="Remove line"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                  No line items
                </div>
              )}

              {/* Totals footer */}
              {bill.lines.length > 0 && (
                <div style={{ borderTop: '2px solid var(--so-text-primary)' }}>
                  <div className="flex items-center justify-end gap-8 px-6 py-3" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                    <span className="text-[13px] font-medium uppercase tracking-wider" style={{ color: 'var(--so-text-tertiary)' }}>Subtotal</span>
                    <span className="font-mono text-sm font-semibold w-28 text-right" style={{ color: 'var(--so-text-primary)' }}>{formatCurrency(bill.subtotal)}</span>
                  </div>
                  {parseFloat(bill.tax_amount) > 0 && (
                    <div className="flex items-center justify-end gap-8 px-6 py-3" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                      <span className="text-[13px] font-medium uppercase tracking-wider" style={{ color: 'var(--so-text-tertiary)' }}>Tax</span>
                      <span className="font-mono text-sm font-semibold w-28 text-right" style={{ color: 'var(--so-text-primary)' }}>{formatCurrency(bill.tax_amount)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-8 px-6 py-4">
                    <span className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--so-text-secondary)' }}>Total</span>
                    <span className="font-mono text-xl font-bold w-28 text-right" style={{ color: 'var(--so-text-primary)' }}>{formatCurrency(bill.total_amount)}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Payments Tab ─────────────────────────── */}
          {activeTab === 'payments' && (
            <>
              {(bill.status === 'posted' || bill.status === 'partial') && (
                <div className="px-6 py-3 flex justify-end" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                  <button
                    type="button"
                    className={outlineBtnClass}
                    style={outlineBtnStyle}
                    onClick={() => setPaymentDialogOpen(true)}
                  >
                    <DollarSign className="h-3.5 w-3.5" />
                    Record Payment
                  </button>
                </div>
              )}
              {payments.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {[
                          { label: 'Date', align: 'text-left', cls: 'pl-6' },
                          { label: 'Amount', align: 'text-right', cls: '' },
                          { label: 'Method', align: 'text-left', cls: '' },
                          { label: 'Reference', align: 'text-left', cls: '' },
                          { label: 'Recorded By', align: 'text-left', cls: 'pr-6' },
                        ].map((col) => (
                          <th
                            key={col.label}
                            className={`text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 ${col.align} ${col.cls}`}
                            style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)' }}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((pmt) => (
                        <tr key={pmt.id} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                          <td className="py-3.5 px-4 pl-6" style={{ color: 'var(--so-text-primary)' }}>
                            {format(new Date(pmt.payment_date + 'T00:00:00'), 'MMM d, yyyy')}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-semibold" style={{ color: 'var(--so-success-text)' }}>
                            {formatCurrency(pmt.amount)}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider"
                              style={{ background: 'var(--so-info-bg)', color: 'var(--so-info-text)' }}
                            >
                              {pmt.payment_method.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[12.5px]" style={{ color: 'var(--so-text-secondary)' }}>
                            {pmt.reference_number || '—'}
                          </td>
                          <td className="py-3.5 px-4 pr-6" style={{ color: 'var(--so-text-secondary)' }}>
                            {pmt.recorded_by_name || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                  No payments recorded
                </div>
              )}
            </>
          )}

          {/* ── Attachments Tab ──────────────────────── */}
          {activeTab === 'attachments' && (
            <div className="p-6">
              <FileUpload appLabel="invoicing" modelName="vendorbill" objectId={billId} />
            </div>
          )}

          {/* ── Audit History Tab ────────────────────── */}
          {activeTab === 'audit' && (
            <div className="p-6">
              <FieldHistoryTab modelType="vendorbill" objectId={billId} />
            </div>
          )}
        </div>
      </div>

      <PanelToggleButton contentType="vendorbill" objectId={billId} onClick={togglePanel} isOpen={panelOpen} />
      <TransactionPanel contentType="vendorbill" objectId={billId} open={panelOpen} onClose={closePanel} label={bill ? `Bill ${bill.bill_number}` : 'Bill'} />

      <RecordBillPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        billId={billId}
        billNumber={bill.bill_number}
        balanceDue={bill.balance_due}
      />

      <EditBillHeaderDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        bill={bill}
      />

      <AddBillLineDialog
        open={addLineDialogOpen}
        onOpenChange={setAddLineDialogOpen}
        billId={billId}
        billNumber={bill.bill_number}
      />
    </div>
  )
}
