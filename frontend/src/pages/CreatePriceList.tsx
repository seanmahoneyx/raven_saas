import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useCreatePriceList } from '@/api/priceLists'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { PageHeader } from '@/components/page'
import { SearchableCombobox } from '@/components/common/SearchableCombobox'

interface LineFormData {
  id: string
  min_quantity: string
  unit_price: string
}

export default function CreatePriceList() {
  usePageTitle('Create Price List')
  const navigate = useNavigate()
  const createPriceList = useCreatePriceList()

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
    setLines([...lines, { id: `new-${Date.now()}`, min_quantity: '', unit_price: '' }])
  }

  const handleRemoveLine = (id: string) => {
    setLines(lines.filter((l) => l.id !== id))
  }

  const handleLineChange = (id: string, field: keyof LineFormData, value: string) => {
    setLines(lines.map((l) => l.id !== id ? l : { ...l, [field]: value }))
  }

  const update = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const linesPayload = lines
      .filter((l) => l.min_quantity && l.unit_price)
      .map((l) => ({ min_quantity: Number(l.min_quantity), unit_price: l.unit_price }))

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
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-7 pb-16">
        <PageHeader
          title="Create New Price List"
          description="Define quantity-based pricing for a customer and item"
          breadcrumb={[{ label: 'Price Lists', to: '/price-lists' }, { label: 'New' }]}
        />

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Price List Details */}
          <div className="rounded-[14px] border animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)', position: 'relative', zIndex: 20 }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Price List Details</span>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Customer *</Label>
                  <SearchableCombobox
                    entityType="customer"
                    value={formData.customer ? Number(formData.customer) : null}
                    onChange={(id) => update('customer', id ? String(id) : '')}
                    placeholder="Select customer..."
                    allowClear
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Item *</Label>
                  <SearchableCombobox
                    entityType="item"
                    value={formData.item ? Number(formData.item) : null}
                    onChange={(id) => update('item', id ? String(id) : '')}
                    placeholder="Select item..."
                    allowClear
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Date Range & Status */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Date Range &amp; Status</span>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Begin Date *</Label>
                  <Input type="date" value={formData.begin_date} onChange={(e) => update('begin_date', e.target.value)} required style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>End Date</Label>
                  <Input type="date" value={formData.end_date} onChange={(e) => update('end_date', e.target.value)} style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                  <p className="text-[11.5px]" style={{ color: 'var(--so-text-tertiary)' }}>Leave blank for an open-ended price list.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input id="is_active" type="checkbox" checked={formData.is_active} onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))} className="h-4 w-4 rounded" style={{ borderColor: 'var(--so-border)' }} />
                <Label htmlFor="is_active" className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Active</Label>
                <p className="text-[11.5px]" style={{ color: 'var(--so-text-tertiary)' }}>Inactive price lists will not be applied during order entry.</p>
              </div>
            </div>
          </div>

          {/* Price Break Lines */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Price Break Lines</span>
              <button type="button" className={outlineBtnClass} style={outlineBtnStyle} onClick={handleAddLine}>
                <Plus className="h-3.5 w-3.5" /> Add Break
              </button>
            </div>
            <div className="px-6 py-5">
              {lines.length === 0 ? (
                <div className="text-center py-6 text-[13px] rounded-md" style={{ color: 'var(--so-text-tertiary)', border: '1px solid var(--so-border-light)' }}>
                  No price breaks added yet. Click &quot;Add Break&quot; to define quantity-based pricing.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-[11px] font-semibold uppercase tracking-widest px-1" style={{ color: 'var(--so-text-tertiary)' }}>
                    <span>Min Quantity</span><span>Unit Price</span><span></span>
                  </div>
                  {lines.map((line) => (
                    <div key={line.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center rounded-lg p-3" style={{ background: 'var(--so-bg)' }}>
                      <Input type="number" placeholder="Minimum quantity" value={line.min_quantity} onChange={(e) => handleLineChange(line.id, 'min_quantity', e.target.value)} style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                      <Input type="number" step="0.01" placeholder="Unit price" value={line.unit_price} onChange={(e) => handleLineChange(line.id, 'unit_price', e.target.value)} style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
                      <button type="button" onClick={() => handleRemoveLine(line.id)} className="inline-flex items-center justify-center h-8 w-8 rounded-md cursor-pointer" style={{ color: 'var(--so-danger-text)' }}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Notes</span>
            </div>
            <div className="px-6 py-5">
              <Textarea value={formData.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Pricing notes, special conditions..." rows={3} style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }} />
            </div>
          </div>

          {error && (
            <div className="text-[13px] rounded-md px-3 py-2.5" style={{ background: 'var(--so-danger-bg)', color: 'var(--so-danger-text)' }}>{error}</div>
          )}

          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid var(--so-border-light)' }}>
            <button type="button" className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate(-1)}>Cancel</button>
            <button type="submit" className={`${primaryBtnClass} ${isPending || !formData.customer || !formData.item ? 'opacity-50 pointer-events-none' : ''}`} style={primaryBtnStyle} disabled={isPending || !formData.customer || !formData.item}>
              {isPending ? 'Creating...' : 'Create Price List'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
