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
import { useCustomers } from '@/api/parties'
import { useItems } from '@/api/items'
import { useCreatePriceList } from '@/api/priceLists'

interface LineFormData {
  id: string
  min_quantity: string
  unit_price: string
}

export default function CreatePriceList() {
  usePageTitle('Create Price List')
  const navigate = useNavigate()
  const createPriceList = useCreatePriceList()

  const { data: customersData } = useCustomers()
  const { data: itemsData } = useItems()

  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    customer: '',
    item: '',
    begin_date: new Date().toISOString().split('T')[0],
    end_date: '',
    is_active: true,
    notes: '',
  })

  const [lines, setLines] = useState<LineFormData[]>([])

  const handleAddLine = () => {
    setLines([
      ...lines,
      {
        id: `new-${Date.now()}`,
        min_quantity: '',
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
        return { ...l, [field]: value }
      })
    )
  }

  const update = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const linesPayload = lines
      .filter((l) => l.min_quantity && l.unit_price)
      .map((l) => ({
        min_quantity: Number(l.min_quantity),
        unit_price: l.unit_price,
      }))

    try {
      await createPriceList.mutateAsync({
        customer: Number(formData.customer),
        item: Number(formData.item),
        begin_date: formData.begin_date,
        end_date: formData.end_date || null,
        is_active: formData.is_active,
        notes: formData.notes,
        lines: linesPayload,
      })
      navigate('/customers')
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object') {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to create price list'))
      }
    }
  }

  const isPending = createPriceList.isPending

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create New Price List</h1>
          <p className="text-sm text-muted-foreground">
            Define quantity-based pricing for a customer and item
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* ── Price List Details ── */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Price List Details</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer">Customer *</Label>
              <Select
                value={formData.customer}
                onValueChange={(v) => update('customer', v)}
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
              <Label htmlFor="item">Item *</Label>
              <Select
                value={formData.item}
                onValueChange={(v) => update('item', v)}
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
            </div>
          </div>
        </section>

        {/* ── Date Range ── */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Date Range</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="begin_date">Begin Date *</Label>
              <Input
                id="begin_date"
                type="date"
                value={formData.begin_date}
                onChange={(e) => update('begin_date', e.target.value)}
                required
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
              <p className="text-xs text-muted-foreground">
                Leave blank for an open-ended price list.
              </p>
            </div>
          </div>
        </section>

        {/* ── Status ── */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Status</h2>

          <div className="flex items-center gap-3">
            <input
              id="is_active"
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="is_active">Active</Label>
            <p className="text-xs text-muted-foreground">
              Inactive price lists will not be applied during order entry.
            </p>
          </div>
        </section>

        {/* ── Notes ── */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Notes</h2>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Pricing notes, special conditions..."
            rows={3}
          />
        </section>

        {/* ── Price Break Lines ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold border-b pb-2 flex-1">Price Break Lines</h2>
            <Button type="button" variant="outline" size="sm" onClick={handleAddLine}>
              <Plus className="h-4 w-4 mr-1" />
              Add Break
            </Button>
          </div>

          {lines.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground border rounded-md">
              No price breaks added yet. Click "Add Break" to define quantity-based pricing.
            </div>
          ) : (
            <div className="space-y-2">
              {/* Header */}
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-sm font-medium text-muted-foreground px-1">
                <span>Min Quantity</span>
                <span>Unit Price</span>
                <span></span>
              </div>
              {/* Lines */}
              {lines.map((line) => (
                <div
                  key={line.id}
                  className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center bg-muted/50 rounded-lg p-3"
                >
                  <Input
                    type="number"
                    placeholder="Minimum quantity"
                    value={line.min_quantity}
                    onChange={(e) => handleLineChange(line.id, 'min_quantity', e.target.value)}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Unit price"
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
          <Button type="submit" disabled={isPending || !formData.customer || !formData.item}>
            {isPending ? 'Creating...' : 'Create Price List'}
          </Button>
        </div>
      </form>
    </div>
  )
}
