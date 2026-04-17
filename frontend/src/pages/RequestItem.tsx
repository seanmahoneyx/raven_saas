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
import { ArrowLeft } from 'lucide-react'
import { useParties } from '@/api/parties'
import { useCreateItem, useUnitsOfMeasure } from '@/api/items'
import type { Item } from '@/types/api'
import { DIVISIONS, BOX_TYPES, PKG_SUB_TYPES } from '@/constants/items'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'

export default function RequestItem() {
  usePageTitle('Request New Item')
  const navigate = useNavigate()
  const createMutation = useCreateItem()
  const { data: partiesData } = useParties({ party_type: 'CUSTOMER' })
  const customers = partiesData?.results ?? []
  const { data: uomData } = useUnitsOfMeasure()
  const uoms = uomData?.results ?? []

  const [error, setError] = useState('')
  const [customer, setCustomer] = useState('')
  const [name, setName] = useState('')
  const [division, setDivision] = useState('')
  const [baseUom, setBaseUom] = useState('')
  const [boxStyle, setBoxStyle] = useState('')
  const [pkgSubType, setPkgSubType] = useState('')
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [notes, setNotes] = useState('')

  const showSpecs = division === 'corrugated' || division === 'packaging'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Item name is required')
      return
    }

    try {
      const dimStr = length && width ? `${length} x ${width} x ${height}` : ''
      const sell_desc = [notes, dimStr].filter(Boolean).join('\n') || undefined
      await createMutation.mutateAsync({
        sku: '',
        name: name.trim(),
        division: division as Item['division'],
        base_uom: baseUom ? Number(baseUom) : undefined,
        customer: customer ? Number(customer) : null,
        item_type: 'inventory',
        is_active: true,
        lifecycle_status: 'draft',
        sell_desc,
      } as Partial<Item>)
      navigate('/items')
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object') {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to submit item request'))
      }
    }
  }

  const inputStyle: React.CSSProperties = { borderColor: 'var(--so-border)', background: 'var(--so-surface)' }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate('/items')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Items
          </button>
        </div>

        {/* Title row */}
        <div className="mb-7 animate-in delay-1">
          <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Request New Item</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
            Submit a new product request for the operations team to set up
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Product Information */}
          <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Product Information</span>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="customer" style={{ color: 'var(--so-text-secondary)' }}>Customer</Label>
                <Select value={customer} onValueChange={setCustomer}>
                  <SelectTrigger style={inputStyle}>
                    <SelectValue placeholder="Select customer (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.display_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name" style={{ color: 'var(--so-text-secondary)' }}>
                  Item Name / Ident <span style={{ color: 'var(--so-danger-text)' }}>*</span>
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Product name or description"
                  required
                  style={inputStyle}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="division" style={{ color: 'var(--so-text-secondary)' }}>Division</Label>
                  <Select value={division} onValueChange={setDivision}>
                    <SelectTrigger style={inputStyle}>
                      <SelectValue placeholder="Select division" />
                    </SelectTrigger>
                    <SelectContent>
                      {DIVISIONS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="baseUom" style={{ color: 'var(--so-text-secondary)' }}>Unit of Measure</Label>
                  <Select value={baseUom} onValueChange={setBaseUom}>
                    <SelectTrigger style={inputStyle}>
                      <SelectValue placeholder="Select UoM" />
                    </SelectTrigger>
                    <SelectContent>
                      {uoms.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.code} — {u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Basic Specifications — corrugated or packaging only */}
          {showSpecs && (
            <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
              <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                <span className="text-sm font-semibold">Basic Specifications</span>
              </div>
              <div className="px-6 py-5 space-y-4">
                {division === 'corrugated' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="boxStyle" style={{ color: 'var(--so-text-secondary)' }}>Box Style</Label>
                    <Select value={boxStyle} onValueChange={setBoxStyle}>
                      <SelectTrigger style={inputStyle}>
                        <SelectValue placeholder="Select box style" />
                      </SelectTrigger>
                      <SelectContent>
                        {BOX_TYPES.map((b) => (
                          <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {division === 'packaging' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="pkgSubType" style={{ color: 'var(--so-text-secondary)' }}>Sub Type</Label>
                    <Select value={pkgSubType} onValueChange={setPkgSubType}>
                      <SelectTrigger style={inputStyle}>
                        <SelectValue placeholder="Select sub type" />
                      </SelectTrigger>
                      <SelectContent>
                        {PKG_SUB_TYPES.map((p) => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label style={{ color: 'var(--so-text-secondary)' }} className="mb-2 block">
                    Dimensions (L × W × H, inches)
                  </Label>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="length" className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>Length</Label>
                      <Input
                        id="length"
                        type="text"
                        value={length}
                        onChange={(e) => setLength(e.target.value)}
                        placeholder="0"
                        style={inputStyle}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="width" className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>Width</Label>
                      <Input
                        id="width"
                        type="text"
                        value={width}
                        onChange={(e) => setWidth(e.target.value)}
                        placeholder="0"
                        style={inputStyle}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="height" className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>Height</Label>
                      <Input
                        id="height"
                        type="text"
                        value={height}
                        onChange={(e) => setHeight(e.target.value)}
                        placeholder="0"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Notes</span>
            </div>
            <div className="px-6 py-5">
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional requirements, context, or specifications..."
                rows={3}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              className="rounded-[10px] px-4 py-3 text-[13px] mb-4"
              style={{ background: 'var(--so-danger-bg)', border: '1px solid var(--so-danger-text)', color: 'var(--so-danger-text)' }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={() => navigate(-1)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={primaryBtnClass + (createMutation.isPending ? ' opacity-50 pointer-events-none' : '')}
              style={primaryBtnStyle}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
