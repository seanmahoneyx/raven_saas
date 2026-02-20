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
import { useCustomers, useLocations } from '@/api/parties'
import { useItems, useUnitsOfMeasure } from '@/api/items'
import { useCreateContract } from '@/api/contracts'

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

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
      { id: `new-${Date.now()}`, item: '', blanket_qty: '', uom: '', unit_price: '' },
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
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">
        {/* Header */}
        <div className="flex items-center gap-4 mb-7 animate-in">
          <button className={outlineBtnClass + ' !px-2'} style={outlineBtnStyle} onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Create New Contract</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
              Set up a blanket contract with a customer
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Contract Details */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Contract Details</span>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Customer *</Label>
                  <Select value={formData.customer} onValueChange={(v) => setFormData((prev) => ({ ...prev, customer: v, ship_to: '' }))}>
                    <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
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
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Customer Blanket PO #</Label>
                  <Input value={formData.blanket_po} onChange={(e) => update('blanket_po', e.target.value)} placeholder="Customer's PO reference" style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
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
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Issue Date *</Label>
                  <Input type="date" value={formData.issue_date} onChange={(e) => update('issue_date', e.target.value)} required style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Start Date</Label>
                  <Input type="date" value={formData.start_date} onChange={(e) => update('start_date', e.target.value)} style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>End Date</Label>
                  <Input type="date" value={formData.end_date} onChange={(e) => update('end_date', e.target.value)} style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Shipping & Notes */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Shipping &amp; Notes</span>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Default Ship To</Label>
                <Select value={formData.ship_to} onValueChange={(v) => update('ship_to', v)} disabled={!formData.customer}>
                  <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
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
              <div className="space-y-2">
                <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Notes</Label>
                <Textarea value={formData.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Contract terms, notes..." rows={3} style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
              </div>
            </div>
          </div>

          {/* Contract Lines */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Contract Lines</span>
              <button type="button" className={outlineBtnClass} style={outlineBtnStyle} onClick={handleAddLine}>
                <Plus className="h-3.5 w-3.5" /> Add Line
              </button>
            </div>
            <div className="px-6 py-5">
              {lines.length === 0 ? (
                <div className="text-center py-6 text-[13px] rounded-md" style={{ color: 'var(--so-text-tertiary)', border: '1px solid var(--so-border-light)' }}>
                  No lines added yet. Click &quot;Add Line&quot; to add items to this contract.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 text-[11px] font-semibold uppercase tracking-widest px-1" style={{ color: 'var(--so-text-tertiary)' }}>
                    <span>Item</span>
                    <span>Qty</span>
                    <span>UOM</span>
                    <span>Unit Price</span>
                    <span></span>
                  </div>
                  {lines.map((line) => (
                    <div key={line.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-center rounded-lg p-3" style={{ background: 'var(--so-bg)' }}>
                      <Select value={line.item} onValueChange={(v) => handleLineChange(line.id, 'item', v)}>
                        <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
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
                      <Input type="number" placeholder="Qty" value={line.blanket_qty} onChange={(e) => handleLineChange(line.id, 'blanket_qty', e.target.value)} style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                      <Select value={line.uom} onValueChange={(v) => handleLineChange(line.id, 'uom', v)}>
                        <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
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
                      <Input type="number" step="0.01" placeholder="Price" value={line.unit_price} onChange={(e) => handleLineChange(line.id, 'unit_price', e.target.value)} style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                      <button type="button" onClick={() => handleRemoveLine(line.id)} className="inline-flex items-center justify-center h-8 w-8 rounded-md cursor-pointer transition-colors" style={{ color: 'var(--so-danger-text)' }}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="text-[13px] rounded-md px-3 py-2.5" style={{ background: 'var(--so-danger-bg)', color: 'var(--so-danger-text)' }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid var(--so-border-light)' }}>
            <button type="button" className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate(-1)}>Cancel</button>
            <button type="submit" className={`${primaryBtnClass} ${isPending || !formData.customer ? 'opacity-50 pointer-events-none' : ''}`} style={primaryBtnStyle} disabled={isPending || !formData.customer}>
              {isPending ? 'Creating...' : 'Create Contract'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
