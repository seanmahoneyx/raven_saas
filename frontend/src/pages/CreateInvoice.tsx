import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { formatCurrency } from '@/lib/format'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ArrowLeft, Plus, ClipboardList, X } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useCreateInvoice } from '@/api/invoicing'
import { useParties } from '@/api/parties'
import { useAllItems } from '@/api/items'
import {
  usePickTickets,
  usePickTicket,
  useCreateMultiInvoiceFromPicks,
} from '@/api/pickTickets'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { SearchableCombobox } from '@/components/common/SearchableCombobox'
import { LineItemGrid } from '@/components/common/LineItemGrid'
import type { LineItemColumn } from '@/components/common/LineItemGrid'
import { getStatusBadge } from '@/components/ui/StatusBadge'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

// AR-only creation. AP (Vendor Bill) creation lives in CreateBill.tsx;
// the AR/AP toggle on the Invoices list page routes to the right form.
// Backend enum values from apps/invoicing/models.py:116-124
// Field name on backend is `payment_terms` (NOT `terms`).
const TERMS_OPTIONS = [
  { value: 'NET15', label: 'Net 15' },
  { value: 'NET30', label: 'Net 30' },
  { value: 'NET45', label: 'Net 45' },
  { value: 'NET60', label: 'Net 60' },
  { value: 'DUE_ON_RECEIPT', label: 'Due on Receipt' },
  { value: 'COD', label: 'Cash on Delivery' },
]

type LineForm = { item: string; description: string; quantity: string; unit_price: string; notes: string; pick_line: string }

// A fresh, blank line for the grid's explicit "+ Add Line" action.
// `pick_line` ties a line back to a PickTicketLine when the invoice is being
// rolled from a pick ticket; '' for manually-added lines.
const emptyLine = (): LineForm => ({
  item: '',
  description: '',
  quantity: '1',
  unit_price: '0.00',
  notes: '',
  pick_line: '',
})

