import React, { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/format'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ArrowLeft, FileText, AlertTriangle, Plus } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { MobileLineItemList } from '@/components/orders/MobileLineItemList'
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
import { useCreateSalesOrder, useNextSalesOrderNumber } from '@/api/orders'
import { useAllCustomers, useAllLocations } from '@/api/parties'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { SearchableCombobox } from '@/components/common/SearchableCombobox'
import { LineItemGrid } from '@/components/common/LineItemGrid'
import type { LineItemColumn } from '@/components/common/LineItemGrid'
import { useAllItems, useAllUnitsOfMeasure } from '@/api/items'
import api from '@/api/client'
import type { SimilarItemsResponse } from '@/api/items'
import { usePriceLookup } from '@/api/priceLists'
import { useContractsByCustomer } from '@/api/contracts'
import type { SalesOrderClass } from '@/types/api'

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
  { value: 'DIRECT', label: 'Direct' },
]

const EMPTY_LINE = { item: '', quantity_ordered: '', uom: '', unit_price: '', notes: '', contract: '', fulfillment_method: '' }

const DEFAULT_FULFILLMENT: Record<string, string> = {
  inventory: 'stock',
  non_stockable: 'direct',
  crossdock: 'crossdock',
}

const FULFILLMENT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  inventory: [
    { value: 'stock', label: 'Stock' },
    { value: 'direct', label: 'Direct Ship' },
    { value: 'crossdock', label: 'Crossdock' },
  ],
  non_stockable: [
    { value: 'direct', label: 'Direct Ship' },
    { value: 'crossdock', label: 'Crossdock' },
  ],
  crossdock: [],
  other_charge: [],
}

