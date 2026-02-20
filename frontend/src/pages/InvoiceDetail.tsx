import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft, FileDown, Mail, Send, Ban, FileText,
} from 'lucide-react'
import FileUpload from '@/components/common/FileUpload'
import PrintForm from '@/components/common/PrintForm'
import { format } from 'date-fns'
import { toast } from 'sonner'
import api from '@/api/client'
import EmailModal from '@/components/common/EmailModal'
import { FieldHistoryTab } from '@/components/common/FieldHistoryTab'

/* ── Interfaces ────────────────────────────────────────── */
interface InvoiceLine {
  id: number
  line_number: number
  item: number
  item_sku: string
  description: string
  quantity: string
  uom: number
  uom_code: string
  unit_price: string
  discount_percent: string
  line_total: string
}

interface InvoicePayment {
  id: number
  payment_date: string
  amount: string
  payment_method: string
  reference_number: string
  recorded_by_name: string
}

interface InvoiceDetail {
  id: number
  invoice_number: string
  customer: number
  customer_name: string
  sales_order: number | null
  shipment: number | null
  invoice_date: string
  due_date: string
  payment_terms: string
  status: string
  bill_to_name: string
  bill_to_address: string
  ship_to_name: string
  ship_to_address: string
  subtotal: string
  tax_rate: string
  tax_amount: string
  freight_amount: string
  discount_amount: string
  total_amount: string
  amount_paid: string
  balance_due: string
  is_paid: boolean
  is_overdue: boolean
  customer_po: string
  notes: string
  customer_notes: string
  lines: InvoiceLine[]
  payments: InvoicePayment[]
  created_at: string
  updated_at: string
}

/* ── Status badge helper ─────────────────────────────── */
const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    draft:   { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    sent:    { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)'    },
    partial: { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    paid:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    overdue: { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)'  },
    void:    { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)'  },
  }
  const c = configs[status] || configs.draft
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

/* ── Shared button styles ────────────────────────────── */
const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }
const dangerBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const dangerBtnStyle: React.CSSProperties = { background: 'var(--so-danger-text)', border: '1px solid var(--so-danger-text)' }

type TabType = 'lines' | 'payments' | 'attachments' | 'audit'

