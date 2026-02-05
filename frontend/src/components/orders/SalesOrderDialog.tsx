import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { Plus, Trash2 } from 'lucide-react'
import { useCreateSalesOrder, useUpdateSalesOrder } from '@/api/orders'
import { useCustomers, useLocations } from '@/api/parties'
import { useItems, useUnitsOfMeasure } from '@/api/items'
import type { SalesOrder, OrderStatus } from '@/types/api'

interface SalesOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order?: SalesOrder | null
  onSuccess?: (order: SalesOrder) => void
}

interface OrderLineForm {
  id?: number
  item: string
  quantity_ordered: string
  uom: string
  unit_price: string
  notes: string
}

const ORDER_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'picking', label: 'Picking' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'complete', label: 'Complete' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function SalesOrderDialog({ open, onOpenChange, order, onSuccess }: SalesOrderDialogProps) {
  const [formData, setFormData] = useState({
    order_number: '',
    status: 'draft' as OrderStatus,
    customer: '',
    order_date: new Date().toISOString().split('T')[0],
    scheduled_date: '',
    ship_to: '',
    bill_to: '',
    customer_po: '',
    notes: '',
    priority: '5',
  })

  const [lines, setLines] = useState<OrderLineForm[]>([])

  const { data: customersData } = useCustomers()
  const { data: locationsData } = useLocations()
  const { data: itemsData } = useItems()
  const { data: uomData } = useUnitsOfMeasure()

  const createOrder = useCreateSalesOrder()
  const updateOrder = useUpdateSalesOrder()

  const isEditing = !!order

  useEffect(() => {
    if (order) {
      setFormData({
        order_number: order.order_number,
        status: order.status,
        customer: String(order.customer),
        order_date: order.order_date,
        scheduled_date: order.scheduled_date ?? '',
        ship_to: String(order.ship_to),
        bill_to: order.bill_to ? String(order.bill_to) : '',
        customer_po: order.customer_po,
        notes: order.notes,
        priority: String(order.priority),
      })
      if (order.lines) {
        setLines(order.lines.map((line) => ({
          id: line.id,
          item: String(line.item),
          quantity_ordered: String(line.quantity_ordered),
          uom: String(line.uom),
          unit_price: line.unit_price,
          notes: line.notes,
        })))
      }
    } else {
      setFormData({
        order_number: '',
        status: 'draft' as OrderStatus,
        customer: '',
        order_date: new Date().toISOString().split('T')[0],
        scheduled_date: '',
        ship_to: '',
        bill_to: '',
        customer_po: '',
        notes: '',
        priority: '5',
      })
      setLines([])
    }
  }, [order, open])

  const handleAddLine = () => {
    setLines([
      ...lines,
      { item: '', quantity_ordered: '1', uom: '', unit_price: '0.00', notes: '' },
    ])
  }

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index))
  }

  const handleLineChange = (index: number, field: keyof OrderLineForm, value: string) => {
    const newLines = [...lines]
    newLines[index] = { ...newLines[index], [field]: value }

    // Auto-set UOM when item is selected
    if (field === 'item' && value) {
      const selectedItem = itemsData?.results.find((i) => String(i.id) === value)
      if (selectedItem) {
        newLines[index].uom = String(selectedItem.base_uom)
      }
    }

    setLines(newLines)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const payload = {
      order_number: formData.order_number || undefined,
      status: formData.status,
      customer: Number(formData.customer),
      order_date: formData.order_date,
      scheduled_date: formData.scheduled_date || null,
      ship_to: Number(formData.ship_to),
      bill_to: formData.bill_to ? Number(formData.bill_to) : null,
      customer_po: formData.customer_po,
      notes: formData.notes,
      priority: Number(formData.priority),
      lines: lines.map((line, index) => ({
        ...(line.id ? { id: line.id } : {}),
        line_number: index + 1,
        item: Number(line.item),
        quantity_ordered: Number(line.quantity_ordered),
        uom: Number(line.uom),
        unit_price: line.unit_price,
        notes: line.notes,
      })),
    }

    try {
      let result: SalesOrder
      if (isEditing && order) {
        result = await updateOrder.mutateAsync({ id: order.id, ...payload } as any)
      } else {
        result = await createOrder.mutateAsync(payload as any)
      }
      onOpenChange(false)
      onSuccess?.(result)
    } catch (error) {
      console.error('Failed to save order:', error)
    }
  }

  const isPending = createOrder.isPending || updateOrder.isPending
  const customers = customersData?.results ?? []
  const locations = locationsData?.results ?? []
  const items = itemsData?.results ?? []
  const uoms = uomData?.results ?? []

  // Filter locations by selected customer's party
  const selectedCustomer = customers.find((c) => String(c.id) === formData.customer)
  const customerLocations = selectedCustomer
    ? locations.filter((l) => l.party === selectedCustomer.party)
    : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Sales Order' : 'New Sales Order'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Header Section */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="order_number">Order Number</Label>
                <Input
                  id="order_number"
                  value={formData.order_number}
                  onChange={(e) => setFormData({ ...formData, order_number: e.target.value })}
                  placeholder="Auto-generated"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value as OrderStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUSES.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Input
                  id="priority"
                  type="number"
                  min="1"
                  max="10"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer">Customer *</Label>
                <Select
                  value={formData.customer}
                  onValueChange={(value) => setFormData({ ...formData, customer: value, ship_to: '', bill_to: '' })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={String(customer.id)}>
                        {customer.party_code} - {customer.party_display_name}
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
                  onChange={(e) => setFormData({ ...formData, customer_po: e.target.value })}
                  placeholder="Customer's PO reference"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="order_date">Order Date *</Label>
                <Input
                  id="order_date"
                  type="date"
                  value={formData.order_date}
                  onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduled_date">Scheduled Date</Label>
                <Input
                  id="scheduled_date"
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ship_to">Ship To *</Label>
                <Select
                  value={formData.ship_to}
                  onValueChange={(value) => setFormData({ ...formData, ship_to: value })}
                  disabled={!formData.customer}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select location..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customerLocations.map((location) => (
                      <SelectItem key={location.id} value={String(location.id)}>
                        {location.code} - {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bill_to">Bill To</Label>
                <Select
                  value={formData.bill_to}
                  onValueChange={(value) => setFormData({ ...formData, bill_to: value })}
                  disabled={!formData.customer}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Same as ship to" />
                  </SelectTrigger>
                  <SelectContent>
                    {customerLocations.map((location) => (
                      <SelectItem key={location.id} value={String(location.id)}>
                        {location.code} - {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Order notes..."
                rows={2}
              />
            </div>

            {/* Order Lines Section */}
            <div className="border-t pt-4 mt-2">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">Order Lines</Label>
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
                    <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 bg-muted/50 rounded-lg">
                      <div className="col-span-4 space-y-1">
                        <Label className="text-xs">Item</Label>
                        <Select
                          value={line.item}
                          onValueChange={(value) => handleLineChange(index, 'item', value)}
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
                          onValueChange={(value) => handleLineChange(index, 'uom', value)}
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
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !formData.customer || !formData.ship_to}>
              {isPending ? 'Saving...' : isEditing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
