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
import { useCustomers, useLocations } from '@/api/parties'
import { useItems, useUnitsOfMeasure } from '@/api/items'
import { useCreateContract } from '@/api/contracts'

interface LineFormData {
  id: string
  item: string
  blanket_qty: string
  uom: string
  unit_price: string
}

export default function CreateContract() {
  usePageTitle('Create Contract')
  const navigate = useNavigate()
  const createContract = useCreateContract()

  const { data: customersData } = useCustomers()
  const { data: locationsData } = useLocations()
  const { data: itemsData } = useItems()
  const { data: uomData } = useUnitsOfMeasure()

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

  const [lines, setLines] = useState<LineFormData[]>([])

  // Filter locations for selected customer
  const selectedCustomer = customersData?.results?.find(
    (c) => String(c.id) === formData.customer
  )
  const customerLocations =
    locationsData?.results?.filter(
      (l) => selectedCustomer && l.party === selectedCustomer.party
    ) ?? []

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

  const update = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const linesPayload = lines
      .filter((l) => l.item && l.blanket_qty && l.uom)
      .map((l) => ({
        item: Number(l.item),
        blanket_qty: Number(l.blanket_qty),
        uom: Number(l.uom),
        unit_price: l.unit_price || null,
      }))

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
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create New Contract</h1>
          <p className="text-sm text-muted-foreground">
            Set up a blanket contract with a customer
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* ── Contract Details ── */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Contract Details</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer">Customer *</Label>
              <Select
                value={formData.customer}
                onValueChange={(v) => {
                  setFormData((prev) => ({ ...prev, customer: v, ship_to: '' }))
                }}
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
                onChange={(e) => update('blanket_po', e.target.value)}
                placeholder="Customer's PO reference"
              />
            </div>
          </div>
        </section>

        {/* ── Dates ── */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Dates</h2>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="issue_date">Issue Date *</Label>
              <Input
                id="issue_date"
                type="date"
                value={formData.issue_date}
                onChange={(e) => update('issue_date', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                onChange={(e) => update('start_date', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">End Date</Label>
              <Input
                id="end_date"
                type="date"
                value={formData.end_date}
                onChange={(e) => update('end_date', e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* ── Shipping ── */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Shipping</h2>

          <div className="space-y-2">
            <Label htmlFor="ship_to">Default Ship To</Label>
            <Select
              value={formData.ship_to}
              onValueChange={(v) => update('ship_to', v)}
              disabled={!formData.customer}
            >
              <SelectTrigger>
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
        </section>

        {/* ── Notes ── */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Notes</h2>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Contract terms, notes..."
            rows={3}
          />
        </section>

        {/* ── Contract Lines ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold border-b pb-2 flex-1">Contract Lines</h2>
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
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-center bg-muted/50 rounded-lg p-3"
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
                    type="number"
                    placeholder="Qty"
                    value={line.blanket_qty}
                    onChange={(e) => handleLineChange(line.id, 'blanket_qty', e.target.value)}
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
          <Button type="submit" disabled={isPending || !formData.customer}>
            {isPending ? 'Creating...' : 'Create Contract'}
          </Button>
        </div>
      </form>
    </div>
  )
}