const labelClass = 'block text-[11.5px] font-medium uppercase tracking-widest mb-1.5'
const labelStyle: React.CSSProperties = { color: 'var(--so-text-tertiary)' }

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CreateInvoice() {
  const navigate = useNavigate()
  const location = useLocation()
  const prefill = (location.state as any) || {}
  usePageTitle('Create Invoice')
  const createInvoice = useCreateInvoice()
  const createMultiInvoiceFromPicks = useCreateMultiInvoiceFromPicks()

  const [formData, setFormData] = useState({
    party: prefill.party ? String(prefill.party) : '',
    invoice_date: prefill.invoice_date || new Date().toISOString().split('T')[0],
    due_date: prefill.due_date || '',
    payment_terms: prefill.payment_terms || prefill.terms || 'NET30',
    notes: prefill.notes || '',
  })

  const buildInitialLines = (): LineForm[] => {
    if (prefill.lines?.length) {
      return prefill.lines.map((l: any) => ({
        item: l.item ? String(l.item) : '',
        description: l.description || '',
        quantity: l.quantity ? String(l.quantity) : '',
        unit_price: l.unit_price ? String(l.unit_price) : '',
        notes: l.notes || '',
        pick_line: l.pick_line ? String(l.pick_line) : '',
      }))
    }
    // Standard ERP grid: start with one blank row (matches estimate/contract/SO).
    return [emptyLine()]
  }

  const [linesFormData, setLinesFormData] = useState<LineForm[]>(buildInitialLines)

  // Pick ticket the lines were pulled from (drives create-multi-invoice on submit).
  const [sourcePickId, setSourcePickId] = useState<number | null>(
    prefill.sourcePickId ? Number(prefill.sourcePickId) : null
  )
  const [pickDialogOpen, setPickDialogOpen] = useState(false)

  const [error, setError] = useState('')

  /* ---- Customer lookup (AR invoices) ---- */
  const { data: partiesData } = useParties({ party_type: 'CUSTOMER' })
  const parties = partiesData?.results ?? []

  /* ---- Items ---- */
  const { data: itemsData } = useAllItems()
  const items = itemsData ?? []
  const itemLabel = (val: string) => {
    const it = items.find((i) => String(i.id) === val)
    return it ? `${it.name} – ${it.sku}` : undefined
  }

  /* ---- Line handlers ---- */
  // Single cell-change handler. onCellChange only touches the given key, so untouched
  // row fields (notably `pick_line`) are preserved on pick-ticket-sourced rows.
  const handleLineChange = (index: number, key: string, value: string | number | null) => {
    // The item combobox emits a numeric id (or null); everything else is a string.
    const strVal = value == null ? '' : String(value)
    setLinesFormData(prev => prev.map((line, i) => {
      if (i !== index) return line
      const updated = { ...line, [key]: strVal }
      // Item auto-fill: selecting an item populates the description.
      if (key === 'item' && strVal) {
        const selectedItem = items.find(it => String(it.id) === strVal)
        if (selectedItem) updated.description = selectedItem.name
      }
      return updated
    }))
  }

  const handleAddLine = () => {
    setLinesFormData(prev => [...prev, emptyLine()])
  }

  const handleRemoveLine = (index: number) => {
    setLinesFormData(prev => prev.filter((_, i) => i !== index))
  }

  // Column config for the shared editable grid.
  const lineColumns: LineItemColumn<LineForm>[] = [
    {
      key: 'item',
      header: 'Item',
      type: 'item',
      entityType: 'item',
      width: '2fr',
      placeholder: 'Select item...',
      initialLabel: (row) => itemLabel(row.item),
    },
    { key: 'description', header: 'Description', type: 'text', width: '2fr', placeholder: 'Description' },
    { key: 'quantity', header: 'Qty', type: 'numeric', width: '90px', align: 'right' },
    { key: 'unit_price', header: 'Unit Price', type: 'numeric', width: '120px', align: 'right' },
    {
      key: 'total',
      header: 'Total',
      type: 'computed',
      width: '120px',
      align: 'right',
      render: (row) => formatCurrency((parseFloat(row.quantity || '0') || 0) * (parseFloat(row.unit_price || '0') || 0)),
    },
    { key: 'notes', header: 'Notes', type: 'text', width: '1.5fr', placeholder: 'Notes' },
  ]

  /* ---- Pull from Pick Ticket ---- */
  const customerId = formData.party ? Number(formData.party) : null

  // Candidate pick tickets for the chosen customer that still have something to invoice.
  const { data: pickTicketsData, isLoading: picksLoading } = usePickTickets(
    customerId ? { customer: customerId, ordering: '-picked_date' } : undefined
  )
  const candidatePicks = (pickTicketsData?.results ?? []).filter(
    p => p.status !== 'void' && p.status !== 'cancelled' && p.status !== 'invoiced'
  )

  // Load the full detail of the pick ticket the user clicked (to read its lines).
  const [pendingPickId, setPendingPickId] = useState<number | null>(null)
  const { data: pendingPick } = usePickTicket(pendingPickId ?? 0)

  // When the chosen pick ticket's detail arrives, populate the invoice lines.
  useEffect(() => {
    if (!pendingPickId || !pendingPick || pendingPick.id !== pendingPickId) return
    const lines: LineForm[] = pendingPick.lines
      .filter(l => l.quantity_remaining_to_invoice > 0)
      .map(l => ({
        item: String(l.item),
        description: l.item_name || '',
        quantity: String(l.quantity_remaining_to_invoice),
        unit_price: l.unit_price,
        notes: l.notes || '',
        pick_line: String(l.id),
      }))
    if (lines.length === 0) {
      toast.error('This pick ticket has no remaining quantity to invoice')
    } else {
      setLinesFormData(lines)
      setSourcePickId(pendingPick.id)
      toast.success(`Pulled ${lines.length} line${lines.length === 1 ? '' : 's'} from ${pendingPick.pick_number}`)
    }
    setPendingPickId(null)
    setPickDialogOpen(false)
  }, [pendingPick, pendingPickId])

  const handleCustomerChange = (id: number | null) => {
    setFormData(prev => ({ ...prev, party: id ? String(id) : '' }))
    // A new customer invalidates any pick-ticket-sourced lines.
    if (sourcePickId !== null) {
      setSourcePickId(null)
      setLinesFormData(prev => prev.map(l => ({ ...l, pick_line: '' })))
    }
  }

  /* ---- Computed ---- */
  const editTotal = linesFormData.reduce((sum, line) => {
    const qty = parseFloat(line.quantity) || 0
    const price = parseFloat(line.unit_price) || 0
    return sum + qty * price
  }, 0)

  const isPending = createInvoice.isPending || createMultiInvoiceFromPicks.isPending
  const isMobile = useIsMobile()

  /* ---- Submit ---- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.party) {
      setError('Party is required')
      return
    }
    if (!formData.invoice_date) {
      setError('Invoice date is required')
      return
    }
    if (!formData.due_date) {
      setError('Due date is required')
      return
    }
    if (new Date(formData.due_date) < new Date(formData.invoice_date)) {
      const msg = 'Due date must be on or after invoice date'
      setError(msg)
      toast.error(msg)
      return
    }

    const filledLines = linesFormData.filter(line => line.item)

    // Guard: quantity and unit_price must be valid non-negative numbers
    for (const line of filledLines) {
      const qty = parseFloat(line.quantity)
      const price = parseFloat(line.unit_price)
      if (!Number.isFinite(qty) || qty < 0) {
        const msg = 'Each line must have a non-negative quantity'
        setError(msg)
        toast.error(msg)
        return
      }
      if (!Number.isFinite(price) || price < 0) {
        const msg = 'Each line must have a non-negative unit price'
        setError(msg)
        toast.error(msg)
        return
      }
    }

    // If these lines were pulled from a pick ticket (and remain pick-backed),
    // roll them through the create-multi-invoice endpoint so the pick ticket's
    // quantity_invoiced is updated and the invoice is linked.
    const allFromPick =
      sourcePickId !== null &&
      filledLines.length > 0 &&
      filledLines.every(line => line.pick_line)

    try {
      if (allFromPick) {
        const inv = await createMultiInvoiceFromPicks.mutateAsync({
          customer: Number(formData.party),
          payment_terms: formData.payment_terms,
          invoice_date: formData.invoice_date,
          notes: formData.notes || '',
          lines: filledLines.map(line => ({
            pick_line: Number(line.pick_line),
            quantity: Number(line.quantity),
            unit_price: line.unit_price,
          })),
        })
        navigate(`/invoices/${inv.id}`)
        return
      }

      // Manual AR invoice path (unchanged).
      const payload: any = {
        customer: Number(formData.party),
        invoice_date: formData.invoice_date,
        due_date: formData.due_date,
        payment_terms: formData.payment_terms,
        notes: formData.notes || '',
        lines: filledLines.map((line, idx) => ({
          line_number: idx + 1,
          item: Number(line.item),
          description: line.description,
          quantity: Number(line.quantity),
          unit_price: line.unit_price,
          notes: line.notes || '',
        })),
      }
      const inv = await createInvoice.mutateAsync(payload)
      navigate(`/invoices/${inv.id}`)
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object') {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to create invoice'))
      }
    }
  }

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className={`max-w-[1280px] mx-auto px-4 md:px-8 py-7 ${isMobile ? 'pb-32 px-4' : 'pb-16'}`}>

        {/* Breadcrumb */}
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
          <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>
            New Invoice
          </span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in delay-1">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>
              Create Invoice
            </h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
              {formData.party
                ? parties.find(p => String(p.id) === formData.party)?.display_name || 'Fill in invoice details below'
                : 'Fill in invoice details below'}
            </p>
          </div>
          {!isMobile && (
            <div className="flex items-center gap-2">
              <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate('/invoices')}>
                Cancel
              </button>
              <button
                className={primaryBtnClass + (isPending ? ' opacity-50 pointer-events-none' : '')}
                style={primaryBtnStyle}
                onClick={handleSubmit as any}
                type="submit"
                form="create-invoice-form"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                {isPending ? 'Creating...' : 'Create Invoice'}
              </button>
            </div>
          )}
        </div>

        <form id="create-invoice-form" onSubmit={handleSubmit}>
          {/* Error */}
          {error && (
            <div
              className="rounded-md p-3 mb-4 text-sm animate-in"
              style={{ background: 'var(--so-danger-bg)', color: 'var(--so-danger-text)', border: '1px solid var(--so-danger-text)' }}
            >
              {error}
            </div>
          )}

          {/* ============ UNIFIED CARD ============ */}
          {/* No `overflow-hidden`: line-item rows host SearchableCombobox dropdowns that
              must overflow the card instead of being clipped. */}
          <div
            className="rounded-[14px] border animate-in delay-2"
            style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
          >
            {/* Card header */}
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Invoice Details</span>
            </div>

            {/* ---- Header Fields ---- */}
            <div className="px-6 py-5">
              {/* Row 1: Invoice Type | Party (span 2) | Invoice Date | Due Date | Terms */}
              <div className="grid grid-cols-5 gap-4">
                <div className="col-span-2">
                  <label className={labelClass} style={labelStyle}>Customer *</label>
                  <SearchableCombobox
                    entityType="customer"
                    value={formData.party ? Number(formData.party) : null}
                    onChange={handleCustomerChange}
                    placeholder="Select customer..."
                    allowClear
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Invoice Date *</label>
                  <Input
                    type="date"
                    value={formData.invoice_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, invoice_date: e.target.value }))}
                    className="h-9 text-sm"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Due Date *</label>
                  <Input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                    className="h-9 text-sm"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Terms</label>
                  <Select
                    value={formData.payment_terms}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, payment_terms: value }))}
                  >
                    <SelectTrigger
                      className="h-9 text-sm"
                      style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TERMS_OPTIONS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: Notes (full width) */}
              <div className="mt-4">
                <label className={labelClass} style={labelStyle}>Notes</label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Invoice notes..."
                  rows={3}
                  className="text-sm min-h-0"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)', minHeight: '72px' }}
                />
              </div>
            </div>

            {/* ---- Separator between header and line items ---- */}
            <div style={{ borderTop: '1px solid var(--so-border)' }} />

            {/* ---- Line Items ---- */}
            <div className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Line Items</span>
                {sourcePickId !== null && (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--so-accent-light)', color: 'var(--so-accent)' }}
                  >
                    <ClipboardList className="h-3 w-3" />
                    From Pick Ticket
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={outlineBtnClass + (customerId ? '' : ' opacity-50 pointer-events-none')}
                  style={{ ...outlineBtnStyle, padding: '4px 10px', fontSize: '12px' }}
                  onClick={() => setPickDialogOpen(true)}
                  title={customerId ? 'Pull uninvoiced lines from a pick ticket' : 'Select a customer first'}
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Pull from Pick Ticket
                </button>
              </div>
            </div>
            <div className="px-6 pb-5">
              <LineItemGrid
                lines={linesFormData}
                columns={lineColumns}
                onCellChange={handleLineChange}
                onAddLine={handleAddLine}
                onRemoveLine={handleRemoveLine}
              />
              <div className="flex justify-end pr-1 pt-3 mt-3" style={{ borderTop: '1px solid var(--so-border-light)' }}>
                <span className="text-[13px] mr-4" style={{ color: 'var(--so-text-tertiary)' }}>Total:</span>
                <span className="font-mono font-semibold text-sm" style={{ color: 'var(--so-text-primary)' }}>{formatCurrency(editTotal)}</span>
              </div>
            </div>
          </div>
        </form>

      </div>

      {/* Mobile sticky bottom bar */}
      {isMobile && (
        <div
          className="fixed bottom-16 left-0 right-0 z-50 flex items-center gap-3 px-4 py-3 shadow-lg"
          style={{ background: 'var(--so-surface)', borderTop: '1px solid var(--so-border)' }}
        >
          <button
            type="button"
            className={outlineBtnClass}
            style={{ ...outlineBtnStyle, minHeight: 44 }}
            onClick={handleAddLine}
          >
            <Plus className="h-4 w-4" />
            Add Line
          </button>
          <span
            className="flex-1 text-center font-mono text-sm font-semibold"
            style={{ color: 'var(--so-text-primary)' }}
          >
            {formatCurrency(editTotal)}
          </span>
          <button
            className={primaryBtnClass + (isPending ? ' opacity-50 pointer-events-none' : '')}
            style={{ ...primaryBtnStyle, minHeight: 44 }}
            onClick={handleSubmit as any}
            type="submit"
            form="create-invoice-form"
          >
            {isPending ? 'Creating...' : 'Create Invoice'}
          </button>
        </div>
      )}

      {/* ── Pick Ticket picker dialog ─────────────── */}
      <Dialog open={pickDialogOpen} onOpenChange={setPickDialogOpen}>
        <DialogContent className="max-w-xl" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <DialogHeader>
            <DialogTitle>Pull from Pick Ticket</DialogTitle>
            <DialogDescription>
              Select a picked-but-uninvoiced ticket. Its remaining quantities will populate the invoice lines.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2">
            {!customerId ? (
              <p className="text-[13px] py-6 text-center" style={{ color: 'var(--so-text-tertiary)' }}>
                Select a customer first.
              </p>
            ) : picksLoading ? (
              <p className="text-[13px] py-6 text-center" style={{ color: 'var(--so-text-tertiary)' }}>
                Loading pick tickets…
              </p>
            ) : candidatePicks.length === 0 ? (
              <p className="text-[13px] py-6 text-center" style={{ color: 'var(--so-text-tertiary)' }}>
                No open pick tickets for this customer.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {candidatePicks.map(pick => (
                  <button
                    key={pick.id}
                    type="button"
                    onClick={() => setPendingPickId(pick.id)}
                    className="w-full text-left rounded-lg border px-4 py-3 transition-colors cursor-pointer"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-bg)' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--so-accent)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--so-border)')}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                        {pick.pick_number}
                      </span>
                      {getStatusBadge(pick.status)}
                    </div>
                    <div className="mt-1 text-[12.5px] flex items-center gap-2 flex-wrap" style={{ color: 'var(--so-text-tertiary)' }}>
                      <span>{pick.warehouse_code}</span>
                      {pick.sales_order_number && (
                        <>
                          <span>·</span>
                          <span className="font-mono">{pick.sales_order_number}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>{pick.num_lines} {pick.num_lines === 1 ? 'line' : 'lines'}</span>
                      <span>·</span>
                      <span className="font-mono">{formatCurrency(pick.subtotal)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={() => setPickDialogOpen(false)}
            >
              <X className="h-3.5 w-3.5" />
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
