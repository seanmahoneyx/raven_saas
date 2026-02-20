import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
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

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

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

  const warehouseLocations =
    locationsData?.results?.filter((l) => l.location_type === 'WAREHOUSE') ?? []

  const handleAddLine = () => {
    setLines([
      ...lines,
      { id: `new-${Date.now()}`, item: '', description: '', quantity: '', uom: '', target_price: '' },
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
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">
        {/* Header */}
        <div className="flex items-center gap-4 mb-7 animate-in">
          <button className={outlineBtnClass + ' !px-2'} style={outlineBtnStyle} onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Create New RFQ</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Request for Quote from a vendor</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* RFQ Details */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">RFQ Details</span>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Vendor *</Label>
                  <Select value={formData.vendor} onValueChange={(v) => update('vendor', v)}>
                    <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}><SelectValue placeholder="Select vendor..." /></SelectTrigger>
                    <SelectContent>
                      {vendorsData?.results?.map((vendor) => (
                        <SelectItem key={vendor.id} value={String(vendor.id)}>{vendor.party_code} - {vendor.party_display_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>RFQ Number</Label>
                  <Input value={formData.rfq_number} onChange={(e) => update('rfq_number', e.target.value)} placeholder="Auto-generated if blank" style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Dates & Shipping */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Dates &amp; Shipping</span>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>RFQ Date *</Label>
                  <Input type="date" value={formData.date} onChange={(e) => update('date', e.target.value)} required style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Expected Date</Label>
                  <Input type="date" value={formData.expected_date} onChange={(e) => update('expected_date', e.target.value)} style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Ship To (Warehouse)</Label>
                <Select value={formData.ship_to} onValueChange={(v) => update('ship_to', v)}>
                  <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}><SelectValue placeholder="Select warehouse location..." /></SelectTrigger>
                  <SelectContent>
                    {warehouseLocations.map((location) => (
                      <SelectItem key={location.id} value={String(location.id)}>{location.name} - {location.city}, {location.state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Notes</Label>
                <Textarea value={formData.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Requirements, specifications, delivery instructions..." rows={3} style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
              </div>
            </div>
          </div>

          {/* RFQ Lines */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">RFQ Lines</span>
              <button type="button" className={outlineBtnClass} style={outlineBtnStyle} onClick={handleAddLine}>
                <Plus className="h-3.5 w-3.5" /> Add Line
              </button>
            </div>
            <div className="px-6 py-5">
              {lines.length === 0 ? (
                <div className="text-center py-6 text-[13px] rounded-md" style={{ color: 'var(--so-text-tertiary)', border: '1px solid var(--so-border-light)' }}>
                  No lines added yet. Click &quot;Add Line&quot; to add items to this RFQ.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] gap-2 text-[11px] font-semibold uppercase tracking-widest px-1" style={{ color: 'var(--so-text-tertiary)' }}>
                    <span>Item</span><span>Description</span><span>Qty</span><span>UOM</span><span>Target Price</span><span></span>
                  </div>
                  {lines.map((line) => (
                    <div key={line.id} className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] gap-2 items-center rounded-lg p-3" style={{ background: 'var(--so-bg)' }}>
                      <Select value={line.item} onValueChange={(v) => handleLineChange(line.id, 'item', v)}>
                        <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}><SelectValue placeholder="Select item..." /></SelectTrigger>
                        <SelectContent>{itemsData?.results?.map((item) => (<SelectItem key={item.id} value={String(item.id)}>{item.sku} - {item.name}</SelectItem>))}</SelectContent>
                      </Select>
                      <Input placeholder="Line description" value={line.description} onChange={(e) => handleLineChange(line.id, 'description', e.target.value)} style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                      <Input type="number" placeholder="Qty" value={line.quantity} onChange={(e) => handleLineChange(line.id, 'quantity', e.target.value)} style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                      <Select value={line.uom} onValueChange={(v) => handleLineChange(line.id, 'uom', v)}>
                        <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}><SelectValue placeholder="UOM" /></SelectTrigger>
                        <SelectContent>{uomData?.results?.map((uom) => (<SelectItem key={uom.id} value={String(uom.id)}>{uom.code}</SelectItem>))}</SelectContent>
                      </Select>
                      <Input type="number" step="0.01" placeholder="Price" value={line.target_price} onChange={(e) => handleLineChange(line.id, 'target_price', e.target.value)} style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                      <button type="button" onClick={() => handleRemoveLine(line.id)} className="inline-flex items-center justify-center h-8 w-8 rounded-md cursor-pointer" style={{ color: 'var(--so-danger-text)' }}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="text-[13px] rounded-md px-3 py-2.5" style={{ background: 'var(--so-danger-bg)', color: 'var(--so-danger-text)' }}>{error}</div>
          )}

          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid var(--so-border-light)' }}>
            <button type="button" className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate(-1)}>Cancel</button>
            <button type="submit" className={`${primaryBtnClass} ${isPending || !formData.vendor ? 'opacity-50 pointer-events-none' : ''}`} style={primaryBtnStyle} disabled={isPending || !formData.vendor}>
              {isPending ? 'Creating...' : 'Create RFQ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
