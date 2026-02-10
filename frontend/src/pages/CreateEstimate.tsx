import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useCreateEstimate } from '@/api/estimates'
import { useCustomers, useLocations } from '@/api/parties'
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

export default function CreateEstimate() {
  usePageTitle('Create Estimate')
  const navigate = useNavigate()
  const createEstimate = useCreateEstimate()

  const { data: customersData } = useCustomers()
  const { data: locationsData } = useLocations()
  const { data: itemsData } = useItems()
  const { data: uomData } = useUnitsOfMeasure()

  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    estimate_number: '',
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

  const [lines, setLines] = useState<EstimateLineForm[]>([])

  const customers = customersData?.results ?? []
  const locations = locationsData?.results ?? []
  const items = itemsData?.results ?? []
  const uoms = uomData?.results ?? []

  const selectedCustomer = customers.find((c) => String(c.id) === formData.customer)
  const customerLocations = selectedCustomer
    ? locations.filter((l) => l.party === selectedCustomer.party)
    : []

  const subtotal = lines.reduce((sum, line) => {
    return sum + (Number(line.quantity) || 0) * (parseFloat(line.unit_price) || 0)
  }, 0)

  const isPending = createEstimate.isPending

  const update = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }))

  const handleAddLine = () => {
    setLines([...lines, { item: '', description: '', quantity: '1', uom: '', unit_price: '0.00' }])
  }

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index))
  }

  const handleLineChange = (index: number, field: keyof EstimateLineForm, value: string) => {
    const newLines = [...lines]
    newLines[index] = { ...newLines[index], [field]: value }

    if (field === 'item' && value) {
      const selectedItem = itemsData?.results.find((i) => String(i.id) === value)
      if (selectedItem) {
        newLines[index].uom = String(selectedItem.base_uom)
        newLines[index].description = selectedItem.sell_desc || selectedItem.name
      }
    }

    setLines(newLines)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      await createEstimate.mutateAsync({
        estimate_number: formData.estimate_number || undefined,
        status: formData.status,
        customer: Number(formData.customer),
        date: formData.date,
        expiration_date: formData.expiration_date || null,
        ship_to: formData.ship_to ? Number(formData.ship_to) : null,
        bill_to: formData.bill_to ? Number(formData.bill_to) : null,
        customer_po: formData.customer_po,
        notes: formData.notes,
        tax_rate: formData.tax_rate,
        lines: lines.map((line, index) => ({
          line_number: (index + 1) * 10,
          item: Number(line.item),
          description: line.description,
          quantity: Number(line.quantity),
          uom: Number(line.uom),
          unit_price: line.unit_price,
        })),
      } as any)

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
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create New Estimate</h1>
          <p className="text-sm text-muted-foreground">
            Create a new estimate for a customer
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Header Fields */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Estimate Details</h2>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="estimate_number">Estimate Number</Label>
              <Input
                id="estimate_number"
                value={formData.estimate_number}
                onChange={(e) => update('estimate_number', e.target.value)}
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
                  {ESTIMATE_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax_rate">Tax Rate (%)</Label>
              <Input
                id="tax_rate"
                type="number"
                step="0.01"
                min="0"
                value={formData.tax_rate}
                onChange={(e) => update('tax_rate', e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Customer */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Customer</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer">Customer *</Label>
              <Select
                value={formData.customer}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, customer: v, ship_to: '', bill_to: '' }))}
              >
                <SelectTrigger>
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
            <div className="space-y-2">
              <Label htmlFor="customer_po">Customer PO</Label>
              <Input
                id="customer_po"
                value={formData.customer_po}
                onChange={(e) => update('customer_po', e.target.value)}
                placeholder="Customer's PO reference"
              />
            </div>
          </div>
        </section>

        {/* Dates */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Dates</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Estimate Date *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => update('date', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiration_date">Expiration Date</Label>
              <Input
                id="expiration_date"
                type="date"
                value={formData.expiration_date}
                onChange={(e) => update('expiration_date', e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Shipping */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Shipping & Billing</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ship_to">Ship To</Label>
              <Select
                value={formData.ship_to}
                onValueChange={(v) => update('ship_to', v)}
                disabled={!formData.customer}
              >
                <SelectTrigger>
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
            <div className="space-y-2">
              <Label htmlFor="bill_to">Bill To</Label>
              <Select
                value={formData.bill_to}
                onValueChange={(v) => update('bill_to', v)}
                disabled={!formData.customer}
              >
                <SelectTrigger>
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
        </section>

        {/* Notes */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Notes</h2>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Estimate notes..."
            rows={3}
          />
        </section>

        {/* Line Items */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold border-b pb-2 flex-1">Line Items</h2>
            <Button type="button" variant="outline" size="sm" onClick={handleAddLine}>
              <Plus className="h-4 w-4 mr-1" />
              Add Line
            </Button>
          </div>

          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No lines added. Click "Add Line" to add items to this estimate.
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
                        value={line.quantity}
                        onChange={(e) => handleLineChange(index, 'quantity', e.target.value)}
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
                      <Label className="text-xs">Price</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.unit_price}
                        onChange={(e) => handleLineChange(index, 'unit_price', e.target.value)}
                        className="h-9"
                      />
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
                  {line.description && (
                    <p className="text-xs text-muted-foreground mt-1 pl-1">{line.description}</p>
                  )}
                </div>
              ))}

              <div className="flex justify-end pr-3 pt-2 border-t">
                <span className="text-sm text-muted-foreground mr-4">Subtotal:</span>
                <span className="font-medium">${subtotal.toFixed(2)}</span>
              </div>
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
          <Button type="submit" disabled={isPending || !formData.customer}>
            {isPending ? 'Creating...' : 'Create Estimate'}
          </Button>
        </div>
      </form>
    </div>
  )
}