const labelClass = 'block text-[11.5px] font-medium uppercase tracking-widest mb-1.5'
const labelStyle: React.CSSProperties = { color: 'var(--so-text-tertiary)' }

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CreateSalesOrder() {
  const navigate = useNavigate()
  const location = useLocation()
  const fromEstimate = (location.state as any)?.fromEstimate
  const copyData = fromEstimate || (location.state as any)?.copyFrom
  const sourceEstimateId = fromEstimate?.id as number | undefined
  usePageTitle(fromEstimate ? 'Convert Estimate to Sales Order' : copyData ? 'Copy Sales Order' : 'New Sales Order')
  const createOrder = useCreateSalesOrder()
  const { data: nextSONumber } = useNextSalesOrderNumber()

  const { data: customersData } = useAllCustomers()
  const { data: locationsData } = useAllLocations()
  const { data: itemsData } = useAllItems()
  const { data: uomData } = useAllUnitsOfMeasure()

  const [error, setError] = useState('')
  const [priceLookupLine, setPriceLookupLine] = useState<number | null>(null)
  const [similarWarnings, setSimilarWarnings] = useState<Record<number, SimilarItemsResponse>>({})
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
    order_class: (fromEstimate ? 'DIRECT' : copyData?.order_class as SalesOrderClass) || 'STANDARD',
  })

  const buildInitialLines = () => {
    if (copyData?.lines?.length) {
      return copyData.lines.map((l: any) => ({ ...l, notes: l.notes || '', contract: '' }))
    }
    // Standard ERP grid: start with one blank row. Rows are added/removed via the
    // grid's explicit "+ Add Line" button and per-row delete.
    return [{ ...EMPTY_LINE }]
  }

  const [linesFormData, setLinesFormData] = useState<
    { item: string; quantity_ordered: string; uom: string; unit_price: string; notes: string; contract: string; fulfillment_method: string }[]
  >(buildInitialLines)

  const customers = customersData ?? []
  const allLocations = locationsData ?? []
  const items = itemsData ?? []
  const itemLabel = (val: string) => {
    const it = items.find((i) => String(i.id) === val)
    return it ? `${it.name} – ${it.sku}` : undefined
  }
  const uoms = uomData ?? []

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
        unitPrice: cl.unit_price ?? '',
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
  const handleAddLine = () => {
    setLinesFormData(prev => [...prev, { ...EMPTY_LINE }])
  }

  const handleRemoveLine = (index: number) => {
    setLinesFormData(prev => prev.filter((_, i) => i !== index))
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
      const defaultFulfillment = selectedItem ? (DEFAULT_FULFILLMENT[selectedItem.item_type] || '') : line.fulfillment_method
      return {
        ...line,
        item: value,
        uom: selectedItem ? String(selectedItem.base_uom) : line.uom,
        unit_price: bestContract?.unitPrice || '0.00',
        contract: bestContract?.contractNumber || '',
        fulfillment_method: defaultFulfillment,
      }
    }))
    if (value && formData.customer && !bestContract) {
      setPriceLookupLine(index)
    }
    // Fire-and-forget similar items lookup
    if (value) {
      api.get<SimilarItemsResponse>(`/items/${value}/similar/`).then(({ data }) => {
        if (data.exact_matches.length > 0 || data.close_matches.length > 0) {
          setSimilarWarnings(prev => ({ ...prev, [index]: data }))
        } else {
          setSimilarWarnings(prev => { const next = { ...prev }; delete next[index]; return next })
        }
      }).catch(() => {})
    } else {
      setSimilarWarnings(prev => { const next = { ...prev }; delete next[index]; return next })
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

  /* ---- Grid cell router: dispatch to the specialized handlers so price lookup,
     contract selection, fulfillment defaults and the similar-item warning all
     keep firing exactly as before. ---- */
  const handleCellChange = (index: number, key: string, value: string | number | null) => {
    if (key === 'item') {
      handleLineItemChange(index, value == null ? '' : String(value))
    } else if (key === 'contract') {
      handleContractChange(index, value === 'none' ? '' : String(value ?? ''))
    } else if (key === 'quantity_ordered') {
      handleLineQtyChange(index, String(value ?? ''))
    } else {
      handleLineChange(index, key, String(value ?? ''))
    }
  }

  const lineColumns: LineItemColumn<(typeof linesFormData)[number]>[] = [
    {
      key: 'item',
      header: 'Item',
      type: 'item',
      entityType: 'item',
      width: '2fr',
      placeholder: 'Select item...',
      initialLabel: (row) => itemLabel(row.item),
    },
    {
      key: 'description',
      header: 'Description',
      type: 'readonly',
      width: '1.5fr',
      render: (row) => {
        const it = items.find((i) => String(i.id) === row.item)
        return it?.name || '—'
      },
    },
    {
      key: 'contract',
      header: 'Contract',
      type: 'select',
      width: '130px',
      placeholder: 'None',
      options: (row) => {
        const itemContracts = row.item ? contractsByItem.get(Number(row.item)) : undefined
        if (!itemContracts || itemContracts.length === 0) return []
        return [
          { value: 'none', label: 'No contract' },
          ...itemContracts.map((c) => ({
            value: c.contractNumber,
            label: `${c.contractNumber} @ $${c.unitPrice} (${c.remainingQty.toLocaleString()} rem.)`,
          })),
        ]
      },
    },
    {
      key: 'fulfillment_method',
      header: 'Fulfill',
      type: 'select',
      width: '120px',
      placeholder: '—',
      options: (row) => {
        const selectedItem = items.find((i) => String(i.id) === row.item)
        const itemType = selectedItem?.item_type
        if (!itemType) return []
        return FULFILLMENT_OPTIONS[itemType] || []
      },
    },
    { key: 'quantity_ordered', header: 'Qty', type: 'numeric', width: '90px', align: 'right' },
    {
      key: 'uom',
      header: 'UOM',
      type: 'readonly',
      width: '80px',
      render: (row) => {
        const it = items.find((i) => String(i.id) === row.item)
        return it?.base_uom_code ?? '—'
      },
    },
    { key: 'unit_price', header: 'Rate', type: 'numeric', width: '110px', align: 'right' },
    {
      key: 'amount',
      header: 'Amount',
      type: 'computed',
      width: '110px',
      align: 'right',
      render: (row) => {
        const amt = (parseFloat(row.quantity_ordered) || 0) * (parseFloat(row.unit_price) || 0)
        return row.item ? formatCurrency(amt) : '—'
      },
    },
    { key: 'notes', header: 'Notes', type: 'text', width: '1.5fr', placeholder: 'Notes...' },
  ]

  const editTotal = linesFormData.reduce((sum, line) => {
    const qty = parseFloat(line.quantity_ordered) || 0
    const price = parseFloat(line.unit_price) || 0
    return sum + qty * price
  }, 0)

  const isPending = createOrder.isPending
  const isMobile = useIsMobile()

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
      ...(sourceEstimateId ? { source_estimate: sourceEstimateId } : {}),
      lines: filledLines.map((line, idx) => ({
        line_number: idx + 1,
        item: Number(line.item),
        quantity_ordered: Number(line.quantity_ordered),
        uom: Number(line.uom),
        unit_price: line.unit_price,
        fulfillment_method: line.fulfillment_method || null,
      })),
    }

    try {
      const newOrder = await createOrder.mutateAsync(payload as any)
      navigate(`/orders/sales/${(newOrder as any).id}`)
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
      <div className={`max-w-[1280px] mx-auto px-4 md:px-8 py-7 ${isMobile ? 'pb-32 px-4' : 'pb-16'}`}>

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
            {fromEstimate ? 'Convert Estimate' : copyData ? 'Copy Sales Order' : 'New Sales Order'}
          </span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in delay-1">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>
              {fromEstimate ? 'Convert Estimate to Sales Order' : copyData ? 'Copy Sales Order' : 'New Sales Order'}
            </h1>
            {!copyData && (
              <div className="mt-1 text-[13px] inline-flex items-center gap-2">
                <span className="font-mono font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                  {nextSONumber ?? '…'}
                </span>
                {selectedCustomer && (
                  <>
                    <span style={{ color: 'var(--so-border)' }}>·</span>
                    <span style={{ color: 'var(--so-text-tertiary)' }}>{selectedCustomer.party_display_name}</span>
                  </>
                )}
              </div>
            )}
            {copyData && (
              <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
                {selectedCustomer ? selectedCustomer.party_display_name : 'Fill in order details below'}
              </p>
            )}
          </div>
          {!isMobile && (
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
          )}
        </div>

        <form id="create-so-form" onSubmit={onSubmit}>
          {/* Estimate conversion banner */}
          {fromEstimate && (
            <div
              className="rounded-md p-3 mb-4 text-sm flex items-center gap-2 animate-in"
              style={{ background: 'var(--so-accent-light)', border: '1px solid var(--so-accent)', color: 'var(--so-text-primary)' }}
            >
              <FileText className="h-4 w-4 shrink-0" style={{ color: 'var(--so-accent)' }} />
              <span>
                Converting from Estimate{' '}
                <Link
                  to={`/estimates/${fromEstimate.id}`}
                  className="font-semibold underline"
                  style={{ color: 'var(--so-accent)' }}
                >
                  {fromEstimate.estimate_number}
                </Link>
                {' '}&mdash; review and edit fields below, then save to create the Sales Order.
              </span>
            </div>
          )}

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
            className="rounded-[14px] border animate-in delay-2"
            style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)', position: 'relative', zIndex: 20 }}
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
                  <SearchableCombobox
                    entityType="customer"
                    value={formData.customer ? Number(formData.customer) : null}
                    onChange={(id) => handleCustomerChange(id ? String(id) : '')}
                    placeholder="Select customer..."
                    allowClear
                    browseAll
                  />
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
            {isMobile ? (
              <MobileLineItemList
                lines={linesFormData}
                items={items.map(i => ({ value: String(i.id), label: `${i.name} – ${i.sku}` }))}
                uoms={uoms.map(u => ({ value: String(u.id), label: u.code }))}
                contracts={activeContracts.map(c => ({ value: c.contract_number, label: c.contract_number }))}
                fulfillmentMethods={[
                  { value: 'stock', label: 'Stock' },
                  { value: 'direct', label: 'Direct Ship' },
                  { value: 'crossdock', label: 'Crossdock' },
                ]}
                lockUom
                onLineChange={handleLineChange}
                onRemove={handleRemoveLine}
                onAdd={handleAddLine}
                total={editTotal}
              />
            ) : (
            <div className="px-6 py-4">
              <div className="mb-3">
                <span className="text-sm font-semibold">Line Items</span>
              </div>

              {/* Shared editable grid — routes every cell edit through handleCellChange,
                  which dispatches to the specialized price/contract/fulfillment handlers. */}
              <LineItemGrid
                lines={linesFormData}
                columns={lineColumns}
                onCellChange={handleCellChange}
                onAddLine={handleAddLine}
                onRemoveLine={handleRemoveLine}
              />

              {/* Price-lookup indicator (grid has no per-cell slot for it). */}
              {priceLookupLine !== null && isPriceFetching && (
                <div className="text-[11px] mt-2" style={{ color: 'var(--so-text-tertiary)' }}>
                  Looking up price…
                </div>
              )}

              {/* Similar-item warnings — fired by handleLineItemChange, rendered below the grid. */}
              {Object.entries(similarWarnings).map(([idx, warning]) => {
                const line = linesFormData[Number(idx)]
                if (!line) return null
                const count = warning.exact_matches.length + warning.close_matches.length
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] mt-2"
                    style={{ background: 'var(--so-warning-bg)', color: 'var(--so-warning-text)' }}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-medium">
                      Line {Number(idx) + 1}: {count} similar item{count !== 1 ? 's' : ''} found
                    </span>
                    <span className="mx-1">·</span>
                    <a
                      href={`/items/${line.item}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium"
                      style={{ color: 'var(--so-warning-text)' }}
                    >
                      View similar items
                    </a>
                  </div>
                )
              })}

              {/* Totals */}
              <div className="flex justify-end pr-1 pt-3 mt-3" style={{ borderTop: '1px solid var(--so-border-light)' }}>
                <span className="text-[11.5px] font-semibold uppercase tracking-widest mr-4 self-center" style={{ color: 'var(--so-text-tertiary)' }}>Total</span>
                <span className="font-mono text-sm font-bold" style={{ color: 'var(--so-text-primary)' }}>{formatCurrency(editTotal)}</span>
              </div>
            </div>
            )}
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

      {/* Mobile sticky bottom bar */}
      {isMobile && (
        <div
          className="fixed bottom-16 left-0 right-0 z-50 flex items-center gap-3 px-4 py-3 shadow-lg"
          style={{
            background: 'var(--so-surface)',
            borderTop: '1px solid var(--so-border)',
          }}
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
            ${editTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <button
            className={primaryBtnClass + (isPending ? ' opacity-50 pointer-events-none' : '')}
            style={{ ...primaryBtnStyle, minHeight: 44 }}
            onClick={onSubmit as any}
            type="submit"
            form="create-so-form"
          >
            {isPending ? 'Creating...' : 'Create Order'}
          </button>
        </div>
      )}
    </div>
  )
}
