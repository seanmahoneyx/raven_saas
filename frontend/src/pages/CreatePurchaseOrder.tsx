import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useCreatePurchaseOrder } from '@/api/orders'
import { useCostLookup } from '@/api/costLists'
import { useVendors, useLocations } from '@/api/parties'
import { useItems, useUnitsOfMeasure } from '@/api/items'
import { Button } from '@/components/ui/button'
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
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'

const ORDER_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'complete', label: 'Complete' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface OrderLineForm {
  item: string
  quantity_ordered: string
  uom: string
  unit_cost: string
}

export default function CreatePurchaseOrder() {
  usePageTitle('Create Purchase Order')
  const navigate = useNavigate()
  const createOrder = useCreatePurchaseOrder()

  const { data: vendorsData } = useVendors()
  const { data: locationsData } = useLocations()
  const { data: itemsData } = useItems()
  const { data: uomData } = useUnitsOfMeasure()

  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    po_number: '',
    status: 'draft',
    priority: '5',
    vendor: '',
    ship_to: '',
    order_date: new Date().toISOString().split('T')[0],
    expected_date: '',
    scheduled_date: '',
    notes: '',
  })

  const [lines, setLines] = useState<OrderLineForm[]>([])
  const [costLookupLine, setCostLookupLine] = useState<number | null>(null)

  const vendors = vendorsData?.results ?? []
  const locations = locationsData?.results ?? []
  const items = itemsData?.results ?? []
  const uoms = uomData?.results ?? []

  const warehouseLocations = locations.filter((l) => l.location_type === 'WAREHOUSE')

  const lookupLine = costLookupLine !== null ? lines[costLookupLine] : null
  const { data: costData } = useCostLookup(
    formData.vendor ? Number(formData.vendor) : undefined,
    lookupLine?.item ? Number(lookupLine.item) : undefined,
    lookupLine?.quantity_ordered ? Number(lookupLine.quantity_ordered) : undefined,
  )

  // Auto-populate cost from cost list
  useEffect(() => {
    if (costData?.unit_cost && costLookupLine !== null && costLookupLine < lines.length) {
      const currentLine = lines[costLookupLine]
      if (currentLine.unit_cost === '0.00' || currentLine.unit_cost === '') {
        const newLines = [...lines]
        newLines[costLookupLine] = { ...newLines[costLookupLine], unit_cost: costData.unit_cost }
        setLines(newLines)
      }
      setCostLookupLine(null)
    }
  }, [costData])

  const isPending = createOrder.isPending

  const update = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }))

  const handleAddLine = () => {
    setLines([...lines, { item: '', quantity_ordered: '1', uom: '', unit_cost: '0.00' }])
  }

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index))
  }

  const handleLineChange = (index: number, field: keyof OrderLineForm, value: string) => {
    const newLines = [...lines]
    newLines[index] = { ...newLines[index], [field]: value }

    if (field === 'item' && value) {
      const selectedItem = itemsData?.results.find((i) => String(i.id) === value)
      if (selectedItem) {
        newLines[index].uom = String(selectedItem.base_uom)
      }
      // Trigger cost lookup when item is set and vendor is selected
      if (formData.vendor) {
        newLines[index].unit_cost = '0.00'  // Reset to allow auto-populate
        setLines(newLines)
        setCostLookupLine(index)
        return
      }
    }

    if (field === 'quantity_ordered' && value && formData.vendor && newLines[index].item) {
      // Re-lookup cost on quantity change
      newLines[index].unit_cost = '0.00'
      setLines(newLines)
      setCostLookupLine(index)
      return
    }

    setLines(newLines)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      await createOrder.mutateAsync({
        po_number: formData.po_number || undefined,
        status: formData.status,
        vendor: Number(formData.vendor),
        order_date: formData.order_date,
        expected_date: formData.expected_date || null,
        scheduled_date: formData.scheduled_date || null,
        ship_to: Number(formData.ship_to),
        notes: formData.notes,
        priority: Number(formData.priority),
        lines: lines.map((line, index) => ({
          line_number: index + 1,
          item: Number(line.item),
          quantity_ordered: Number(line.quantity_ordered),
          uom: Number(line.uom),
          unit_cost: line.unit_cost,
        })),
      } as any)

      navigate('/orders?tab=purchase')
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object') {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to create purchase order'))
      }
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create New Purchase Order</h1>
          <p className="text-sm text-muted-foreground">
            Create a new purchase order for a vendor
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* PO Details */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Order Details</h2>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="po_number">PO Number</Label>
              <Input
                id="po_number"
                value={formData.po_number}
                onChange={(e) => update('po_number', e.target.value)}
                placeholder="Auto-generated"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(v) => update('status', v)}>
                <SelectTrigger>
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
            <div className="space-y-2">
              <Label htmlFor="priority">Priority (1-10)</Label>
              <Input
                id="priority"
                type="number"
                min="1"
                max="10"
                value={formData.priority}
                onChange={(e) => update('priority', e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Vendor & Ship To */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Vendor & Destination</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vendor">Vendor *</Label>
              <Select
                value={formData.vendor}
                onValueChange={(v) => update('vendor', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor..." />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.party_code} - {v.party_display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ship_to">Ship To (Warehouse) *</Label>
              <Select
                value={formData.ship_to}
                onValueChange={(v) => update('ship_to', v)}
              >
                <SelectTrigger>
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
          </div>
        </section>

        {/* Dates */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Dates</h2>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="order_date">Order Date *</Label>
              <Input
                id="order_date"
                type="date"
                value={formData.order_date}
                onChange={(e) => update('order_date', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expected_date">Expected Date</Label>
              <Input
                id="expected_date"
                type="date"
                value={formData.expected_date}
                onChange={(e) => update('expected_date', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scheduled_date">Scheduled Date</Label>
              <Input
                id="scheduled_date"
                type="date"
                value={formData.scheduled_date}
                onChange={(e) => update('scheduled_date', e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Notes */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Notes</h2>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Order notes..."
            rows={3}
          />
        </section>

        {/* Line Items */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold border-b pb-2 flex-1">Order Lines</h2>
            <Button type="button" variant="outline" size="sm" onClick={handleAddLine}>
              <Plus className="h-4 w-4 mr-1" />
              Add Line
            </Button>
          </div>

          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No lines added. Click "Add Line" to add items to this order.
            </p>
          ) : (
            <div className="space-y-3">
              {lines.map((line, index) => (
                <div key={index} className="bg-muted/50 rounded-lg p-3">
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4 space-y-1">
                      <Label className="text-xs">Item</Label>
                      <Select
                        value={line.item}
                        onValueChange={(v) => handleLineChange(index, 'item', v)}
                      >
                        <SelectTrigger className="h-9">
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
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Qty</Label>
                      <Input
                        type="number"
                        min="1"
                        value={line.quantity_ordered}
                        onChange={(e) => handleLineChange(index, 'quantity_ordered', e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">UOM</Label>
                      <Select
                        value={line.uom}
                        onValueChange={(v) => handleLineChange(index, 'uom', v)}
                      >
                        <SelectTrigger className="h-9">
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
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Cost</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.unit_cost}
                          onChange={(e) => handleLineChange(index, 'unit_cost', e.target.value)}
                          className="h-9"
                        />
                        {costLookupLine === index && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">...</div>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveLine(index)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Error */}
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !formData.vendor || !formData.ship_to}>
            {isPending ? 'Creating...' : 'Create Purchase Order'}
          </Button>
        </div>
      </form>
    </div>
  )
}
