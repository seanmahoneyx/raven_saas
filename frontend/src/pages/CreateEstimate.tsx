import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useCreateEstimate } from '@/api/estimates'
import { useCustomers, useLocations } from '@/api/parties'
import { useItems, useUnitsOfMeasure } from '@/api/items'
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

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }
const dangerBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const dangerBtnStyle: React.CSSProperties = { background: '#dc2626', border: '1px solid #dc2626' }

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
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Estimates
          </button>
          <span style={{ color: 'var(--so-border)' }} className="text-[13px]">/</span>
          <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>New</span>
        </div>

        {/* Header */}
        <div className="mb-7 animate-in delay-1">
          <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Create New Estimate</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
            Create a new estimate for a customer
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Estimate Details */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Estimate Details</span>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="estimate_number" style={{ color: 'var(--so-text-secondary)' }}>Estimate Number</Label>
                  <Input
                    id="estimate_number"
                    value={formData.estimate_number}
                    onChange={(e) => update('estimate_number', e.target.value)}
                    placeholder="Auto-generated"
                    className="font-mono"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="status" style={{ color: 'var(--so-text-secondary)' }}>Status</Label>
                  <Select value={formData.status} onValueChange={(v) => update('status', v)}>
                    <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
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
                <div className="space-y-1.5">
                  <Label htmlFor="tax_rate" style={{ color: 'var(--so-text-secondary)' }}>Tax Rate (%)</Label>
                  <Input
                    id="tax_rate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.tax_rate}
                    onChange={(e) => update('tax_rate', e.target.value)}
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Customer */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Customer</span>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="customer" style={{ color: 'var(--so-text-secondary)' }}>Customer *</Label>
                  <Select
                    value={formData.customer}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, customer: v, ship_to: '', bill_to: '' }))}
                  >
                    <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
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
                <div className="space-y-1.5">
                  <Label htmlFor="customer_po" style={{ color: 'var(--so-text-secondary)' }}>Customer PO</Label>
                  <Input
                    id="customer_po"
                    value={formData.customer_po}
                    onChange={(e) => update('customer_po', e.target.value)}
                    placeholder="Customer's PO reference"
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Dates</span>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="date" style={{ color: 'var(--so-text-secondary)' }}>Estimate Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => update('date', e.target.value)}
                    required
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expiration_date" style={{ color: 'var(--so-text-secondary)' }}>Expiration Date</Label>
                  <Input
                    id="expiration_date"
                    type="date"
                    value={formData.expiration_date}
                    onChange={(e) => update('expiration_date', e.target.value)}
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Shipping & Billing */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Shipping &amp; Billing</span>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ship_to" style={{ color: 'var(--so-text-secondary)' }}>Ship To</Label>
                  <Select
                    value={formData.ship_to}
                    onValueChange={(v) => update('ship_to', v)}
                    disabled={!formData.customer}
                  >
                    <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
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
                <div className="space-y-1.5">
                  <Label htmlFor="bill_to" style={{ color: 'var(--so-text-secondary)' }}>Bill To</Label>
                  <Select
                    value={formData.bill_to}
                    onValueChange={(v) => update('bill_to', v)}
                    disabled={!formData.customer}
                  >
                    <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
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
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Notes</span>
            </div>
            <div className="px-6 py-5">
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="Estimate notes..."
                rows={3}
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>
          </div>

          {/* Line Items */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Line Items</span>
              <button type="button" className={outlineBtnClass} style={{ ...outlineBtnStyle, padding: '4px 10px', fontSize: '12px' }} onClick={handleAddLine}>
                <Plus className="h-3.5 w-3.5" />
                Add Line
              </button>
            </div>
            <div className="px-6 py-5">
              {lines.length === 0 ? (
                <p className="text-[13px] text-center py-4" style={{ color: 'var(--so-text-tertiary)' }}>
                  No lines added. Click "Add Line" to add items to this estimate.
                </p>
              ) : (
                <div className="space-y-2">
                  {lines.map((line, index) => (
                    <div
                      key={index}
                      className="rounded-[10px] p-3"
                      style={{ background: 'var(--so-bg)', border: '1px solid var(--so-border-light)' }}
                    >
                      <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-4 space-y-1">
                          <Label className="text-xs" style={{ color: 'var(--so-text-secondary)' }}>Item</Label>
                          <Select
                            value={line.item}
                            onValueChange={(v) => handleLineChange(index, 'item', v)}
                          >
                            <SelectTrigger className="h-9" style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
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
                          <Label className="text-xs" style={{ color: 'var(--so-text-secondary)' }}>Qty</Label>
                          <Input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(e) => handleLineChange(index, 'quantity', e.target.value)}
                            className="h-9"
                            style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs" style={{ color: 'var(--so-text-secondary)' }}>UOM</Label>
                          <Select
                            value={line.uom}
                            onValueChange={(v) => handleLineChange(index, 'uom', v)}
                          >
                            <SelectTrigger className="h-9" style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
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
                          <Label className="text-xs" style={{ color: 'var(--so-text-secondary)' }}>Price</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.unit_price}
                            onChange={(e) => handleLineChange(index, 'unit_price', e.target.value)}
                            className="h-9"
                            style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                          />
                        </div>
                        <div className="col-span-2 flex justify-end">
                          <button
                            type="button"
                            className={dangerBtnClass}
                            style={{ ...dangerBtnStyle, padding: '6px 10px' }}
                            onClick={() => handleRemoveLine(index)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {line.description && (
                        <p className="text-xs mt-1.5 pl-1" style={{ color: 'var(--so-text-tertiary)' }}>{line.description}</p>
                      )}
                    </div>
                  ))}

                  <div className="flex justify-end pr-1 pt-3" style={{ borderTop: '1px solid var(--so-border-light)' }}>
                    <span className="text-[13px] mr-4" style={{ color: 'var(--so-text-tertiary)' }}>Subtotal:</span>
                    <span className="font-mono font-semibold text-sm" style={{ color: 'var(--so-text-primary)' }}>${subtotal.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              className="text-[13px] rounded-[10px] p-3"
              style={{ color: 'var(--so-danger-text)', background: 'var(--so-danger-bg)', border: '1px solid var(--so-danger-border, transparent)' }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2" style={{ borderTop: '1px solid var(--so-border-light)' }}>
            <button type="button" className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate(-1)}>
              Cancel
            </button>
            <button
              type="submit"
              className={`${primaryBtnClass}${isPending || !formData.customer ? ' opacity-50 pointer-events-none' : ''}`}
              style={primaryBtnStyle}
              disabled={isPending || !formData.customer}
            >
              {isPending ? 'Creating...' : 'Create Estimate'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
