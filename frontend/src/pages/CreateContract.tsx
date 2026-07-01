import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAllCustomers, useAllLocations } from '@/api/parties'
import { useAllItems, useAllUnitsOfMeasure } from '@/api/items'
import { useCreateContract } from '@/api/contracts'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { PageHeader } from '@/components/page'
import { SearchableCombobox } from '@/components/common/SearchableCombobox'
import { LineItemGrid } from '@/components/common/LineItemGrid'
import type { LineItemColumn } from '@/components/common/LineItemGrid'
import { formatCurrency } from '@/lib/format'
import { toast } from 'sonner'

interface LineFormData {
  item: string
  blanket_qty: string
  uom: string
  unit_price: string
}

// A fresh, blank line for the grid's explicit "+ Add Line" action.
const emptyLine = (): LineFormData => ({
  item: '',
  blanket_qty: '',
  uom: '',
  unit_price: '',
})

export default function CreateContract() {
  usePageTitle('Create Contract')
  const navigate = useNavigate()
  const createContract = useCreateContract()

  const { data: customersData } = useAllCustomers()
  const { data: itemsData } = useAllItems()
  const { data: uomData } = useAllUnitsOfMeasure()

  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    customer: '',
    blanket_po: '',
    issue_date: new Date().toISOString().split('T')[0],
    start_date: '',
    end_date: '',
    ship_to: '',
    notes: '',
  })

  // Standard ERP grid: starts with one blank row. Rows are added/removed only via
  // the grid's explicit "+ Add Line" button and per-row delete (no auto-spawn).
  const [lines, setLines] = useState<LineFormData[]>([emptyLine()])

  const customers = customersData ?? []
  const items = itemsData ?? []
  const uoms = uomData ?? []

  const selectedCustomer = customers.find((c) => String(c.id) === formData.customer)
  // Server-side filter via DRF's filterset_fields ['party', ...] on LocationViewSet.
  const { data: locationsData } = useAllLocations(selectedCustomer?.party)
  const customerLocations = selectedCustomer ? locationsData ?? [] : []

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
      const updated = { ...newLines[index], [key]: strVal } as LineFormData

      // Preserve item auto-fill: selecting an item populates UOM.
      if (key === 'item' && strVal) {
        const selectedItem = items.find((i) => String(i.id) === strVal)
        if (selectedItem?.base_uom) {
          updated.uom = String(selectedItem.base_uom)
        }
      }

      newLines[index] = updated
      return newLines
    })
  }

  // Column config for the shared editable grid.
  const lineColumns: LineItemColumn<LineFormData>[] = [
    {
      key: 'item',
      header: 'Item',
      type: 'item',
      entityType: 'item',
      width: '2fr',
      placeholder: 'Select item...',
      initialLabel: (row) => {
        const it = items.find((i) => String(i.id) === row.item)
        return it ? `${it.name} – ${it.sku}` : undefined
      },
    },
    { key: 'blanket_qty', header: 'Blanket Qty', type: 'numeric', width: '110px', align: 'right' },
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
        formatCurrency((parseFloat(row.blanket_qty || '0') || 0) * (parseFloat(row.unit_price || '0') || 0)),
    },
  ]

  const update = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.customer) {
      toast.error('Customer is required')
      return
    }
    if (!formData.issue_date) {
      toast.error('Issue date is required')
      return
    }

    const linesPayload = lines
      .filter((l) => l.item && l.blanket_qty && l.uom)
      .map((l) => ({
        item: Number(l.item),
        blanket_qty: Number(l.blanket_qty),
        uom: Number(l.uom),
        unit_price: l.unit_price || null,
      }))

    if (linesPayload.length === 0) {
      toast.error('Add at least one valid line item')
      return
    }

    try {
      await createContract.mutateAsync({
        customer: Number(formData.customer),
        blanket_po: formData.blanket_po,
        issue_date: formData.issue_date,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        ship_to: formData.ship_to ? Number(formData.ship_to) : null,
        notes: formData.notes,
        lines: linesPayload,
      })
      navigate('/contracts')
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object') {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to create contract'))
      }
    }
  }

  const isPending = createContract.isPending

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-7 pb-16">
        <PageHeader
          title="Create New Contract"
          description="Set up a blanket contract with a customer"
          breadcrumb={[{ label: 'Contracts', to: '/contracts' }, { label: 'New' }]}
        />

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Contract Details */}
          <div className="rounded-[14px] border animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)', position: 'relative', zIndex: 20 }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Contract Details</span>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Customer *</Label>
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
                      }))
                    }}
                    placeholder="Select customer..."
                    allowClear
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Customer Blanket PO #</Label>
                  <Input value={formData.blanket_po} onChange={(e) => update('blanket_po', e.target.value)} placeholder="Customer's PO reference" style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Dates</span>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Issue Date *</Label>
                  <Input type="date" value={formData.issue_date} onChange={(e) => update('issue_date', e.target.value)} required style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Start Date</Label>
                  <Input type="date" value={formData.start_date} onChange={(e) => update('start_date', e.target.value)} style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>End Date</Label>
                  <Input type="date" value={formData.end_date} onChange={(e) => update('end_date', e.target.value)} style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Shipping & Notes */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Shipping &amp; Notes</span>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Default Ship To</Label>
                <Select value={formData.ship_to} onValueChange={(v) => update('ship_to', v)} disabled={!formData.customer}>
                  <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                    <SelectValue placeholder={formData.customer ? 'Select location...' : 'Select a customer first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {customerLocations.map((location) => (
                      <SelectItem key={location.id} value={String(location.id)}>
                        {location.name} - {location.city}, {location.state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Notes</Label>
                <Textarea value={formData.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Contract terms, notes..." rows={3} style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
              </div>
            </div>
          </div>

          {/* Contract Lines */}
          {/* No `overflow-hidden` here: the line-item rows host SearchableCombobox dropdowns
              that must overflow the card downward instead of being clipped by it. */}
          <div className="rounded-[14px] border animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Contract Lines</span>
            </div>
            <div className="px-6 py-5">
              <LineItemGrid
                lines={lines}
                columns={lineColumns}
                onCellChange={handleLineChange}
                onAddLine={handleAddLine}
                onRemoveLine={handleRemoveLine}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="text-[13px] rounded-md px-3 py-2.5" style={{ background: 'var(--so-danger-bg)', color: 'var(--so-danger-text)' }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid var(--so-border-light)' }}>
            <button type="button" className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate(-1)}>Cancel</button>
            <button type="submit" className={`${primaryBtnClass} ${isPending || !formData.customer ? 'opacity-50 pointer-events-none' : ''}`} style={primaryBtnStyle} disabled={isPending || !formData.customer}>
              {isPending ? 'Creating...' : 'Create Contract'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
