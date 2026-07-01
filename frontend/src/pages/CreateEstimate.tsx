import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useCreateEstimate, useNextEstimateNumber } from '@/api/estimates'
import { useAllCustomers, useAllLocations } from '@/api/parties'
import { useAllItems, useAllUnitsOfMeasure } from '@/api/items'
import { Input } from '@/components/ui/input'
import { NumericInput } from "@/components/ui/numeric-input"
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { PageHeader } from '@/components/page'
import { SearchableCombobox } from '@/components/common/SearchableCombobox'
import { LineItemGrid } from '@/components/common/LineItemGrid'
import type { LineItemColumn } from '@/components/common/LineItemGrid'
import { formatCurrency } from '@/lib/format'
import type { EstimateStatus } from '@/types/api'

const ESTIMATE_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
]

interface EstimateLineForm {
  item: string
  description: string
  quantity: string
  uom: string
  unit_price: string
}

// A fresh, blank line for the grid's explicit "+ Add Line" action.
const emptyLine = (): EstimateLineForm => ({
  item: '',
  description: '',
  quantity: '1',
  uom: '',
  unit_price: '0.00',
})

export default function CreateEstimate() {
  usePageTitle('Create Estimate')
  const navigate = useNavigate()
  const createEstimate = useCreateEstimate()
  const { data: nextEstimateNumber } = useNextEstimateNumber()

  const { data: customersData } = useAllCustomers()
  const { data: itemsData } = useAllItems()
  const { data: uomData } = useAllUnitsOfMeasure()

  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    status: 'draft',
    tax_rate: '0.00',
    customer: '',
    customer_po: '',
    date: new Date().toISOString().split('T')[0],
    expiration_date: '',
    ship_to: '',
    bill_to: '',
    notes: '',
  })

  // Standard ERP grid: starts with one blank row. Rows are added/removed only via
  // the grid's explicit "+ Add Line" button and per-row delete (no auto-spawn).
  const [lines, setLines] = useState<EstimateLineForm[]>([emptyLine()])

  const customers = customersData ?? []
  const items = itemsData ?? []
  const uoms = uomData ?? []

  const selectedCustomer = customers.find((c) => String(c.id) === formData.customer)
  // Server-side filter via DRF's filterset_fields ['party', ...] on LocationViewSet.
  const { data: locationsData } = useAllLocations(selectedCustomer?.party)
  const customerLocations = selectedCustomer ? locationsData ?? [] : []

  const subtotal = lines.reduce((sum, line) => {
    return sum + (Number(line.quantity) || 0) * (parseFloat(line.unit_price) || 0)
  }, 0)

  const isPending = createEstimate.isPending
  const isMobile = useIsMobile()

  const update = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }))

  const handleAddLine = () => setLines((prev) => [...prev, emptyLine()])

  const handleRemoveLine = (index: number) => {
    // Allow removing down to zero rows; the "+ Add Line" button brings rows back.
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const handleLineChange = (index: number, key: string, value: string | number | null) => {
    setLines((prev) => {
      const newLines = [...prev]
      // The item combobox emits a numeric id (or null); everything else is a string.
      const strVal = value == null ? '' : String(value)
      const updated = { ...newLines[index], [key]: strVal } as EstimateLineForm

      // Preserve item auto-fill: selecting an item populates UOM + description.
      if (key === 'item' && strVal) {
        const selectedItem = items.find((i) => String(i.id) === strVal)
        if (selectedItem) {
          updated.uom = String(selectedItem.base_uom)
          updated.description = selectedItem.sell_desc || selectedItem.name
        }
      }

      newLines[index] = updated
      return newLines
    })
  }

  // Column config for the shared editable grid.
  const lineColumns: LineItemColumn<EstimateLineForm>[] = [
    {
      key: 'item',
      header: 'Item',
      type: 'item',
      entityType: 'item',
      width: '2fr',
      initialLabel: (row) => {
        const it = items.find((i) => String(i.id) === row.item)
        return it ? `${it.sku} - ${it.name}` : undefined
      },
    },
    { key: 'description', header: 'Description', type: 'text', width: '2fr', placeholder: 'Description' },
    { key: 'quantity', header: 'Qty', type: 'numeric', width: '90px', align: 'right' },
    {
      key: 'uom',
      header: 'UOM',
      type: 'select',
      width: '110px',
      placeholder: 'UOM',
      options: () => uoms.map((u) => ({ value: String(u.id), label: u.code })),
    },
    { key: 'unit_price', header: 'Unit Price', type: 'numeric', width: '120px', align: 'right' },
    {
      key: 'total',
      header: 'Total',
      type: 'computed',
      width: '120px',
      align: 'right',
      render: (row) =>
        formatCurrency(String((parseFloat(row.quantity || '0') * parseFloat(row.unit_price || '0')).toFixed(2))),
    },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      await createEstimate.mutateAsync({
        status: formData.status as EstimateStatus,
        customer: Number(formData.customer),
        date: formData.date,
        expiration_date: formData.expiration_date || null,
        ship_to: formData.ship_to ? Number(formData.ship_to) : null,
        bill_to: formData.bill_to ? Number(formData.bill_to) : null,
        customer_po: formData.customer_po,
        notes: formData.notes,
        tax_rate: formData.tax_rate,
        // Item is required — drop any rows without one so blanks aren't sent.
        lines: lines
          .filter((line) => line.item)
          .map((line, index) => ({
            line_number: (index + 1) * 10,
            item: Number(line.item),
            description: line.description,
            quantity: Number(line.quantity),
            uom: Number(line.uom),
            unit_price: line.unit_price,
          })),
      })

      navigate('/estimates')
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object') {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to create estimate'))
      }
    }
  }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className={`max-w-[1080px] mx-auto px-4 md:px-8 py-7 ${isMobile ? 'pb-32 px-4' : 'pb-16'}`}>

        <PageHeader
          title="Create New Estimate"
          breadcrumb={[{ label: 'Estimates', to: '/estimates' }, { label: 'New' }]}
          meta={
            <span className="font-mono text-[13px] font-semibold" style={{ color: 'var(--so-text-primary)' }}>
              {nextEstimateNumber ?? '…'}
            </span>
          }
        />

        <form id="create-estimate-form" onSubmit={handleSubmit} className="space-y-3">

          {/* Estimate Details — Customer, Status, Dates & Tax consolidated into one dense header card */}
          <div className="rounded-[14px] border animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)', position: 'relative', zIndex: 20 }}>
            <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Estimate Details</span>
            </div>
            <div className="px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="customer" style={{ color: 'var(--so-text-secondary)' }}>Customer *</Label>
                  <SearchableCombobox
                    entityType="customer"
                    value={formData.customer ? Number(formData.customer) : null}
                    onChange={(id) => {
                      const idStr = id ? String(id) : ''
                      const cust = customers.find((c) => String(c.id) === idStr)
                      setFormData((prev) => ({
                        ...prev,
                        customer: idStr,
                        ship_to: cust?.default_ship_to ? String(cust.default_ship_to) : '',
                        bill_to: cust?.default_bill_to ? String(cust.default_bill_to) : '',
                      }))
                    }}
                    placeholder="Select customer..."
                    allowClear
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="customer_po" style={{ color: 'var(--so-text-secondary)' }}>Customer PO</Label>
                  <Input
                    id="customer_po"
                    value={formData.customer_po}
                    onChange={(e) => update('customer_po', e.target.value)}
                    placeholder="Customer's PO reference"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="status" style={{ color: 'var(--so-text-secondary)' }}>Status</Label>
                  <Select value={formData.status} onValueChange={(v) => update('status', v)}>
                    <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTIMATE_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="date" style={{ color: 'var(--so-text-secondary)' }}>Estimate Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => update('date', e.target.value)}
                    required
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expiration_date" style={{ color: 'var(--so-text-secondary)' }}>Expiration Date</Label>
                  <Input
                    id="expiration_date"
                    type="date"
                    value={formData.expiration_date}
                    onChange={(e) => update('expiration_date', e.target.value)}
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tax_rate" style={{ color: 'var(--so-text-secondary)' }}>Tax Rate (%)</Label>
                  <NumericInput
                    id="tax_rate"
                    value={formData.tax_rate}
                    onValueChange={(v) => update('tax_rate', v)}
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Shipping & Billing */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Shipping &amp; Billing</span>
            </div>
            <div className="px-6 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ship_to" style={{ color: 'var(--so-text-secondary)' }}>Ship To</Label>
                  <Select
                    value={formData.ship_to}
                    onValueChange={(v) => update('ship_to', v)}
                    disabled={!formData.customer}
                  >
                    <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
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
                <div className="space-y-1.5">
                  <Label htmlFor="bill_to" style={{ color: 'var(--so-text-secondary)' }}>Bill To</Label>
                  <Select
                    value={formData.bill_to}
                    onValueChange={(v) => update('bill_to', v)}
                    disabled={!formData.customer}
                  >
                    <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
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
              </div>
            </div>
          </div>

          {/* Line Items */}
          {/* No `overflow-hidden` here: the line-item rows host SearchableCombobox dropdowns
              that must overflow the card downward instead of being clipped by it. */}
          <div className="rounded-[14px] border animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Line Items</span>
            </div>
            <div className="px-6 py-4">
              <LineItemGrid
                lines={lines}
                columns={lineColumns}
                onCellChange={handleLineChange}
                onAddLine={handleAddLine}
                onRemoveLine={handleRemoveLine}
              />

              <div className="flex justify-end pr-1 pt-3 mt-3" style={{ borderTop: '1px solid var(--so-border-light)' }}>
                <span className="text-[13px] mr-4" style={{ color: 'var(--so-text-tertiary)' }}>Subtotal:</span>
                <span className="font-mono font-semibold text-sm" style={{ color: 'var(--so-text-primary)' }}>${subtotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Notes</span>
            </div>
            <div className="px-6 py-4">
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="Estimate notes..."
                rows={3}
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              className="text-[13px] rounded-[10px] p-3"
              style={{ color: 'var(--so-danger-text)', background: 'var(--so-danger-bg)', border: '1px solid var(--so-danger-border, transparent)' }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          {!isMobile && (
            <div className="flex justify-end gap-3 pt-2" style={{ borderTop: '1px solid var(--so-border-light)' }}>
              <button type="button" className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate(-1)}>
                Cancel
              </button>
              <button
                type="submit"
                className={`${primaryBtnClass}${isPending || !formData.customer ? ' opacity-50 pointer-events-none' : ''}`}
                style={primaryBtnStyle}
                disabled={isPending || !formData.customer}
              >
                {isPending ? 'Creating...' : 'Create Estimate'}
              </button>
            </div>
          )}

        </form>
      </div>

      {/* Mobile sticky bottom bar */}
      {isMobile && (
        <div
          className="fixed bottom-16 left-0 right-0 z-50 flex items-center gap-3 px-4 py-3 shadow-lg"
          style={{ background: 'var(--so-surface)', borderTop: '1px solid var(--so-border)' }}
        >
          <span
            className="flex-1 text-center font-mono text-sm font-semibold"
            style={{ color: 'var(--so-text-primary)' }}
          >
            ${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <button
            type="submit"
            form="create-estimate-form"
            className={`${primaryBtnClass}${isPending || !formData.customer ? ' opacity-50 pointer-events-none' : ''}`}
            style={{ ...primaryBtnStyle, minHeight: 44 }}
            disabled={isPending || !formData.customer}
          >
            {isPending ? 'Creating...' : 'Create Estimate'}
          </button>
        </div>
      )}
    </div>
  )
}
