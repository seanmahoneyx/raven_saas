import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
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
import { useCustomers, useLocations } from '@/api/parties'
import { useItems, useUnitsOfMeasure } from '@/api/items'
import { useCreateContract, useUpdateContract } from '@/api/contracts'
import type { Contract, ContractLineInput } from '@/types/api'

interface ContractDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contract?: Contract | null
  onSuccess?: (contract: Contract) => void
}

interface LineFormData {
  id: string // temporary id for UI
  item: string
  blanket_qty: string
  uom: string
  unit_price: string
}

export function ContractDialog({ open, onOpenChange, contract, onSuccess }: ContractDialogProps) {
  const isEditing = !!contract

  const [formData, setFormData] = useState({
    customer: '',
    blanket_po: '',
    issue_date: new Date().toISOString().split('T')[0],
    start_date: '',
    end_date: '',
    ship_to: '',
    notes: '',
  })

  const [lines, setLines] = useState<LineFormData[]>([])

  const { data: customersData } = useCustomers()
  const { data: locationsData } = useLocations()
  const { data: itemsData } = useItems()
  const { data: uomData } = useUnitsOfMeasure()

  const createContract = useCreateContract()
  const updateContract = useUpdateContract()

  // Filter locations for selected customer
  const selectedCustomer = customersData?.results?.find(
    (c) => String(c.id) === formData.customer
  )
  const customerLocations = locationsData?.results?.filter(
    (l) => selectedCustomer && l.party === selectedCustomer.party
  ) ?? []

  useEffect(() => {
    if (open) {
      if (contract) {
        setFormData({
          customer: String(contract.customer),
          blanket_po: contract.blanket_po || '',
          issue_date: contract.issue_date,
          start_date: contract.start_date || '',
          end_date: contract.end_date || '',
          ship_to: contract.ship_to ? String(contract.ship_to) : '',
          notes: contract.notes || '',
        })
        // Load existing lines if editing
        if (contract.lines) {
          setLines(
            contract.lines.map((l) => ({
              id: String(l.id),
              item: String(l.item),
              blanket_qty: String(l.blanket_qty),
              uom: String(l.uom),
              unit_price: l.unit_price || '',
            }))
          )
        } else {
          setLines([])
        }
      } else {
        setFormData({
          customer: '',
          blanket_po: '',
          issue_date: new Date().toISOString().split('T')[0],
          start_date: '',
          end_date: '',
          ship_to: '',
          notes: '',
        })
        setLines([])
      }
    }
  }, [open, contract])

  const handleAddLine = () => {
    setLines([
      ...lines,
      {
        id: `new-${Date.now()}`,
        item: '',
        blanket_qty: '',
        uom: '',
        unit_price: '',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Convert lines to API format
    const linesPayload: ContractLineInput[] = lines
      .filter((l) => l.item && l.blanket_qty && l.uom)
      .map((l) => ({
        item: Number(l.item),
        blanket_qty: Number(l.blanket_qty),
        uom: Number(l.uom),
        unit_price: l.unit_price || null,
      }))

    try {
      let result: Contract
      if (isEditing) {
        result = await updateContract.mutateAsync({
          id: contract.id,
          blanket_po: formData.blanket_po,
          issue_date: formData.issue_date,
          start_date: formData.start_date || null,
          end_date: formData.end_date || null,
          ship_to: formData.ship_to ? Number(formData.ship_to) : null,
          notes: formData.notes,
          lines: linesPayload,
        })
      } else {
        result = await createContract.mutateAsync({
          customer: Number(formData.customer),
          blanket_po: formData.blanket_po,
          issue_date: formData.issue_date,
          start_date: formData.start_date || null,
          end_date: formData.end_date || null,
          ship_to: formData.ship_to ? Number(formData.ship_to) : null,
          notes: formData.notes,
          lines: linesPayload,
        })
      }
      onOpenChange(false)
      onSuccess?.(result)
    } catch (error) {
      console.error(`Failed to ${isEditing ? 'update' : 'create'} contract:`, error)
    }
  }

  const isPending = createContract.isPending || updateContract.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Contract' : 'New Contract'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Customer Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer">Customer *</Label>
                <Select
                  value={formData.customer}
                  onValueChange={(value) => setFormData({ ...formData, customer: value, ship_to: '' })}
                  disabled={isEditing}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customersData?.results?.map((customer) => (
                      <SelectItem key={customer.id} value={String(customer.id)}>
                        {customer.party_code} - {customer.party_display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="blanket_po">Customer Blanket PO #</Label>
                <Input
                  id="blanket_po"
                  value={formData.blanket_po}
                  onChange={(e) => setFormData({ ...formData, blanket_po: e.target.value })}
                  placeholder="Customer's PO reference"
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="issue_date">Issue Date *</Label>
                <Input
                  id="issue_date"
                  type="date"
                  value={formData.issue_date}
                  onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
            </div>

            {/* Ship To */}
            <div className="space-y-2">
              <Label htmlFor="ship_to">Default Ship To</Label>
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
                      {location.name} - {location.city}, {location.state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Contract terms, notes..."
                rows={2}
              />
            </div>

            {/* Lines Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Contract Lines</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleAddLine}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Line
                </Button>
              </div>

              {lines.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground border rounded-md">
                  No lines added yet. Click "Add Line" to add items to this contract.
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Header */}
                  <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 text-sm font-medium text-muted-foreground px-1">
                    <span>Item</span>
                    <span>Qty</span>
                    <span>UOM</span>
                    <span>Unit Price</span>
                    <span></span>
                  </div>
                  {/* Lines */}
                  {lines.map((line) => (
                    <div
                      key={line.id}
                      className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-center"
                    >
                      <Select
                        value={line.item}
                        onValueChange={(value) => handleLineChange(line.id, 'item', value)}
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
                        type="number"
                        placeholder="Qty"
                        value={line.blanket_qty}
                        onChange={(e) => handleLineChange(line.id, 'blanket_qty', e.target.value)}
                      />
                      <Select
                        value={line.uom}
                        onValueChange={(value) => handleLineChange(line.id, 'uom', value)}
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
                        value={line.unit_price}
                        onChange={(e) => handleLineChange(line.id, 'unit_price', e.target.value)}
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
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !formData.customer}>
              {isPending
                ? isEditing
                  ? 'Updating...'
                  : 'Creating...'
                : isEditing
                ? 'Update Contract'
                : 'Create Contract'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
