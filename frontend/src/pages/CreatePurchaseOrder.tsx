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
import { ArrowLeft, Plus, Save, AlertTriangle } from 'lucide-react'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { SearchableCombobox } from '@/components/common/SearchableCombobox'
import { LineItemGrid } from '@/components/common/LineItemGrid'
import type { LineItemColumn } from '@/components/common/LineItemGrid'
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

interface POLineForm {
  item: string
  quantity_ordered: string
  uom: string
  unit_cost: string
  notes: string
  fulfillment_method: string
}

// A fresh, blank line for the grid's explicit "+ Add Line" action.
const emptyLine = (): POLineForm => ({
  item: '',
  quantity_ordered: '1',
  uom: '',
  unit_cost: '0.00',
  notes: '',
  fulfillment_method: '',
})

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
  const [linesFormData, setLinesFormData] = useState<POLineForm[]>(
    copyData?.lines?.map((l) => ({
      item: l.item,
      quantity_ordered: l.quantity_ordered,
      uom: l.uom,
      unit_cost: l.unit_cost,
      notes: l.notes || '',
      fulfillment_method: l.fulfillment_method || '',
    })) || [emptyLine()],
  )

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
    setLinesFormData(prev => [...prev, emptyLine()])
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

  // Route the grid's single onCellChange into the page's existing specialized
  // handlers so no logic is lost: item change → UOM autofill + cost lookup +
  // similar-item warning; qty change → cost re-lookup; everything else → generic.
  const handleCellChange = (index: number, key: string, value: string | number | null) => {
    if (key === 'item') handleLineItemChange(index, value == null ? '' : String(value))
    else if (key === 'quantity_ordered') handleLineQtyChange(index, String(value ?? ''))
    else handleLineChange(index, key, String(value ?? ''))
  }

  // Column config for the shared editable grid.
  const lineColumns: LineItemColumn<POLineForm>[] = [
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
      render: (row) => items.find((i) => String(i.id) === row.item)?.name || '—',
    },
    {
      key: 'fulfillment_method',
      header: 'Fulfill',
      type: 'select',
      width: '120px',
      placeholder: 'Fulfill',
      options: (row) => {
        const itemType = items.find((i) => String(i.id) === row.item)?.item_type
        return itemType ? FULFILLMENT_OPTIONS[itemType] || [] : []
      },
    },
    { key: 'quantity_ordered', header: 'Qty', type: 'numeric', width: '90px', align: 'right' },
    {
      key: 'uom',
      header: 'UOM',
      type: 'readonly',
      width: '80px',
      render: (row) => items.find((i) => String(i.id) === row.item)?.base_uom_code ?? '—',
    },
    { key: 'unit_cost', header: 'Cost', type: 'numeric', width: '110px', align: 'right' },
    {
      key: 'amount',
      header: 'Amount',
      type: 'computed',
      width: '110px',
      align: 'right',
      render: (row) =>
        row.item ? formatCurrency(calcLineAmount(row.quantity_ordered, row.unit_cost).toFixed(2)) : '—',
    },
    { key: 'notes', header: 'Notes', type: 'text', width: '1.5fr', placeholder: 'Notes...' },
  ]

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

              <LineItemGrid
                lines={linesFormData}
                columns={lineColumns}
                onCellChange={handleCellChange}
                onAddLine={handleAddLine}
                onRemoveLine={handleRemoveLine}
              />

              {/* Similar-item warnings — still fired by handleLineItemChange, shown per line. */}
              {linesFormData.map((line, index) => {
                const warning = similarWarnings[index]
                if (!warning) return null
                const count = warning.exact_matches.length + warning.close_matches.length
                return (
                  <div
                    key={index}
                    className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-[13px]"
                    style={{ background: 'var(--so-warning-bg)', color: 'var(--so-warning-text)' }}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-medium">
                      {count} similar item{count !== 1 ? 's' : ''} found
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

              <div className="flex justify-end pr-1 pt-3 mt-3" style={{ borderTop: '1px solid var(--so-border-light)' }}>
                <span className="text-[13px] mr-4" style={{ color: 'var(--so-text-tertiary)' }}>Total:</span>
                <span className="font-mono font-semibold text-sm" style={{ color: 'var(--so-text-primary)' }}>{formatCurrency(editTotal.toFixed(2))}</span>
              </div>
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
