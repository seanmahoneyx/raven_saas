import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { formatCurrency } from '@/lib/format'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ArrowLeft, Trash2, Plus } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useCreateBill } from '@/api/invoicing'
import { useAllItems } from '@/api/items'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { SearchableCombobox } from '@/components/common/SearchableCombobox'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const EMPTY_LINE = { item: '', description: '', quantity: '', unit_price: '', notes: '' }

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

  const buildInitialLines = () => {
    if (prefill.lines?.length) {
      return prefill.lines.map((l: any) => ({
        item: l.item ? String(l.item) : '',
        description: l.description || '',
        quantity: l.quantity ? String(l.quantity) : '',
        unit_price: l.unit_price ? String(l.unit_price) : '',
        notes: l.notes || '',
      }))
    }
    // Start with no lines — add them one at a time (matches estimate/contract/SO).
    return []
  }

  const [linesFormData, setLinesFormData] = useState<
    { item: string; description: string; quantity: string; unit_price: string; notes: string }[]
  >(buildInitialLines)

  const [error, setError] = useState('')

  /* ---- Items (shared lookup) ---- */
  const { data: itemsData } = useAllItems()
  const items = itemsData ?? []
  const itemLabel = (val: string) => {
    const it = items.find((i) => String(i.id) === val)
    return it ? `${it.name} – ${it.sku}` : undefined
  }

  /* ---- Line handlers ---- */
  const handleLineChange = (index: number, field: string, value: string) => {
    setLinesFormData(prev => prev.map((line, i) =>
      i === index ? { ...line, [field]: value } : line
    ))
  }

  const handleLineItemChange = (index: number, value: string) => {
    const selectedItem = items.find(i => String(i.id) === value)
    setLinesFormData(prev => prev.map((line, i) => {
      if (i !== index) return line
      return {
        ...line,
        item: value,
        description: selectedItem?.name || line.description,
      }
    }))
  }

  const handleAddLine = () => {
    setLinesFormData(prev => [...prev, { ...EMPTY_LINE }])
  }

  const handleRemoveLine = (index: number) => {
    setLinesFormData(prev => prev.filter((_, i) => i !== index))
  }

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
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={formData.purchase_order}
                    onChange={(e) => setFormData(prev => ({ ...prev, purchase_order: e.target.value }))}
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
              <button
                type="button"
                className={outlineBtnClass}
                style={{ ...outlineBtnStyle, padding: '4px 10px', fontSize: '12px' }}
                onClick={handleAddLine}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Line
              </button>
            </div>
            {linesFormData.length === 0 ? (
              <p className="text-[13px] text-center py-6 px-6" style={{ color: 'var(--so-text-tertiary)' }}>
                No lines added. Click "Add Line" to add items to this bill.
              </p>
            ) : (
            // focus-within:overflow-visible lifts the overflow clip while a cell is focused so
            // the item-picker dropdown can extend past the table (overflow-x:auto would clip it).
            <div className="overflow-x-auto focus-within:overflow-visible">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[
                      { label: 'Item', align: 'text-left', cls: 'pl-6 w-[22%]' },
                      { label: 'Description', align: 'text-left', cls: 'w-[25%]' },
                      { label: 'Qty', align: 'text-right', cls: 'w-[10%]' },
                      { label: 'Unit Price', align: 'text-right', cls: 'w-[12%]' },
                      { label: 'Amount', align: 'text-right', cls: 'w-[12%]' },
                      { label: 'Notes', align: 'text-left', cls: 'w-[14%]' },
                      { label: '', align: '', cls: 'pr-6 w-10' },
                    ].map((col, i) => (
                      <th
                        key={col.label || `blank-${i}`}
                        className={`text-[11px] font-semibold uppercase tracking-widest py-2.5 px-3 ${col.align} ${col.cls}`}
                        style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)' }}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linesFormData.map((line, index) => {
                    const lineAmount = (parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0)

                    return (
                      <tr
                        key={index}
                        style={{ borderBottom: '1px solid var(--so-border-light)' }}
                      >
                        {/* Item */}
                        <td className="py-1.5 px-1 pl-6">
                          <SearchableCombobox
                            entityType="item"
                            value={line.item ? Number(line.item) : null}
                            initialLabel={itemLabel(line.item)}
                            onChange={(id) => handleLineItemChange(index, id ? String(id) : '')}
                            placeholder="Select item..."
                          />
                        </td>
                        {/* Description (auto-filled, editable) */}
                        <td className="py-1.5 px-1">
                          <Input
                            value={line.description}
                            onChange={(e) => handleLineChange(index, 'description', e.target.value)}
                            className="h-9 text-sm border shadow-none"
                            placeholder="Description..."
                            tabIndex={0}
                          />
                        </td>
                        {/* Qty */}
                        <td className="py-1.5 px-1">
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            value={line.quantity}
                            onChange={(e) => handleLineChange(index, 'quantity', e.target.value)}
                            className="h-9 text-right text-sm border shadow-none font-mono"
                            placeholder="0"
                            tabIndex={0}
                          />
                        </td>
                        {/* Unit Price */}
                        <td className="py-1.5 px-1">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={line.unit_price}
                            onChange={(e) => handleLineChange(index, 'unit_price', e.target.value)}
                            className="h-9 text-right text-sm border shadow-none font-mono"
                            placeholder="0.00"
                            tabIndex={0}
                          />
                        </td>
                        {/* Amount (read-only) */}
                        <td className="py-1.5 px-3 text-right font-mono text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                          {line.item ? `${formatCurrency(lineAmount)}` : '—'}
                        </td>
                        {/* Notes */}
                        <td className="py-1.5 px-1">
                          <Input
                            value={line.notes}
                            onChange={(e) => handleLineChange(index, 'notes', e.target.value)}
                            className="h-9 text-sm border shadow-none"
                            placeholder="Notes..."
                            tabIndex={0}
                          />
                        </td>
                        {/* Delete */}
                        <td className="py-1.5 px-1 pr-6">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(index)}
                            className="inline-flex items-center justify-center h-7 w-7 rounded transition-colors cursor-pointer"
                            style={{ color: '#dc2626' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-danger-bg)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            tabIndex={0}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--so-border)' }}>
                    <td colSpan={4} className="py-3 px-3 text-right text-[11.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)' }}>Total</td>
                    <td className="py-3 px-3 text-right font-mono text-sm font-bold" style={{ color: 'var(--so-text-primary)' }}>{formatCurrency(editTotal)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            )}
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
