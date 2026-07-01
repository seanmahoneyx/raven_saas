import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { formatCurrency } from '@/lib/format'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ArrowLeft, Plus } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Textarea } from '@/components/ui/textarea'
import { useCreateBill } from '@/api/invoicing'
import { useAllItems } from '@/api/items'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { SearchableCombobox } from '@/components/common/SearchableCombobox'
import { LineItemGrid } from '@/components/common/LineItemGrid'
import type { LineItemColumn } from '@/components/common/LineItemGrid'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

type BillLineForm = { item: string; description: string; quantity: string; unit_price: string; notes: string }

// A fresh, blank line for the grid's explicit "+ Add Line" action.
const emptyLine = (): BillLineForm => ({
  item: '',
  description: '',
  quantity: '1',
  unit_price: '0.00',
  notes: '',
})

const labelClass = 'block text-[11.5px] font-medium uppercase tracking-widest mb-1.5'
const labelStyle: React.CSSProperties = { color: 'var(--so-text-tertiary)' }

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CreateBill() {
  const navigate = useNavigate()
  const location = useLocation()
  const prefill = (location.state as any) || {}
  usePageTitle('Create Bill')
  const createBill = useCreateBill()

  const [formData, setFormData] = useState({
    vendor: prefill.vendor ? String(prefill.vendor) : '',
    vendor_invoice_number: prefill.vendor_invoice_number || '',
    purchase_order: prefill.purchase_order ? String(prefill.purchase_order) : '',
    bill_date: prefill.bill_date || new Date().toISOString().split('T')[0],
    due_date: prefill.due_date || '',
    notes: prefill.notes || '',
  })

  const buildInitialLines = (): BillLineForm[] => {
    if (prefill.lines?.length) {
      return prefill.lines.map((l: any) => ({
        item: l.item ? String(l.item) : '',
        description: l.description || '',
        quantity: l.quantity ? String(l.quantity) : '',
        unit_price: l.unit_price ? String(l.unit_price) : '',
        notes: l.notes || '',
      }))
    }
    // Standard ERP grid: start with one blank row (matches estimate/contract/SO).
    return [emptyLine()]
  }

  const [linesFormData, setLinesFormData] = useState<BillLineForm[]>(buildInitialLines)

  const [error, setError] = useState('')

  /* ---- Items (shared lookup) ---- */
  const { data: itemsData } = useAllItems()
  const items = itemsData ?? []
  const itemLabel = (val: string) => {
    const it = items.find((i) => String(i.id) === val)
    return it ? `${it.name} – ${it.sku}` : undefined
  }

  /* ---- Line handlers ---- */
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
  const lineColumns: LineItemColumn<BillLineForm>[] = [
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

  /* ---- Computed ---- */
  const editTotal = linesFormData.reduce((sum, line) => {
    const qty = parseFloat(line.quantity) || 0
    const price = parseFloat(line.unit_price) || 0
    return sum + qty * price
  }, 0)

  const isPending = createBill.isPending
  const isMobile = useIsMobile()

  /* ---- Submit ---- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.vendor) {
      setError('Vendor is required')
      return
    }
    if (!formData.vendor_invoice_number.trim()) {
      setError('Vendor invoice number is required')
      return
    }
    if (!formData.bill_date) {
      setError('Bill date is required')
      return
    }
    if (!formData.due_date) {
      setError('Due date is required')
      return
    }
    if (new Date(formData.due_date) < new Date(formData.bill_date)) {
      const msg = 'Due date must be on or after bill date'
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

    // Backend auto-generates `bill_number`; do NOT send it.
    const payload: any = {
      vendor: Number(formData.vendor),
      vendor_invoice_number: formData.vendor_invoice_number,
      bill_date: formData.bill_date,
      due_date: formData.due_date,
      status: 'draft',
      notes: formData.notes || '',
      lines: filledLines.map((line, idx) => ({
        line_number: (idx + 1) * 10,
        item: Number(line.item),
        description: line.description,
        quantity: Number(line.quantity),
        unit_price: line.unit_price,
      })),
    }

    if (formData.purchase_order) {
      payload.purchase_order = Number(formData.purchase_order)
    }

    try {
      const bill = await createBill.mutateAsync(payload)
      navigate(`/bills/${bill.id}`)
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object') {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to create bill'))
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
            New Bill
          </span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in delay-1">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>
              Create Bill
            </h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
              Record an incoming vendor invoice
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
                form="create-bill-form"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                {isPending ? 'Creating...' : 'Create Bill'}
              </button>
            </div>
          )}
        </div>

        <form id="create-bill-form" onSubmit={handleSubmit}>
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
              <span className="text-sm font-semibold">Bill Details</span>
            </div>

            {/* ---- Header Fields ---- */}
            <div className="px-6 py-5">
              {/* Row 1: Vendor (span 2) | Vendor Inv # | Bill Date | Due Date | PO # */}
              <div className="grid grid-cols-6 gap-4">
                <div className="col-span-2">
                  <label className={labelClass} style={labelStyle}>Vendor *</label>
                  <SearchableCombobox
                    entityType="vendor"
                    value={formData.vendor ? Number(formData.vendor) : null}
                    onChange={(id) => setFormData(prev => ({ ...prev, vendor: id ? String(id) : '' }))}
                    placeholder="Select vendor..."
                    allowClear
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Vendor Inv # *</label>
                  <Input
                    value={formData.vendor_invoice_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, vendor_invoice_number: e.target.value }))}
                    placeholder="V-12345"
                    className="h-9 text-sm font-mono"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Bill Date *</label>
                  <Input
                    type="date"
                    value={formData.bill_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, bill_date: e.target.value }))}
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
                  <label className={labelClass} style={labelStyle}>PO # (optional)</label>
                  <NumericInput
                    inputMode="numeric"
                    value={formData.purchase_order}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, purchase_order: v }))}
                    placeholder="—"
                    className="h-9 text-sm font-mono"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
              </div>

              {/* Row 2: Notes (full width) */}
              <div className="mt-4">
                <label className={labelClass} style={labelStyle}>Notes</label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Internal notes about this bill..."
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
              <span className="text-sm font-semibold">Line Items</span>
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
            form="create-bill-form"
          >
            {isPending ? 'Creating...' : 'Create Bill'}
          </button>
        </div>
      )}
    </div>
  )
}
