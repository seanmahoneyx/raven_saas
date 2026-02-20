import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateSalesOrder } from '@/api/orders'
import { useCustomers, useLocations } from '@/api/parties'
import { useItems, useUnitsOfMeasure } from '@/api/items'
import { usePriceLookup } from '@/api/priceLists'
import { useContractsByCustomer } from '@/api/contracts'
import type { SalesOrderClass } from '@/types/api'
import { toast } from 'sonner'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CREATE_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
]

const ORDER_CLASSES: { value: SalesOrderClass; label: string }[] = [
  { value: 'STANDARD', label: 'Standard' },
  { value: 'RUSH', label: 'Rush' },
  { value: 'BLANKET', label: 'Blanket' },
  { value: 'SAMPLE', label: 'Sample' },
  { value: 'INTERNAL', label: 'Internal' },
]

const EMPTY_LINE = { item: '', quantity_ordered: '', uom: '', unit_price: '', notes: '', contract: '' }

/** Number of pre-rendered blank rows */
const INITIAL_EMPTY_ROWS = 5

/** Column indices for keyboard navigation */
const COL_COUNT = 6 // item, qty, uom, rate, notes, (contract is conditional but skip it for tab)

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

const labelClass = 'block text-[11.5px] font-medium uppercase tracking-widest mb-1.5'
const labelStyle: React.CSSProperties = { color: 'var(--so-text-tertiary)' }

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CreateSalesOrder() {
  const navigate = useNavigate()
  const location = useLocation()
  const copyData = (location.state as any)?.copyFrom
  usePageTitle(copyData ? 'Copy Sales Order' : 'New Sales Order')
  const createOrder = useCreateSalesOrder()

  const { data: customersData } = useCustomers()
  const { data: locationsData } = useLocations()
  const { data: itemsData } = useItems()
  const { data: uomData } = useUnitsOfMeasure()

  const [error, setError] = useState('')
  const [priceLookupLine, setPriceLookupLine] = useState<number | null>(null)
  const [showDraftConfirm, setShowDraftConfirm] = useState(false)

  const [formData, setFormData] = useState({
    order_number: copyData?.order_number || '',
    status: copyData?.status || 'draft',
    customer: copyData?.customer || '',
    customer_po: copyData?.customer_po || '',
    order_date: copyData?.order_date || new Date().toISOString().split('T')[0],
    scheduled_date: copyData?.scheduled_date || '',
    ship_to: copyData?.ship_to || '',
    bill_to: copyData?.bill_to || '',
    notes: copyData?.notes || '',
    order_class: (copyData?.order_class as SalesOrderClass) || 'STANDARD',
  })

  const buildInitialLines = () => {
    if (copyData?.lines?.length) {
      const copied = copyData.lines.map((l: any) => ({ ...l, notes: l.notes || '', contract: '' }))
      // pad to at least INITIAL_EMPTY_ROWS
      while (copied.length < INITIAL_EMPTY_ROWS) copied.push({ ...EMPTY_LINE })
      return copied
    }
    return Array.from({ length: INITIAL_EMPTY_ROWS }, () => ({ ...EMPTY_LINE }))
  }

  const [linesFormData, setLinesFormData] = useState<
    { item: string; quantity_ordered: string; uom: string; unit_price: string; notes: string; contract: string }[]
  >(buildInitialLines)

  const customers = customersData?.results ?? []
  const allLocations = locationsData?.results ?? []
  const items = itemsData?.results ?? []
  const uoms = uomData?.results ?? []

  const selectedCustomer = customers.find((c) => String(c.id) === formData.customer)
  const customerLocations = selectedCustomer
    ? allLocations.filter((l) => l.party === selectedCustomer.party)
    : []

  /* ---- Contracts ---- */
  const { data: customerContracts } = useContractsByCustomer(
    formData.customer ? Number(formData.customer) : 0
  )

  const activeContracts = (customerContracts ?? []).filter(c => c.status === 'active')
  const contractsByItem = new Map<number, { contractNumber: string; unitPrice: string; remainingQty: number }[]>()
  activeContracts.forEach(contract => {
    contract.lines?.forEach(cl => {
      const options = contractsByItem.get(cl.item) || []
      options.push({
        contractNumber: contract.contract_number,
        unitPrice: cl.unit_price,
        remainingQty: cl.remaining_qty,
      })
      contractsByItem.set(cl.item, options)
    })
  })

  /* ---- Price lookup ---- */
  const lookupLine = priceLookupLine !== null ? linesFormData[priceLookupLine] : null
  const { data: priceData, isFetching: isPriceFetching } = usePriceLookup(
    formData.customer ? Number(formData.customer) : undefined,
    lookupLine?.item ? Number(lookupLine.item) : undefined,
    lookupLine?.quantity_ordered ? Number(lookupLine.quantity_ordered) : undefined,
  )

  useEffect(() => {
    if (priceLookupLine === null || isPriceFetching) return
    if (priceLookupLine >= linesFormData.length) {
      setPriceLookupLine(null)
      return
    }
    if (priceData?.unit_price) {
      const currentLine = linesFormData[priceLookupLine]
      if (currentLine.unit_price === '0.00' || currentLine.unit_price === '') {
        setLinesFormData(prev => prev.map((line, i) =>
          i === priceLookupLine ? { ...line, unit_price: priceData.unit_price } : line
        ))
      }
    }
    setPriceLookupLine(null)
  }, [priceData, priceLookupLine, linesFormData, isPriceFetching])

  /* ---- Cell refs for Excel-style navigation ---- */
  const cellRefs = useRef<(HTMLElement | null)[][]>([])

  const setCellRef = useCallback((row: number, col: number, el: HTMLElement | null) => {
    if (!cellRefs.current[row]) cellRefs.current[row] = []
    cellRefs.current[row][col] = el
  }, [])

  const focusCell = useCallback((row: number, col: number) => {
    const el = cellRefs.current[row]?.[col]
    if (el) {
      // For Select triggers, find the button inside
      const focusable = el.querySelector('button') || el.querySelector('input') || el
      ;(focusable as HTMLElement).focus?.()
    }
  }, [])

  const ensureRowExists = useCallback((rowIndex: number) => {
    setLinesFormData(prev => {
      if (rowIndex < prev.length) return prev
      const extra = Array.from({ length: rowIndex - prev.length + 1 }, () => ({ ...EMPTY_LINE }))
      return [...prev, ...extra]
    })
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent, rowIndex: number, colIndex: number) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      if (colIndex < COL_COUNT - 1) {
        // Move to next cell in same row
        e.preventDefault()
        focusCell(rowIndex, colIndex + 1)
      } else {
        // Last cell -> move to first cell of next row
        e.preventDefault()
        ensureRowExists(rowIndex + 1)
        setTimeout(() => focusCell(rowIndex + 1, 0), 0)
      }
    } else if (e.key === 'Tab' && e.shiftKey) {
      if (colIndex > 0) {
        e.preventDefault()
        focusCell(rowIndex, colIndex - 1)
      } else if (rowIndex > 0) {
        e.preventDefault()
        focusCell(rowIndex - 1, COL_COUNT - 1)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      ensureRowExists(rowIndex + 1)
      setTimeout(() => focusCell(rowIndex + 1, colIndex), 0)
    }
  }, [focusCell, ensureRowExists])

  /* ---- Customer change with auto-populate ---- */
  const handleCustomerChange = (v: string) => {
    const cust = customers.find(c => String(c.id) === v)
    setFormData(prev => ({
      ...prev,
      customer: v,
      ship_to: cust?.default_ship_to ? String(cust.default_ship_to) : '',
      bill_to: cust?.default_bill_to ? String(cust.default_bill_to) : '',
    }))
  }

  /* ---- Line handlers ---- */
  const handleRemoveLine = (index: number) => {
    setLinesFormData(prev => {
      const next = prev.filter((_, i) => i !== index)
      // Keep at least INITIAL_EMPTY_ROWS
      while (next.length < INITIAL_EMPTY_ROWS) next.push({ ...EMPTY_LINE })
      return next
    })
  }

  const handleLineChange = (index: number, field: string, value: string) => {
    setLinesFormData(prev => prev.map((line, i) =>
      i === index ? { ...line, [field]: value } : line
    ))
  }

  const handleLineItemChange = (index: number, value: string) => {
    const selectedItem = items.find(i => String(i.id) === value)
    const itemContracts = value ? contractsByItem.get(Number(value)) : undefined
    const bestContract = itemContracts?.[0]

    setLinesFormData(prev => prev.map((line, i) => {
      if (i !== index) return line
      return {
        ...line,
        item: value,
        uom: selectedItem ? String(selectedItem.base_uom) : line.uom,
        unit_price: bestContract?.unitPrice || '0.00',
        contract: bestContract?.contractNumber || '',
      }
    }))
    if (value && formData.customer && !bestContract) {
      setPriceLookupLine(index)
    }
  }

  const handleLineQtyChange = (index: number, value: string) => {
    const hasContract = !!linesFormData[index]?.contract
    setLinesFormData(prev => prev.map((line, i) =>
      i === index ? { ...line, quantity_ordered: value, ...(hasContract ? {} : { unit_price: '0.00' }) } : line
    ))
    if (value && formData.customer && linesFormData[index]?.item && !hasContract) {
      setPriceLookupLine(index)
    }
  }

  const handleContractChange = (index: number, contractNumber: string) => {
    const line = linesFormData[index]
    const itemContracts = line.item ? contractsByItem.get(Number(line.item)) : undefined
    const selected = itemContracts?.find(c => c.contractNumber === contractNumber)

    setLinesFormData(prev => prev.map((l, i) => {
      if (i !== index) return l
      return {
        ...l,
        contract: contractNumber,
        unit_price: selected?.unitPrice || l.unit_price,
      }
    }))
  }

  /* ---- Currency formatting ---- */
  const fmtCurrency = (val: string | number) => {
    const num = parseFloat(String(val))
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const editTotal = linesFormData.reduce((sum, line) => {
    const qty = parseFloat(line.quantity_ordered) || 0
    const price = parseFloat(line.unit_price) || 0
    return sum + qty * price
  }, 0)

  const isPending = createOrder.isPending

  /* ---- Check if a line row has any data ---- */
  const lineHasData = (line: typeof linesFormData[number]) =>
    !!(line.item || line.quantity_ordered || line.notes)

  /* ---- Submit ---- */
  const handleSubmit = async () => {
    setError('')

    if (!formData.customer) {
      setError('Customer is required')
      return
    }

    // Filter to only lines with data
    const filledLines = linesFormData.filter(line => line.item)

    const payload = {
      order_number: formData.order_number || undefined,
      status: formData.status,
      customer: Number(formData.customer),
      order_date: formData.order_date,
      scheduled_date: formData.scheduled_date || null,
      ship_to: formData.ship_to ? Number(formData.ship_to) : null,
      bill_to: formData.bill_to ? Number(formData.bill_to) : null,
      customer_po: formData.customer_po || '',
      notes: formData.notes || '',
      order_class: formData.order_class,
      priority: 5,
      lines: filledLines.map((line, idx) => ({
        line_number: idx + 1,
        item: Number(line.item),
        quantity_ordered: Number(line.quantity_ordered),
        uom: Number(line.uom),
        unit_price: line.unit_price,
      })),
    }

    try {
      await createOrder.mutateAsync(payload as any)
      navigate('/customers/open-orders')
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object') {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to create sales order'))
      }
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.status === 'draft') {
      setShowDraftConfirm(true)
      return
    }
    handleSubmit()
  }

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Sales Orders
          </button>
          <span style={{ color: 'var(--so-border)' }} className="text-[13px]">/</span>
          <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>
            {copyData ? 'Copy Sales Order' : 'New Sales Order'}
          </span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in delay-1">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>
              {copyData ? 'Copy Sales Order' : 'New Sales Order'}
            </h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
              {selectedCustomer ? selectedCustomer.party_display_name : 'Fill in order details below'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate(-1)}>
              Cancel
            </button>
            <button
              className={primaryBtnClass + (isPending ? ' opacity-50 pointer-events-none' : '')}
              style={primaryBtnStyle}
              onClick={onSubmit as any}
              type="submit"
              form="create-so-form"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              {isPending ? 'Creating...' : 'Create Order'}
            </button>
          </div>
        </div>

        <form id="create-so-form" onSubmit={onSubmit}>
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
          <div
            className="rounded-[14px] border overflow-hidden animate-in delay-2"
            style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
          >
            {/* Card header */}
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Order Details</span>
            </div>

            {/* ---- Header Fields ---- */}
            <div className="px-6 py-5">
              {/* Row 1: Customer (span 2) | Customer PO | Order Date | Scheduled Date | Status */}
              <div className="grid grid-cols-6 gap-4">
                <div className="col-span-2">
                  <label className={labelClass} style={labelStyle}>Customer *</label>
                  <Select
                    value={formData.customer}
                    onValueChange={handleCustomerChange}
                  >
                    <SelectTrigger
                      className="h-9 text-sm"
                      style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                    >
                      <SelectValue placeholder="Select customer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.party_code} - {c.party_display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Customer PO</label>
                  <Input
                    value={formData.customer_po}
                    onChange={(e) => setFormData({ ...formData, customer_po: e.target.value })}
                    placeholder="PO reference"
                    className="h-9 text-sm"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Order Date</label>
                  <Input
                    type="date"
                    value={formData.order_date}
                    onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                    className="h-9 text-sm"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Scheduled Date</label>
                  <Input
                    type="date"
                    value={formData.scheduled_date}
                    onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                    className="h-9 text-sm"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Status</label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger
                      className="h-9 text-sm"
                      style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CREATE_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: Ship To | Bill To | Class | Terms (ro) | Sales Rep (ro) | CSR (ro) */}
              <div className="grid grid-cols-6 gap-4 mt-4">
                <div>
                  <label className={labelClass} style={labelStyle}>Ship To</label>
                  <Select
                    value={formData.ship_to}
                    onValueChange={(v) => setFormData({ ...formData, ship_to: v })}
                    disabled={!formData.customer}
                  >
                    <SelectTrigger
                      className="h-9 text-sm"
                      style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                    >
                      <SelectValue placeholder="Select location..." />
                    </SelectTrigger>
                    <SelectContent>
                      {customerLocations.map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>
                          {l.code} - {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Bill To</label>
                  <Select
                    value={formData.bill_to}
                    onValueChange={(v) => setFormData({ ...formData, bill_to: v })}
                    disabled={!formData.customer}
                  >
                    <SelectTrigger
                      className="h-9 text-sm"
                      style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                    >
                      <SelectValue placeholder="Same as ship to" />
                    </SelectTrigger>
                    <SelectContent>
                      {customerLocations.map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>
                          {l.code} - {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Class</label>
                  <Select
                    value={formData.order_class}
                    onValueChange={(v) => setFormData({ ...formData, order_class: v as SalesOrderClass })}
                  >
                    <SelectTrigger
                      className="h-9 text-sm"
                      style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDER_CLASSES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Read-only: Terms */}
                <div>
                  <label className={labelClass} style={labelStyle}>Terms</label>
                  <div
                    className="h-9 flex items-center px-3 rounded-md text-sm"
                    style={{ background: 'var(--so-bg)', color: 'var(--so-text-secondary)', border: '1px solid var(--so-border-light)' }}
                  >
                    {selectedCustomer?.payment_terms || '\u2014'}
                  </div>
                </div>
                {/* Read-only: Sales Rep */}
                <div>
                  <label className={labelClass} style={labelStyle}>Sales Rep</label>
                  <div
                    className="h-9 flex items-center px-3 rounded-md text-sm"
                    style={{ background: 'var(--so-bg)', color: 'var(--so-text-secondary)', border: '1px solid var(--so-border-light)' }}
                  >
                    {selectedCustomer?.sales_rep_name || '\u2014'}
                  </div>
                </div>
                {/* Read-only: CSR */}
                <div>
                  <label className={labelClass} style={labelStyle}>CSR</label>
                  <div
                    className="h-9 flex items-center px-3 rounded-md text-sm"
                    style={{ background: 'var(--so-bg)', color: 'var(--so-text-secondary)', border: '1px solid var(--so-border-light)' }}
                  >
                    {selectedCustomer?.csr_name || '\u2014'}
                  </div>
                </div>
              </div>

              {/* Row 3: Notes (full width) */}
              <div className="mt-4">
                <label className={labelClass} style={labelStyle}>Notes</label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Order notes..."
                  rows={3}
                  className="text-sm min-h-0"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)', minHeight: '72px' }}
                />
              </div>
            </div>

            {/* ---- Separator between header and line items ---- */}
            <div style={{ borderTop: '1px solid var(--so-border)' }} />

            {/* ---- Line Items ---- */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[
                      { label: 'Item', align: 'text-left', cls: 'pl-6 w-[22%]' },
                      { label: 'Description', align: 'text-left', cls: 'flex-1' },
                      { label: 'Contract', align: 'text-left', cls: 'w-[12%]' },
                      { label: 'Qty', align: 'text-right', cls: 'w-[7%]' },
                      { label: 'UOM', align: 'text-left', cls: 'w-[7%]' },
                      { label: 'Rate', align: 'text-right', cls: 'w-[9%]' },
                      { label: 'Amount', align: 'text-right', cls: 'w-[9%]' },
                      { label: 'Notes', align: 'text-left', cls: 'w-[12%]' },
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
                    const selectedItem = items.find(i => String(i.id) === line.item)
                    const itemContracts = line.item ? contractsByItem.get(Number(line.item)) : undefined
                    const lineAmount = (parseFloat(line.quantity_ordered) || 0) * (parseFloat(line.unit_price) || 0)
                    const isEmpty = !lineHasData(line)

                    return (
                      <tr
                        key={index}
                        style={{
                          borderBottom: '1px solid var(--so-border-light)',
                          opacity: isEmpty ? 0.5 : 1,
                          transition: 'opacity 0.15s',
                        }}
                        onFocus={() => {
                          // Make the row fully visible when focused
                          const tr = cellRefs.current[index]?.[0]?.closest('tr')
                          if (tr) tr.style.opacity = '1'
                        }}
                        onBlur={(e) => {
                          // Restore placeholder styling if still empty after blur
                          const tr = e.currentTarget
                          setTimeout(() => {
                            if (!tr.contains(document.activeElement)) {
                              const currentLine = linesFormData[index]
                              if (currentLine && !lineHasData(currentLine)) {
                                tr.style.opacity = '0.5'
                              }
                            }
                          }, 0)
                        }}
                      >
                        {/* Item (col 0) */}
                        <td className="py-1.5 px-1 pl-6">
                          <div ref={(el) => setCellRef(index, 0, el)} onKeyDown={(e) => handleKeyDown(e, index, 0)}>
                            <Select
                              value={line.item}
                              onValueChange={(v) => handleLineItemChange(index, v)}
                            >
                              <SelectTrigger
                                className="h-9 text-sm border-0 bg-transparent shadow-none"
                                style={{ borderColor: 'transparent', background: 'transparent' }}
                              >
                                <SelectValue placeholder="Select item..." />
                              </SelectTrigger>
                              <SelectContent>
                                {items.map((item) => (
                                  <SelectItem key={item.id} value={String(item.id)}>
                                    {item.sku} - {item.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </td>
                        {/* Description (read-only) */}
                        <td className="py-1.5 px-3 text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>
                          {selectedItem?.name || '\u2014'}
                        </td>
                        {/* Contract */}
                        <td className="py-1.5 px-1">
                          {itemContracts && itemContracts.length > 0 ? (
                            <Select
                              value={line.contract || 'none'}
                              onValueChange={(v) => handleContractChange(index, v === 'none' ? '' : v)}
                            >
                              <SelectTrigger
                                className="h-9 text-sm border-0 bg-transparent shadow-none"
                                style={{ borderColor: 'transparent', background: 'transparent', color: 'var(--so-accent)' }}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No contract</SelectItem>
                                {itemContracts.map((c) => (
                                  <SelectItem key={c.contractNumber} value={c.contractNumber}>
                                    {c.contractNumber} @ ${c.unitPrice} ({c.remainingQty.toLocaleString()} rem.)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-[13px] px-3" style={{ color: 'var(--so-text-tertiary)' }}>{'\u2014'}</span>
                          )}
                        </td>
                        {/* Qty (col 1) */}
                        <td className="py-1.5 px-1">
                          <Input
                            ref={(el) => setCellRef(index, 1, el as any)}
                            type="text"
                            inputMode="numeric"
                            value={line.quantity_ordered}
                            onChange={(e) => handleLineQtyChange(index, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, index, 1)}
                            className="h-9 text-right text-sm border-0 bg-transparent shadow-none font-mono"
                            placeholder="0"
                            tabIndex={0}
                          />
                        </td>
                        {/* UOM (col 2) */}
                        <td className="py-1.5 px-1">
                          <div ref={(el) => setCellRef(index, 2, el)} onKeyDown={(e) => handleKeyDown(e, index, 2)}>
                            <Select
                              value={line.uom}
                              onValueChange={(v) => handleLineChange(index, 'uom', v)}
                            >
                              <SelectTrigger
                                className="h-9 text-sm border-0 bg-transparent shadow-none"
                                style={{ borderColor: 'transparent', background: 'transparent' }}
                              >
                                <SelectValue placeholder="UOM" />
                              </SelectTrigger>
                              <SelectContent>
                                {uoms.map((uom) => (
                                  <SelectItem key={uom.id} value={String(uom.id)}>
                                    {uom.code}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </td>
                        {/* Rate (col 3) */}
                        <td className="py-1.5 px-1">
                          <Input
                            ref={(el) => setCellRef(index, 3, el as any)}
                            type="text"
                            inputMode="decimal"
                            value={line.unit_price}
                            onChange={(e) => handleLineChange(index, 'unit_price', e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, index, 3)}
                            className="h-9 text-right text-sm border-0 bg-transparent shadow-none font-mono"
                            placeholder="0.00"
                            tabIndex={0}
                          />
                          {priceLookupLine === index && isPriceFetching && (
                            <span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Looking up...</span>
                          )}
                        </td>
                        {/* Amount (read-only) */}
                        <td className="py-1.5 px-3 text-right font-mono text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                          {line.item ? `$${fmtCurrency(lineAmount)}` : '\u2014'}
                        </td>
                        {/* Notes (col 4) */}
                        <td className="py-1.5 px-1">
                          <Input
                            ref={(el) => setCellRef(index, 4, el as any)}
                            value={line.notes}
                            onChange={(e) => handleLineChange(index, 'notes', e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, index, 4)}
                            className="h-9 text-sm border-0 bg-transparent shadow-none"
                            placeholder="Notes..."
                            tabIndex={0}
                          />
                        </td>
                        {/* Delete (col 5 for keyboard, but button only) */}
                        <td className="py-1.5 px-1 pr-6">
                          {lineHasData(line) && (
                            <button
                              ref={(el) => setCellRef(index, 5, el as any)}
                              type="button"
                              onClick={() => handleRemoveLine(index)}
                              onKeyDown={(e) => handleKeyDown(e, index, 5)}
                              className="inline-flex items-center justify-center h-7 w-7 rounded transition-colors cursor-pointer"
                              style={{ color: '#dc2626' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-danger-bg)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                              tabIndex={0}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--so-border)' }}>
                    <td colSpan={6} className="py-3 px-3 text-right text-[11.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)' }}>Total</td>
                    <td className="py-3 px-3 text-right font-mono text-sm font-bold" style={{ color: 'var(--so-text-primary)' }}>${fmtCurrency(editTotal)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </form>

        {/* Draft confirmation dialog */}
        <ConfirmDialog
          open={showDraftConfirm}
          onOpenChange={setShowDraftConfirm}
          title="Save as Draft?"
          description="Are you sure you want to save as Draft?"
          confirmLabel="Save Draft"
          onConfirm={() => {
            setShowDraftConfirm(false)
            handleSubmit()
          }}
          loading={isPending}
        />
      </div>
    </div>
  )
}
