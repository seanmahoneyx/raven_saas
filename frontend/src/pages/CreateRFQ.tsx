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
import { useAllLocations } from '@/api/parties'
import { useAllItems, useAllUnitsOfMeasure } from '@/api/items'
import { useCreateRFQ, useNextRFQNumber } from '@/api/rfqs'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { PageHeader } from '@/components/page'
import { SearchableCombobox } from '@/components/common/SearchableCombobox'
import { LineItemGrid } from '@/components/common/LineItemGrid'
import type { LineItemColumn } from '@/components/common/LineItemGrid'
import { getApiErrorMessage } from '@/lib/errors'
import { toast } from 'sonner'

interface LineFormData {
  item: string
  description: string
  quantity: string
  uom: string
  target_price: string
}

// A fresh, blank line for the grid's explicit "+ Add Line" action.
const emptyLine = (): LineFormData => ({
  item: '',
  description: '',
  quantity: '',
  uom: '',
  target_price: '',
})

export default function CreateRFQ() {
  usePageTitle('Create RFQ')
  const navigate = useNavigate()
  const createRFQ = useCreateRFQ()
  const { data: nextRFQNumber } = useNextRFQNumber()

  const { data: locationsData } = useAllLocations()
  const { data: itemsData } = useAllItems()
  const { data: uomData } = useAllUnitsOfMeasure()

  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    status: 'draft',
    vendor: '',
    date: new Date().toISOString().split('T')[0],
    expected_date: '',
    ship_to: '',
    notes: '',
  })

  // Standard ERP grid: starts with one blank row. Rows are added/removed only via
  // the grid's explicit "+ Add Line" button and per-row delete (no auto-spawn).
  const [lines, setLines] = useState<LineFormData[]>([emptyLine()])

  const items = itemsData ?? []
  const uoms = uomData ?? []

  const warehouseLocations =
    (locationsData ?? []).filter((l) => l.location_type === 'WAREHOUSE')

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
    { key: 'target_price', header: 'Target Price', type: 'numeric', width: '120px', align: 'right' },
  ]

  const update = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (lines.length === 0 || lines.every((l) => !l.item || !l.quantity)) {
      toast.error('Add at least one line with an item and quantity')
      return
    }

    const linesPayload = lines
      .filter((l) => l.item && l.quantity && l.uom)
      .map((l) => ({
        item: Number(l.item),
        description: l.description,
        quantity: Number(l.quantity),
        uom: Number(l.uom),
        target_price: l.target_price || null,
      }))

    if (linesPayload.length === 0) {
      toast.error('Add at least one valid line item (item, quantity, and UOM are required)')
      return
    }

    try {
      const newRFQ = await createRFQ.mutateAsync({
        status: formData.status as import('@/types/api').RFQStatus,
        vendor: Number(formData.vendor),
        date: formData.date,
        expected_date: formData.expected_date || null,
        ship_to: formData.ship_to ? Number(formData.ship_to) : null,
        notes: formData.notes,
        lines: linesPayload as import('@/types/api').RFQLine[],
      })
      navigate(`/rfqs/${newRFQ.id}`)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to create RFQ'))
    }
  }

  const isPending = createRFQ.isPending

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-7 pb-16">
        <PageHeader
          title="Create New RFQ"
          breadcrumb={[{ label: 'RFQs', to: '/rfqs' }, { label: 'New' }]}
          meta={
            <span className="font-mono text-[13px] font-semibold" style={{ color: 'var(--so-text-primary)' }}>
              {nextRFQNumber ?? '…'}
            </span>
          }
        />

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* RFQ Details */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">RFQ Details</span>
            </div>
            <div className="px-6 py-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Vendor *</Label>
                <SearchableCombobox
                  entityType="vendor"
                  value={formData.vendor ? Number(formData.vendor) : null}
                  onChange={(id) => update('vendor', id ? String(id) : '')}
                  placeholder="Select vendor..."
                  allowClear
                />
              </div>
            </div>
          </div>

          {/* Dates & Shipping */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Dates &amp; Shipping</span>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>RFQ Date *</Label>
                  <Input type="date" value={formData.date} onChange={(e) => update('date', e.target.value)} required style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Expected Date</Label>
                  <Input type="date" value={formData.expected_date} onChange={(e) => update('expected_date', e.target.value)} style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Ship To (Warehouse)</Label>
                <Select value={formData.ship_to} onValueChange={(v) => update('ship_to', v)}>
                  <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}><SelectValue placeholder="Select warehouse location..." /></SelectTrigger>
                  <SelectContent>
                    {warehouseLocations.map((location) => (
                      <SelectItem key={location.id} value={String(location.id)}>{location.name} - {location.city}, {location.state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Notes</Label>
                <Textarea value={formData.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Requirements, specifications, delivery instructions..." rows={3} style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
              </div>
            </div>
          </div>

          {/* RFQ Lines — no `overflow-hidden`: the item picker dropdown must overflow the card. */}
          <div className="rounded-[14px] border animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">RFQ Lines</span>
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

          {error && (
            <div className="text-[13px] rounded-md px-3 py-2.5" style={{ background: 'var(--so-danger-bg)', color: 'var(--so-danger-text)' }}>{error}</div>
          )}

          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid var(--so-border-light)' }}>
            <button type="button" className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate(-1)}>Cancel</button>
            <button type="submit" className={`${primaryBtnClass} ${isPending || !formData.vendor ? 'opacity-50 pointer-events-none' : ''}`} style={primaryBtnStyle} disabled={isPending || !formData.vendor}>
              {isPending ? 'Creating...' : 'Create RFQ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
