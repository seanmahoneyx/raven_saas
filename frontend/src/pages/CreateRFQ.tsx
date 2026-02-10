import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
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
import { useVendors, useLocations } from '@/api/parties'
import { useItems, useUnitsOfMeasure } from '@/api/items'
import { useCreateRFQ } from '@/api/rfqs'

interface LineFormData {
  id: string
  item: string
  description: string
  quantity: string
  uom: string
  target_price: string
}

export default function CreateRFQ() {
  usePageTitle('Create RFQ')
  const navigate = useNavigate()
  const createRFQ = useCreateRFQ()

  const { data: vendorsData } = useVendors()
  const { data: locationsData } = useLocations()
  const { data: itemsData } = useItems()
  const { data: uomData } = useUnitsOfMeasure()

  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    rfq_number: '',
    status: 'DRAFT',
    vendor: '',
    date: new Date().toISOString().split('T')[0],
    expected_date: '',
    ship_to: '',
    notes: '',
  })

  const [lines, setLines] = useState<LineFormData[]>([])

  // Filter locations to warehouse type only
  const warehouseLocations =
    locationsData?.results?.filter((l) => l.location_type === 'WAREHOUSE') ?? []

  const handleAddLine = () => {
    setLines([
      ...lines,
      {
        id: `new-${Date.now()}`,
        item: '',
        description: '',
        quantity: '',
        uom: '',
        target_price: '',
      },
    ])
  }

  const handleRemoveLine = (id: string) => {
    setLines(lines.filter((l) => l.id !== id))
  }

  const handleLineChange = (id: string, field: keyof LineFormData, value: string) => {
    setLines(
      lines.map((l) => {
        if (l.id !== id) return l
        const updated = { ...l, [field]: value }
        // Auto-populate UOM when item is selected
        if (field === 'item' && value) {
          const selectedItem = itemsData?.results?.find((item) => String(item.id) === value)
          if (selectedItem?.base_uom) {
            updated.uom = String(selectedItem.base_uom)
          }
        }
        return updated
      })
    )
  }

  const update = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const linesPayload = lines
      .filter((l) => l.item && l.quantity && l.uom)
      .map((l) => ({
        item: Number(l.item),
        description: l.description,
        quantity: Number(l.quantity),
        uom: Number(l.uom),
        target_price: l.target_price || null,
      }))

    try {
      await createRFQ.mutateAsync({
        rfq_number: formData.rfq_number || undefined,
        status: formData.status,
        vendor: Number(formData.vendor),
        date: formData.date,
        expected_date: formData.expected_date || null,
        ship_to: formData.ship_to ? Number(formData.ship_to) : null,
        notes: formData.notes,
        lines: linesPayload,
      })
      navigate('/vendors')
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object') {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to create RFQ'))
      }
    }
  }

  const isPending = createRFQ.isPending

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create New RFQ</h1>
          <p className="text-sm text-muted-foreground">
            Request for Quote from a vendor
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* ── RFQ Details ── */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">RFQ Details</h2>

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
                  {vendorsData?.results?.map((vendor) => (
                    <SelectItem key={vendor.id} value={String(vendor.id)}>
                      {vendor.party_code} - {vendor.party_display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rfq_number">RFQ Number</Label>
              <Input
                id="rfq_number"
                value={formData.rfq_number}
                onChange={(e) => update('rfq_number', e.target.value)}
                placeholder="Auto-generated if blank"
              />
            </div>
          </div>
        </section>

        {/* ── Dates ── */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Dates</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">RFQ Date *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => update('date', e.target.value)}
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
          </div>
        </section>

        {/* ── Shipping ── */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Shipping</h2>

          <div className="space-y-2">
            <Label htmlFor="ship_to">Ship To (Warehouse)</Label>
            <Select
              value={formData.ship_to}
              onValueChange={(v) => update('ship_to', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select warehouse location..." />
              </SelectTrigger>
              <SelectContent>
                {warehouseLocations.map((location) => (
                  <SelectItem key={location.id} value={String(location.id)}>
                    {location.name} - {location.city}, {location.state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        {/* ── Notes ── */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Notes</h2>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Requirements, specifications, delivery instructions..."
            rows={3}
          />
        </section>

        {/* ── RFQ Lines ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold border-b pb-2 flex-1">RFQ Lines</h2>
            <Button type="button" variant="outline" size="sm" onClick={handleAddLine}>
              <Plus className="h-4 w-4 mr-1" />
              Add Line
            </Button>
          </div>

          {lines.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground border rounded-md">
              No lines added yet. Click "Add Line" to add items to this RFQ.
            </div>
          ) : (
            <div className="space-y-2">
              {/* Header */}
              <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] gap-2 text-sm font-medium text-muted-foreground px-1">
                <span>Item</span>
                <span>Description</span>
                <span>Qty</span>
                <span>UOM</span>
                <span>Target Price</span>
                <span></span>
              </div>
              {/* Lines */}
              {lines.map((line) => (
                <div
                  key={line.id}
                  className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] gap-2 items-center bg-muted/50 rounded-lg p-3"
                >
                  <Select
                    value={line.item}
                    onValueChange={(v) => handleLineChange(line.id, 'item', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select item..." />
                    </SelectTrigger>
                    <SelectContent>
                      {itemsData?.results?.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.sku} - {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Line description"
                    value={line.description}
                    onChange={(e) => handleLineChange(line.id, 'description', e.target.value)}
                  />
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={line.quantity}
                    onChange={(e) => handleLineChange(line.id, 'quantity', e.target.value)}
                  />
                  <Select
                    value={line.uom}
                    onValueChange={(v) => handleLineChange(line.id, 'uom', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="UOM" />
                    </SelectTrigger>
                    <SelectContent>
                      {uomData?.results?.map((uom) => (
                        <SelectItem key={uom.id} value={String(uom.id)}>
                          {uom.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Price"
                    value={line.target_price}
                    onChange={(e) => handleLineChange(line.id, 'target_price', e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => handleRemoveLine(line.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Error ── */}
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
            {error}
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !formData.vendor}>
            {isPending ? 'Creating...' : 'Create RFQ'}
          </Button>
        </div>
      </form>
    </div>
  )
}
