import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useIsMobile } from '@/hooks/useIsMobile'
import { MobileLineItemList } from '@/components/orders/MobileLineItemList'
import { useCreatePurchaseOrder, useNextPurchaseOrderNumber } from '@/api/orders'
import { useCostLookup } from '@/api/costLists'
import { useAllVendors, useAllLocations } from '@/api/parties'
import { useAllItems, useAllUnitsOfMeasure } from '@/api/items'
import { toastApiError } from '@/lib/errors'
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
import { ArrowLeft, Plus, Trash2, Save, AlertTriangle } from 'lucide-react'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { SearchableCombobox } from '@/components/common/SearchableCombobox'
import api from '@/api/client'
import type { SimilarItemsResponse } from '@/api/items'
import type { OrderStatus, FulfillmentMethod } from '@/types/api'
import { formatCurrency } from '@/lib/format'

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

const ORDER_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'complete', label: 'Complete' },
  { value: 'cancelled', label: 'Cancelled' },
]

const labelClass = 'block text-[11.5px] font-medium uppercase tracking-widest mb-1.5'
const labelStyle: React.CSSProperties = { color: 'var(--so-text-tertiary)' }

interface CopyFromPurchaseOrderLine {
  item: string
  quantity_ordered: string
  uom: string
  unit_cost: string
  notes?: string
  fulfillment_method?: string
}

interface CopyFromPurchaseOrder {
  po_number?: string
  status?: string
  vendor?: string
  ship_to?: string
  order_date?: string
  expected_date?: string
  scheduled_date?: string
  notes?: string
  lines?: CopyFromPurchaseOrderLine[]
}

interface LocationState {
  copyFrom?: CopyFromPurchaseOrder
}