/* ═══════════════════════════════════════════════════════ */
export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const invoiceId = parseInt(id || '0', 10)

  const [activeTab, setActiveTab] = useState<TabType>('lines')
  const [emailModalOpen, setEmailModalOpen] = useState(false)

  const { data: invoice, isLoading, refetch } = useQuery({
    queryKey: ['invoices', invoiceId],
    queryFn: async () => {
      const { data } = await api.get<InvoiceDetail>(`/invoices/${invoiceId}/`)
      return data
    },
    enabled: !!invoiceId,
  })

  usePageTitle(invoice ? `Invoice ${invoice.invoice_number}` : 'Invoice')

  const handleSend = async () => {
    if (!invoice || invoice.status !== 'draft') return
    try {
      await api.post(`/invoices/${invoiceId}/send/`)
      toast.success('Invoice marked as sent')
      refetch()
    } catch {
      toast.error('Failed to send invoice')
    }
  }

  const handleVoid = async () => {
    if (!invoice) return
    if (!confirm('Are you sure you want to void this invoice?')) return
    try {
      await api.post(`/invoices/${invoiceId}/void/`)
      toast.success('Invoice voided')
      refetch()
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to void invoice')
    }
  }

  /* ── Loading / Not Found ───────────────────────── */
  if (isLoading) {
    return (
      <div className="so-detail-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="so-detail-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Invoice not found</div>
        </div>
      </div>
    )
  }

  /* ── Helpers ────────────────────────────────────── */
  const fmtCurrency = (val: string | number) => {
    const num = parseFloat(String(val))
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const balanceNum = parseFloat(invoice.balance_due)

  const tabs: { id: TabType; label: string }[] = [
    { id: 'lines', label: 'Lines' },
    { id: 'payments', label: 'Payments' },
    { id: 'attachments', label: 'Attachments' },
    { id: 'audit', label: 'Audit History' },
  ]

  /* ═══════════════════════════════════════════════ */
  /*  RENDER                                         */
  /* ═══════════════════════════════════════════════ */
  return (
    <div className="so-detail-page" style={{ minHeight: '100vh' }}>
      {/* Print Form (hidden on screen, visible in print) */}
      <PrintForm
        title="Invoice"
        documentNumber={invoice.invoice_number}
        status={invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
        fields={[
          { label: 'Customer', value: invoice.customer_name },
          { label: 'Invoice Date', value: format(new Date(invoice.invoice_date + 'T00:00:00'), 'MMM d, yyyy') },
          { label: 'Bill To', value: invoice.bill_to_name },
          { label: 'Due Date', value: format(new Date(invoice.due_date + 'T00:00:00'), 'MMM d, yyyy') },
          { label: 'Ship To', value: invoice.ship_to_name },
          { label: 'Payment Terms', value: invoice.payment_terms },
          { label: 'Customer PO', value: invoice.customer_po || null },
          { label: 'Status', value: invoice.is_overdue ? 'OVERDUE' : invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1) },
        ]}
        summary={[
          { label: 'Subtotal', value: `$${fmtCurrency(invoice.subtotal)}` },
          { label: 'Tax', value: `$${fmtCurrency(invoice.tax_amount)}` },
          { label: 'Total', value: `$${fmtCurrency(invoice.total_amount)}` },
          { label: 'Balance Due', value: `$${fmtCurrency(invoice.balance_due)}` },
        ]}
        notes={invoice.notes}
        columns={[
          { header: '#' },
          { header: 'SKU' },
          { header: 'Description' },
          { header: 'Qty', align: 'right' },
          { header: 'UOM' },
          { header: 'Unit Price', align: 'right' },
          { header: 'Total', align: 'right' },
        ]}
        rows={invoice.lines.map(line => [
          line.line_number,
          line.item_sku,
          line.description,
          parseFloat(line.quantity).toLocaleString(),
          line.uom_code,
          `$${fmtCurrency(line.unit_price)}`,
          `$${fmtCurrency(line.line_total)}`,
        ])}
        totals={[
          { label: 'Subtotal:', value: `$${fmtCurrency(invoice.subtotal)}` },
          { label: `Tax (${(parseFloat(invoice.tax_rate) * 100).toFixed(1)}%):`, value: `$${fmtCurrency(invoice.tax_amount)}` },
          { label: 'Total:', value: `$${fmtCurrency(invoice.total_amount)}` },
        ]}
      />

      {/* ── Main content ──────────────────────────── */}
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16" data-print-hide>

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
          <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>{invoice.invoice_number}</span>
        </div>

        {/* ── Title row ──────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-7 animate-in delay-1">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Invoice {invoice.invoice_number}</h1>
              {getStatusBadge(invoice.status)}
              {invoice.is_overdue && invoice.status !== 'overdue' && getStatusBadge('overdue')}
            </div>
            <div className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>
              <strong className="font-semibold" style={{ color: 'var(--so-text-primary)' }}>{invoice.customer_name}</strong>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={() => window.open(`/api/v1/invoices/${invoiceId}/pdf/`, '_blank')}
            >
              <FileDown className="h-3.5 w-3.5" />
              PDF
            </button>
            <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setEmailModalOpen(true)}>
              <Mail className="h-3.5 w-3.5" />
              Email
            </button>
            {invoice.status === 'draft' && (
              <button className={primaryBtnClass} style={primaryBtnStyle} onClick={handleSend}>
                <Send className="h-3.5 w-3.5" />
                Send
              </button>
            )}
            {invoice.status !== 'void' && invoice.status !== 'paid' && (
              <button className={dangerBtnClass} style={dangerBtnStyle} onClick={handleVoid}>
                <Ban className="h-3.5 w-3.5" />
                Void
              </button>
            )}
          </div>
        </div>

        {/* ── Invoice Details Card ─────────────────── */}
        <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          {/* Card header */}
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Invoice Details</span>
          </div>

          {/* Detail grid - Row 1: Invoice Date | Due Date | Payment Terms | Customer PO */}
          <div className="grid grid-cols-4" style={{ borderTop: 'none' }}>
            {[
              { label: 'Invoice Date', value: format(new Date(invoice.invoice_date + 'T00:00:00'), 'MMM d, yyyy'), empty: false, mono: false },
              { label: 'Due Date', value: format(new Date(invoice.due_date + 'T00:00:00'), 'MMM d, yyyy'), empty: false, mono: false },
              { label: 'Payment Terms', value: invoice.payment_terms || 'Not set', empty: !invoice.payment_terms, mono: false },
              { label: 'Customer PO', value: invoice.customer_po || 'Not set', empty: !invoice.customer_po, mono: true },
            ].map((item, idx) => (
              <div
                key={idx}
                className="px-5 py-4"
                style={{
                  borderRight: (idx + 1) % 4 !== 0 ? '1px solid var(--so-border-light)' : 'none',
                  borderBottom: '1px solid var(--so-border-light)',
                }}
              >
                <div
                  className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5"
                  style={{ color: 'var(--so-text-tertiary)' }}
                >
                  {item.label}
                </div>
                <div
                  className={`text-sm font-medium ${item.mono ? 'font-mono' : ''}`}
                  style={{
                    color: item.empty ? 'var(--so-text-tertiary)' : 'var(--so-text-primary)',
                    fontStyle: item.empty ? 'italic' : 'normal',
                  }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* Detail grid - Row 2: Bill To | Ship To | Status | Balance Due */}
          <div className="grid grid-cols-4" style={{ borderTop: 'none' }}>
            {/* Bill To */}
            <div
              className="px-5 py-4"
              style={{ borderRight: '1px solid var(--so-border-light)', borderBottom: '1px solid var(--so-border-light)' }}
            >
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Bill To
              </div>
              {invoice.bill_to_name ? (
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--so-text-primary)' }}>{invoice.bill_to_name}</div>
                  {invoice.bill_to_address && (
                    <div className="text-[12.5px] mt-0.5 whitespace-pre-line" style={{ color: 'var(--so-text-secondary)' }}>{invoice.bill_to_address}</div>
                  )}
                </div>
              ) : (
                <div className="text-sm font-medium italic" style={{ color: 'var(--so-text-tertiary)' }}>Not set</div>
              )}
            </div>
            {/* Ship To */}
            <div
              className="px-5 py-4"
              style={{ borderRight: '1px solid var(--so-border-light)', borderBottom: '1px solid var(--so-border-light)' }}
            >
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Ship To
              </div>
              {invoice.ship_to_name ? (
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--so-text-primary)' }}>{invoice.ship_to_name}</div>
                  {invoice.ship_to_address && (
                    <div className="text-[12.5px] mt-0.5 whitespace-pre-line" style={{ color: 'var(--so-text-secondary)' }}>{invoice.ship_to_address}</div>
                  )}
                </div>
              ) : (
                <div className="text-sm font-medium italic" style={{ color: 'var(--so-text-tertiary)' }}>Not set</div>
              )}
            </div>
            {/* Status */}
            <div
              className="px-5 py-4"
              style={{ borderRight: '1px solid var(--so-border-light)', borderBottom: '1px solid var(--so-border-light)' }}
            >
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Status
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {getStatusBadge(invoice.status)}
                {invoice.is_overdue && invoice.status !== 'overdue' && getStatusBadge('overdue')}
              </div>
            </div>
            {/* Balance Due */}
            <div
              className="px-5 py-4"
              style={{ borderBottom: '1px solid var(--so-border-light)' }}
            >
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Balance Due
              </div>
              <div
                className="text-sm font-bold font-mono"
                style={{ color: balanceNum > 0 ? 'var(--so-danger-text)' : 'var(--so-success-text)' }}
              >
                ${fmtCurrency(invoice.balance_due)}
              </div>
            </div>
          </div>

          {/* Summary row: Total | Paid | Balance Due | Tax */}
          <div className="grid grid-cols-4" style={{ background: 'var(--so-bg)' }}>
            <div className="px-5 py-4" style={{ borderRight: '1px solid var(--so-border-light)' }}>
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Total
              </div>
              <div className="text-sm font-bold font-mono" style={{ color: 'var(--so-text-primary)' }}>
                ${fmtCurrency(invoice.total_amount)}
              </div>
            </div>
            <div className="px-5 py-4" style={{ borderRight: '1px solid var(--so-border-light)' }}>
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Paid
              </div>
              <div className="text-sm font-bold font-mono" style={{ color: 'var(--so-success-text)' }}>
                ${fmtCurrency(invoice.amount_paid)}
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
                ${fmtCurrency(invoice.balance_due)}
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Tax ({(parseFloat(invoice.tax_rate) * 100).toFixed(1)}%)
              </div>
              <div className="text-sm font-bold font-mono" style={{ color: 'var(--so-text-primary)' }}>
                ${fmtCurrency(invoice.tax_amount)}
              </div>
            </div>
          </div>

          {/* Notes section */}
          {(invoice.notes || invoice.customer_notes) && (
            <div
              className="flex items-start gap-2.5 px-5 py-4"
              style={{ borderTop: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}
            >
              <FileText className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--so-text-tertiary)', opacity: 0.6 }} />
              <div>
                {invoice.notes && (
                  <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--so-text-secondary)' }}>
                    {invoice.notes}
                  </p>
                )}
                {invoice.customer_notes && (
                  <p className="text-[13.5px] leading-relaxed mt-1" style={{ color: 'var(--so-text-secondary)' }}>
                    <span className="font-semibold" style={{ color: 'var(--so-text-primary)' }}>Customer Notes:</span>{' '}
                    {invoice.customer_notes}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Tabbed Content Card ────────────────────── */}
        <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          {/* Tab bar */}
          <div className="flex items-center gap-0 px-6" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-3.5 text-[13px] font-medium transition-colors cursor-pointer"
                style={{
                  borderBottom: activeTab === tab.id ? '2px solid var(--so-accent)' : '2px solid transparent',
                  color: activeTab === tab.id ? 'var(--so-accent)' : 'var(--so-text-tertiary)',
                  marginBottom: '-1px',
                }}
                onMouseEnter={e => {
                  if (activeTab !== tab.id) e.currentTarget.style.color = 'var(--so-text-secondary)'
                }}
                onMouseLeave={e => {
                  if (activeTab !== tab.id) e.currentTarget.style.color = 'var(--so-text-tertiary)'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Lines Tab ────────────────────────────── */}
          {activeTab === 'lines' && (
            <>
              {invoice.lines.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {[
                          { label: 'Item', align: 'text-left', cls: 'pl-6 w-[38%]' },
                          { label: 'Qty', align: 'text-right', cls: '' },
                          { label: 'UOM', align: 'text-left', cls: '' },
                          { label: 'Rate', align: 'text-right', cls: '' },
                          { label: 'Disc %', align: 'text-right', cls: '' },
                          { label: 'Amount', align: 'text-right', cls: 'pr-6' },
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
                      {invoice.lines.map((line) => (
                        <tr key={line.id} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                          {/* Item: SKU (mono) with description below */}
                          <td className="py-3.5 px-4 pl-6">
                            <div className="font-mono text-[12.5px]" style={{ color: 'var(--so-text-primary)' }}>{line.item_sku}</div>
                            <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--so-text-secondary)' }}>{line.description}</div>
                          </td>
                          {/* Qty */}
                          <td className="py-3.5 px-4 text-right font-mono font-semibold">
                            {parseFloat(line.quantity).toLocaleString()}
                          </td>
                          {/* UOM */}
                          <td className="py-3.5 px-4" style={{ color: 'var(--so-text-secondary)' }}>
                            {line.uom_code}
                          </td>
                          {/* Rate */}
                          <td className="py-3.5 px-4 text-right font-mono" style={{ color: 'var(--so-text-secondary)' }}>
                            ${fmtCurrency(line.unit_price)}
                          </td>
                          {/* Disc % */}
                          <td className="py-3.5 px-4 text-right" style={{ color: 'var(--so-text-secondary)' }}>
                            {parseFloat(line.discount_percent) > 0 ? `${line.discount_percent}%` : '\u2014'}
                          </td>
                          {/* Amount */}
                          <td className="py-3.5 px-4 text-right font-mono font-bold pr-6">
                            ${fmtCurrency(line.line_total)}
                          </td>
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
              {invoice.lines.length > 0 && (
                <div style={{ borderTop: '2px solid var(--so-text-primary)' }}>
                  <div className="flex items-center justify-end gap-8 px-6 py-3" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                    <span className="text-[13px] font-medium uppercase tracking-wider" style={{ color: 'var(--so-text-tertiary)' }}>Subtotal</span>
                    <span className="font-mono text-sm font-semibold w-28 text-right" style={{ color: 'var(--so-text-primary)' }}>${fmtCurrency(invoice.subtotal)}</span>
                  </div>
                  {parseFloat(invoice.tax_amount) > 0 && (
                    <div className="flex items-center justify-end gap-8 px-6 py-3" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                      <span className="text-[13px] font-medium uppercase tracking-wider" style={{ color: 'var(--so-text-tertiary)' }}>
                        Tax ({(parseFloat(invoice.tax_rate) * 100).toFixed(1)}%)
                      </span>
                      <span className="font-mono text-sm font-semibold w-28 text-right" style={{ color: 'var(--so-text-primary)' }}>${fmtCurrency(invoice.tax_amount)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-8 px-6 py-4">
                    <span className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--so-text-secondary)' }}>Total</span>
                    <span className="font-mono text-xl font-bold w-28 text-right" style={{ color: 'var(--so-text-primary)' }}>${fmtCurrency(invoice.total_amount)}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Payments Tab ─────────────────────────── */}
          {activeTab === 'payments' && (
            <>
              {invoice.payments.length > 0 ? (
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
                      {invoice.payments.map((pmt) => (
                        <tr key={pmt.id} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                          <td className="py-3.5 px-4 pl-6" style={{ color: 'var(--so-text-primary)' }}>
                            {format(new Date(pmt.payment_date + 'T00:00:00'), 'MMM d, yyyy')}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-semibold" style={{ color: 'var(--so-success-text)' }}>
                            ${fmtCurrency(pmt.amount)}
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
                            {pmt.reference_number || '\u2014'}
                          </td>
                          <td className="py-3.5 px-4 pr-6" style={{ color: 'var(--so-text-secondary)' }}>
                            {pmt.recorded_by_name || '\u2014'}
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
              <FileUpload appLabel="invoicing" modelName="invoice" objectId={invoiceId} />
            </div>
          )}

          {/* ── Audit History Tab ────────────────────── */}
          {activeTab === 'audit' && (
            <div className="p-6">
              <FieldHistoryTab modelType="invoice" objectId={invoiceId} />
            </div>
          )}
        </div>
      </div>

      {/* ── Email Modal ────────────────────────────── */}
      <EmailModal
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
        endpoint={`/invoices/${invoiceId}/email/`}
        defaultSubject={`Invoice ${invoice.invoice_number}`}
        defaultBody={`Dear ${invoice.customer_name},\n\nPlease find attached Invoice ${invoice.invoice_number} for $${fmtCurrency(invoice.total_amount)}.\n\nPayment is due by ${format(new Date(invoice.due_date + 'T00:00:00'), 'MMMM d, yyyy')}.\n\nThank you for your business.`}
      />
    </div>
  )
}
