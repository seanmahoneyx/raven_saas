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
import { useCreateEstimate, useUpdateEstimate } from '@/api/estimates'
import { useCustomers, useLocations } from '@/api/parties'
import { useItems, useUnitsOfMeasure } from '@/api/items'
import type { Estimate, EstimateStatus } from '@/types/api'

interface EstimateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  estimate?: Estimate | null
  onSuccess?: (estimate: Estimate) => void
}

interface EstimateLineForm {
  id?: number
  item: string
  description: string
  quantity: string
  uom: string
  unit_price: string
  notes: string
}

const ESTIMATE_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
]

export function EstimateDialog({ open, onOpenChange, estimate, onSuccess }: EstimateDialogProps) {
  const [formData, setFormData] = useState({
    estimate_number: '',
    status: 'draft' as EstimateStatus,
    customer: '',
    date: new Date().toISOString().split('T')[0],
    expiration_date: '',
    ship_to: '',
    bill_to: '',
    customer_po: '',
    notes: '',
    terms_and_conditions: '',
    tax_rate: '0.00',
  })

  const [lines, setLines] = useState<EstimateLineForm[]>([])

  const { data: customersData } = useCustomers()
  const { data: locationsData } = useLocations()
  const { data: itemsData } = useItems()
  const { data: uomData } = useUnitsOfMeasure()

  const createEstimate = useCreateEstimate()
  const updateEstimate = useUpdateEstimate()

  const isEditing = !!estimate

  useEffect(() => {
    if (estimate) {
      setFormData({
        estimate_number: estimate.estimate_number,
        status: estimate.status,
        customer: String(estimate.customer),
        date: estimate.date,
        expiration_date: estimate.expiration_date ?? '',
        ship_to: estimate.ship_to ? String(estimate.ship_to) : '',
        bill_to: estimate.bill_to ? String(estimate.bill_to) : '',
        customer_po: estimate.customer_po,
        notes: estimate.notes,
        terms_and_conditions: estimate.terms_and_conditions,
        tax_rate: estimate.tax_rate ?? '0.00',
      })
      if (estimate.lines) {
        setLines(estimate.lines.map((line) => ({
          id: line.id,
          item: String(line.item),
          description: line.description,
          quantity: String(line.quantity),
          uom: String(line.uom),
          unit_price: line.unit_price,
          notes: line.notes,
        })))
      }
    } else {
      setFormData({
        estimate_number: '',
        status: 'draft' as EstimateStatus,
        customer: '',
        date: new Date().toISOString().split('T')[0],
        expiration_date: '',
        ship_to: '',
        bill_to: '',
        customer_po: '',
        notes: '',
        terms_and_conditions: '',
        tax_rate: '0.00',
      })
      setLines([])
    }
  }, [estimate, open])

  const handleAddLine = () => {
    setLines([
      ...lines,
      { item: '', description: '', quantity: '1', uom: '', unit_price: '0.00', notes: '' },
    ])
  }

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index))
  }

  const handleLineChange = (index: number, field: keyof EstimateLineForm, value: string) => {
    const newLines = [...lines]
    newLines[index] = { ...newLines[index], [field]: value }

    // Auto-set UOM and description when item is selected
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

    const payload = {
      estimate_number: formData.estimate_number || undefined,
      status: formData.status,
      customer: Number(formData.customer),
      date: formData.date,
      expiration_date: formData.expiration_date || null,
      ship_to: formData.ship_to ? Number(formData.ship_to) : null,
      bill_to: formData.bill_to ? Number(formData.bill_to) : null,
      customer_po: formData.customer_po,
      notes: formData.notes,
      terms_and_conditions: formData.terms_and_conditions,
      tax_rate: formData.tax_rate,
      lines: lines.map((line, index) => ({
        ...(line.id ? { id: line.id } : {}),
        line_number: (index + 1) * 10,
        item: Number(line.item),
        description: line.description,
        quantity: Number(line.quantity),
        uom: Number(line.uom),
        unit_price: line.unit_price,
        notes: line.notes,
      })),
    }

    try {
      let result: Estimate
      if (isEditing && estimate) {
        result = await updateEstimate.mutateAsync({ id: estimate.id, ...payload } as any)
      } else {
        result = await createEstimate.mutateAsync(payload as any)
      }
      onOpenChange(false)
      onSuccess?.(result)
    } catch (error) {
      console.error('Failed to save estimate:', error)
    }
  }

  const isPending = createEstimate.isPending || updateEstimate.isPending
  const customers = customersData?.results ?? []
  const locations = locationsData?.results ?? []
  const items = itemsData?.results ?? []
  const uoms = uomData?.results ?? []

  // Filter locations by selected customer's party
  const selectedCustomer = customers.find((c) => String(c.id) === formData.customer)
  const customerLocations = selectedCustomer
    ? locations.filter((l) => l.party === selectedCustomer.party)
    : []

  // Calculate line totals for display
  const lineTotal = lines.reduce((sum, line) => {
    return sum + (Number(line.quantity) || 0) * (parseFloat(line.unit_price) || 0)
  }, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Estimate' : 'New Estimate'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Header Section */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="estimate_number">Estimate Number</Label>
                <Input
                  id="estimate_number"
                  value={formData.estimate_number}
                  onChange={(e) => setFormData({ ...formData, estimate_number: e.target.value })}
                  placeholder="Auto-generated"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value as EstimateStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTIMATE_STATUSES.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
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
                  onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
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
                <Label htmlFor="date">Estimate Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiration_date">Expiration Date</Label>
                <Input
                  id="expiration_date"
                  type="date"
                  value={formData.expiration_date}
                  onChange={(e) => setFormData({ ...formData, expiration_date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ship_to">Ship To</Label>
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
                placeholder="Estimate notes..."
                rows={2}
              />
            </div>

            {/* Estimate Lines Section */}
            <div className="border-t pt-4 mt-2">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">Line Items</Label>
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
                          value={line.quantity}
                          onChange={(e) => handleLineChange(index, 'quantity', e.target.value)}
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
                  {/* Line total */}
                  <div className="flex justify-end pr-3 pt-2 border-t">
                    <span className="text-sm text-muted-foreground mr-4">Subtotal:</span>
                    <span className="font-medium">${lineTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !formData.customer}>
              {isPending ? 'Saving...' : isEditing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