export default function CreatePurchaseOrder() {
  const navigate = useNavigate()
  const location = useLocation()
  const copyData = (location.state as LocationState | null)?.copyFrom
  usePageTitle(copyData ? 'Copy Purchase Order' : 'Create Purchase Order')
  const createOrder = useCreatePurchaseOrder()
  const { data: nextPONumber } = useNextPurchaseOrderNumber()

  const { data: vendorsData } = useAllVendors()
  const { data: locationsData } = useAllLocations()
  const { data: itemsData } = useAllItems()
  const { data: uomData } = useAllUnitsOfMeasure()

  const [error, setError] = useState('')
  const [costLookupLine, setCostLookupLine] = useState<number | null>(null)
  const [similarWarnings, setSimilarWarnings] = useState<Record<number, SimilarItemsResponse>>({})

  const [formData, setFormData] = useState({
    po_number: copyData?.po_number || '',
    status: copyData?.status || 'draft',
    vendor: copyData?.vendor || '',
    ship_to: copyData?.ship_to || '',
    order_date: copyData?.order_date || new Date().toISOString().split('T')[0],
    expected_date: copyData?.expected_date || '',
    scheduled_date: copyData?.scheduled_date || '',
    notes: copyData?.notes || '',
  })
  const [linesFormData, setLinesFormData] = useState<
    { item: string; quantity_ordered: string; uom: string; unit_cost: string; notes: string; fulfillment_method: string }[]
  >(copyData?.lines?.map((l) => ({
    item: l.item,
    quantity_ordered: l.quantity_ordered,
    uom: l.uom,
    unit_cost: l.unit_cost,
    notes: l.notes || '',
    fulfillment_method: l.fulfillment_method || '',
  })) || [])

  const vendors = vendorsData ?? []
  const locations = locationsData ?? []
  const items = itemsData ?? []
  const itemLabel = (val: string) => {
    const it = items.find((i) => String(i.id) === val)
    return it ? `${it.name} – ${it.sku}` : undefined
  }
  const uoms = uomData ?? []

  const warehouseLocations = locations.filter((l) => l.location_type === 'WAREHOUSE')

  const selectedVendor = vendors.find((v) => String(v.id) === formData.vendor)

  const lookupLine = costLookupLine !== null ? linesFormData[costLookupLine] : null
  const { data: costData, isFetching: isCostFetching } = useCostLookup(
    formData.vendor ? Number(formData.vendor) : undefined,
    lookupLine?.item ? Number(lookupLine.item) : undefined,
    lookupLine?.quantity_ordered ? Number(lookupLine.quantity_ordered) : undefined,
  )

  useEffect(() => {
    if (costLookupLine === null || isCostFetching) return
    if (costLookupLine >= linesFormData.length) {
      setCostLookupLine(null)
      return
    }
    if (costData?.unit_cost) {
      const currentLine = linesFormData[costLookupLine]
      if (currentLine.unit_cost === '0.00' || currentLine.unit_cost === '') {
        setLinesFormData(prev => prev.map((line, i) =>
          i === costLookupLine ? { ...line, unit_cost: costData.unit_cost } : line
        ))
      }
    }
    setCostLookupLine(null)
  }, [costData, costLookupLine, linesFormData, isCostFetching])

  const isPending = createOrder.isPending
  const isMobile = useIsMobile()

  const handleAddLine = () => {
    setLinesFormData(prev => [...prev, { item: '', quantity_ordered: '1', uom: '', unit_cost: '0.00', notes: '', fulfillment_method: '' }])
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
    setLinesFormData(prev => prev.map((line, i) => {
      if (i !== index) return line
      const defaultFulfillment = selectedItem ? (DEFAULT_FULFILLMENT[selectedItem.item_type] || '') : line.fulfillment_method
      return {
        ...line,
        item: value,
        uom: selectedItem ? String(selectedItem.base_uom) : line.uom,
        unit_cost: '0.00',
        fulfillment_method: defaultFulfillment,
      }
    }))
    if (value && formData.vendor) {
      setCostLookupLine(index)
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
    setLinesFormData(prev => prev.map((line, i) =>
      i === index ? { ...line, quantity_ordered: value, unit_cost: '0.00' } : line
    ))
    if (value && formData.vendor && linesFormData[index]?.item) {
      setCostLookupLine(index)
    }
  }

  const calcLineAmount = (qty: string, cost: string) => {
    return (parseFloat(qty) || 0) * (parseFloat(cost) || 0)
  }

  const editTotal = linesFormData.reduce(
    (sum, line) => sum + calcLineAmount(line.quantity_ordered, line.unit_cost),
    0
  )

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.vendor) {
      setError('Vendor is required')
      toast.error('Vendor is required')
      return
    }
    if (!formData.ship_to) {
      setError('Ship To warehouse is required')
      toast.error('Ship To warehouse is required')
      return
    }

    try {
      await createOrder.mutateAsync({
        po_number: formData.po_number || undefined,
        status: formData.status as OrderStatus,
        vendor: Number(formData.vendor),
        order_date: formData.order_date,
        expected_date: formData.expected_date || null,
        scheduled_date: formData.scheduled_date || null,
        ship_to: Number(formData.ship_to),
        notes: formData.notes || '',
        lines: linesFormData.map((line, idx) => ({
          line_number: idx + 1,
          item: Number(line.item),
          quantity_ordered: Number(line.quantity_ordered),
          uom: Number(line.uom),
          unit_cost: line.unit_cost,
          fulfillment_method: (line.fulfillment_method || null) as FulfillmentMethod | null,
        })),
      })
      navigate('/orders?tab=purchase')
    } catch (err) {
      toastApiError(err, 'Failed to create purchase order')
    }
  }

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
            Purchase Orders
          </button>
          <span style={{ color: 'var(--so-border)' }} className="text-[13px]">/</span>
          <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>
            {copyData ? 'Copy Purchase Order' : 'New Purchase Order'}
          </span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in delay-1">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>
              {copyData ? 'Copy Purchase Order' : 'New Purchase Order'}
            </h1>
            {!copyData && (
              <div className="mt-1 text-[13px] inline-flex items-center gap-2">
                <span className="font-mono font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                  {nextPONumber ?? '…'}
                </span>
                {selectedVendor && (
                  <>
                    <span style={{ color: 'var(--so-border)' }}>·</span>
                    <span style={{ color: 'var(--so-text-tertiary)' }}>{selectedVendor.party_display_name}</span>
                  </>
                )}
              </div>
            )}
            {copyData && (
              <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
                {selectedVendor ? selectedVendor.party_display_name : 'Fill in order details below'}
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
                type="submit"
                form="create-po-form"
              >
                <Save className="h-3.5 w-3.5" />
                {isPending ? 'Creating...' : 'Create Order'}
              </button>
            </div>
          )}
        </div>

        <form id="create-po-form" onSubmit={onSubmit}>
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
              {/* Row 1: Vendor (span 2) | Ship To | Order Date | Expected Date | Status */}
              <div className="grid grid-cols-6 gap-4">
                <div className="col-span-2">
                  <label className={labelClass} style={labelStyle}>Vendor *</label>
                  <SearchableCombobox
                    entityType="vendor"
                    value={formData.vendor ? Number(formData.vendor) : null}
                    onChange={(id) => setFormData({ ...formData, vendor: id ? String(id) : '' })}
                    placeholder="Select vendor..."
                    allowClear
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Ship To Warehouse *</label>
                  <Select
                    value={formData.ship_to}
                    onValueChange={(value) => setFormData({ ...formData, ship_to: value })}
                  >
                    <SelectTrigger className="h-9 text-sm" style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                      <SelectValue placeholder="Select warehouse..." />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouseLocations.map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>
                          {l.code} - {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <label className={labelClass} style={labelStyle}>Expected Date</label>
                  <Input
                    type="date"
                    value={formData.expected_date}
                    onChange={(e) => setFormData({ ...formData, expected_date: e.target.value })}
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
                    <SelectTrigger className="h-9 text-sm" style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDER_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: Scheduled Date */}
              <div className="grid grid-cols-6 gap-4 mt-4">
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
                fulfillmentMethods={[
                  { value: 'stock', label: 'Stock' },
                  { value: 'direct', label: 'Direct Ship' },
                  { value: 'crossdock', label: 'Crossdock' },
                ]}
                priceField="unit_cost"
                onLineChange={handleLineChange}
                onRemove={handleRemoveLine}
                onAdd={handleAddLine}
                total={editTotal}
              />
            ) : (
            <>
            <div className="px-6 py-4 flex items-center justify-between">
              <span className="text-sm font-semibold">Line Items</span>
              <button
                type="button"
                className={primaryBtnClass}
                style={{ ...primaryBtnStyle, padding: '4px 10px', fontSize: '12px' }}
                onClick={handleAddLine}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Line
              </button>
            </div>
            {linesFormData.length === 0 ? (
              <p className="text-[13px] text-center py-6 px-6" style={{ color: 'var(--so-text-tertiary)' }}>
                No lines added. Click "Add Line" to add items to this order.
              </p>
            ) : (
            // focus-within:overflow-visible lifts the clip while a cell is focused so the
            // item-picker dropdown can extend past the table (overflow-x:auto would clip it).
            <div className="overflow-x-auto focus-within:overflow-visible">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[
                      { label: 'Item', align: 'text-left', cls: 'pl-6 w-[22%]' },
                      { label: 'Description', align: 'text-left', cls: 'w-[18%]' },
                      { label: 'Fulfill', align: 'text-left', cls: 'w-[8%]' },
                      { label: 'Qty', align: 'text-right', cls: 'w-[8%]' },
                      { label: 'UOM', align: 'text-left', cls: 'w-[8%]' },
                      { label: 'Rate', align: 'text-right', cls: 'w-[10%]' },
                      { label: 'Amount', align: 'text-right', cls: 'w-[10%]' },
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
                    const lineAmount = calcLineAmount(line.quantity_ordered, line.unit_cost)
                    const warning = similarWarnings[index]
                    return (
                      <React.Fragment key={index}>
                      <tr style={{ borderBottom: warning ? 'none' : '1px solid var(--so-border-light)' }}>
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
                        {/* Description (read-only) */}
                        <td className="py-1.5 px-3 text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>
                          {selectedItem?.name || '—'}
                        </td>
                        {/* Fulfillment */}
                        <td className="py-1.5 px-1">
                          {(() => {
                            const itemType = selectedItem?.item_type
                            if (!itemType || itemType === 'other_charge') return <span className="text-[13px] px-2" style={{ color: 'var(--so-text-tertiary)' }}>—</span>
                            if (itemType === 'crossdock') return <span className="text-[12px] px-2 font-medium" style={{ color: '#3b82f6' }}>Cross</span>
                            const opts = FULFILLMENT_OPTIONS[itemType] || []
                            return (
                              <Select
                                value={line.fulfillment_method || opts[0]?.value || ''}
                                onValueChange={(v) => handleLineChange(index, 'fulfillment_method', v)}
                              >
                                <SelectTrigger className="h-9 text-sm border shadow-none bg-transparent">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {opts.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            )
                          })()}
                        </td>
                        {/* Qty */}
                        <td className="py-1.5 px-1">
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={line.quantity_ordered}
                            onChange={(e) => handleLineQtyChange(index, e.target.value)}
                            className="h-9 text-sm text-right border shadow-none font-mono"
                          />
                        </td>
                        {/* UOM */}
                        <td className="py-1.5 px-1">
                          <Select
                            value={line.uom}
                            onValueChange={(v) => handleLineChange(index, 'uom', v)}
                          >
                            <SelectTrigger className="h-9 text-sm border shadow-none bg-transparent">
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
                        </td>
                        {/* Rate */}
                        <td className="py-1.5 px-1">
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={line.unit_cost}
                            onChange={(e) => handleLineChange(index, 'unit_cost', e.target.value)}
                            className="h-9 text-sm text-right border shadow-none font-mono"
                          />
                        </td>
                        {/* Amount (read-only) */}
                        <td className="py-1.5 px-3 text-right font-mono text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                          {line.item ? formatCurrency(lineAmount.toFixed(2)) : '—'}
                        </td>
                        {/* Notes */}
                        <td className="py-1.5 px-1">
                          <Input
                            value={line.notes}
                            onChange={(e) => handleLineChange(index, 'notes', e.target.value)}
                            className="h-9 text-sm border shadow-none bg-transparent"
                            placeholder="Notes..."
                          />
                        </td>
                        {/* Delete */}
                        <td className="py-1.5 px-1 pr-6">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(index)}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors cursor-pointer"
                            style={{ color: 'var(--so-danger-text)' }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                      {warning && (
                        <tr style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                          <td colSpan={9} className="px-6 py-2">
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px]" style={{ background: 'var(--so-warning-bg)', color: 'var(--so-warning-text)' }}>
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span className="font-medium">
                                {warning.exact_matches.length + warning.close_matches.length} similar item{warning.exact_matches.length + warning.close_matches.length !== 1 ? 's' : ''} found
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
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--so-border)' }}>
                    <td colSpan={6} className="py-3 px-3 text-right text-[11.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)' }}>Total</td>
                    <td className="py-3 px-3 text-right font-mono text-sm font-bold" style={{ color: 'var(--so-text-primary)' }}>{formatCurrency(editTotal.toFixed(2))}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            )}
            </>
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
            {formatCurrency(editTotal.toFixed(2))}
          </span>
          <button
            type="submit"
            form="create-po-form"
            className={`${primaryBtnClass} ${isPending ? 'opacity-50 pointer-events-none' : ''}`}
            style={{ ...primaryBtnStyle, minHeight: 44 }}
            disabled={isPending}
          >
            {isPending ? 'Creating...' : 'Create PO'}
          </button>
        </div>
      )}
    </div>
  )
}
