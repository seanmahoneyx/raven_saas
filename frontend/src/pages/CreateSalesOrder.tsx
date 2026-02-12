import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useCreateSalesOrder } from '@/api/orders'
import { useCustomers, useLocations } from '@/api/parties'
import { useItems, useUnitsOfMeasure } from '@/api/items'
import { usePriceLookup } from '@/api/priceLists'
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
  { value: 'picking', label: 'Picking' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'complete', label: 'Complete' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface OrderLineForm {
  item: string
  quantity_ordered: string
  uom: string
  unit_price: string
}

export default function CreateSalesOrder() {
  usePageTitle('Create Sales Order')
  const navigate = useNavigate()
  const createOrder = useCreateSalesOrder()

  const { data: customersData } = useCustomers()
  const { data: locationsData } = useLocations()
  const { data: itemsData } = useItems()
  const { data: uomData } = useUnitsOfMeasure()

  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    order_number: '',
    status: 'draft',
    priority: '5',
    customer: '',
    customer_po: '',
    order_date: new Date().toISOString().split('T')[0],
    scheduled_date: '',
    ship_to: '',
    bill_to: '',
    notes: '',
  })

  const [lines, setLines] = useState<OrderLineForm[]>([])
  const [priceLookupLine, setPriceLookupLine] = useState<number | null>(null)

  const customers = customersData?.results ?? []
  const locations = locationsData?.results ?? []
  const items = itemsData?.results ?? []
  const uoms = uomData?.results ?? []

  const selectedCustomer = customers.find((c) => String(c.id) === formData.customer)
  const customerLocations = selectedCustomer
    ? locations.filter((l) => l.party === selectedCustomer.party)
    : []

  const lookupLine = priceLookupLine !== null ? lines[priceLookupLine] : null
  const { data: priceData } = usePriceLookup(
    formData.customer ? Number(formData.customer) : undefined,
    lookupLine?.item ? Number(lookupLine.item) : undefined,
    lookupLine?.quantity_ordered ? Number(lookupLine.quantity_ordered) : undefined,
  )

  // Auto-populate price from price list
  useEffect(() => {
    if (priceData?.unit_price && priceLookupLine !== null && priceLookupLine < lines.length) {
      const currentLine = lines[priceLookupLine]
      // Only set if price hasn't been manually changed from default
      if (currentLine.unit_price === '0.00' || currentLine.unit_price === '') {
        const newLines = [...lines]
        newLines[priceLookupLine] = { ...newLines[priceLookupLine], unit_price: priceData.unit_price }
        setLines(newLines)
      }
      setPriceLookupLine(null)
    }
  }, [priceData])

  const isPending = createOrder.isPending

  const update = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }))

  const handleAddLine = () => {
    setLines([...lines, { item: '', quantity_ordered: '1', uom: '', unit_price: '0.00' }])
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
      // Trigger price lookup when item is set and customer is selected
      if (formData.customer) {
        newLines[index].unit_price = '0.00'  // Reset to allow auto-populate
        setLines(newLines)
        setPriceLookupLine(index)
        return
      }
    }

    if (field === 'quantity_ordered' && value && formData.customer && newLines[index].item) {
      // Re-lookup price on quantity change
      newLines[index].unit_price = '0.00'
      setLines(newLines)
      setPriceLookupLine(index)
      return
    }

    setLines(newLines)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      await createOrder.mutateAsync({
        order_number: formData.order_number || undefined,
        status: formData.status,
        customer: Number(formData.customer),
        order_date: formData.order_date,
        scheduled_date: formData.scheduled_date || null,
        ship_to: formData.ship_to ? Number(formData.ship_to) : null,
        bill_to: formData.bill_to ? Number(formData.bill_to) : null,
        customer_po: formData.customer_po,
        notes: formData.notes,
        priority: Number(formData.priority),
        lines: lines.map((line, index) => ({
          line_number: index + 1,
          item: Number(line.item),
          quantity_ordered: Number(line.quantity_ordered),
          uom: Number(line.uom),
          unit_price: line.unit_price,
        })),
      } as any)

      navigate('/orders?tab=sales')
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

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create New Sales Order</h1>
          <p className="text-sm text-muted-foreground">
            Create a new sales order for a customer
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Order Details */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Order Details</h2>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="order_number">Order Number</Label>
              <Input
                id="order_number"
                value={formData.order_number}
                onChange={(e) => update('order_number', e.target.value)}
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
                      <Label className="text-xs">Price</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.unit_price}
                          onChange={(e) => handleLineChange(index, 'unit_price', e.target.value)}
                          className="h-9"
                        />
                        {priceLookupLine === index && (
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
          <Button type="submit" disabled={isPending || !formData.customer}>
            {isPending ? 'Creating...' : 'Create Sales Order'}
          </Button>
        </div>
      </form>
    </div>
  )
}
