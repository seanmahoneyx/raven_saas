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
import { useCreateDesignRequest } from '@/api/design'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'

const STYLE_OPTIONS = ['RSC', 'DC', 'HSC', 'FOL', 'TELE', 'Other']

export default function CreateDesignRequest() {
  usePageTitle('Submit Design Request')
  const navigate = useNavigate()
  const createMutation = useCreateDesignRequest()
  const { data: partiesData } = useParties({ party_type: 'CUSTOMER' })
  const customers = partiesData?.results ?? []

  const [error, setError] = useState('')
  const [ident, setIdent] = useState('')
  const [style, setStyle] = useState('')
  const [customer, setCustomer] = useState('')
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [depth, setDepth] = useState('')
  const [sampleQuantity, setSampleQuantity] = useState('')
  const [notes, setNotes] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const payload: Record<string, unknown> = {
      ident,
      style,
      status: 'pending',
      customer: customer ? Number(customer) : null,
      length: length || null,
      width: width || null,
      depth: depth || null,
      sample_quantity: sampleQuantity ? Number(sampleQuantity) : null,
      notes,
    }

    try {
      await createMutation.mutateAsync(payload as any)
      navigate('/design-requests')
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object') {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to create design request'))
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
            onClick={() => navigate('/design-requests')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Design Requests
          </button>
        </div>

        {/* Title row */}
        <div className="mb-7 animate-in delay-1">
          <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Submit Design Request</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
            Request a new packaging design from the design team
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Design Information */}
          <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Design Information</span>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ident" style={{ color: 'var(--so-text-secondary)' }}>Item Identifier</Label>
                  <Input
                    id="ident"
                    value={ident}
                    onChange={(e) => setIdent(e.target.value)}
                    placeholder="Item name or description"
                    style={inputStyle}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="style" style={{ color: 'var(--so-text-secondary)' }}>Box Style</Label>
                  <Select value={style} onValueChange={setStyle}>
                    <SelectTrigger style={inputStyle}>
                      <SelectValue placeholder="Select style" />
                    </SelectTrigger>
                    <SelectContent>
                      {STYLE_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="customer" style={{ color: 'var(--so-text-secondary)' }}>Customer</Label>
                  <Select value={customer} onValueChange={setCustomer}>
                    <SelectTrigger style={inputStyle}>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.display_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sampleQty" style={{ color: 'var(--so-text-secondary)' }}>Sample Quantity</Label>
                  <Input
                    id="sampleQty"
                    type="number"
                    value={sampleQuantity}
                    onChange={(e) => setSampleQuantity(e.target.value)}
                    placeholder="0"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Dimensions */}
          <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Dimensions (inches)</span>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="length" style={{ color: 'var(--so-text-secondary)' }}>Length</Label>
                  <Input
                    id="length"
                    type="number"
                    step="0.0001"
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                    placeholder="0.0000"
                    style={inputStyle}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="width" style={{ color: 'var(--so-text-secondary)' }}>Width</Label>
                  <Input
                    id="width"
                    type="number"
                    step="0.0001"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                    placeholder="0.0000"
                    style={inputStyle}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="depth" style={{ color: 'var(--so-text-secondary)' }}>Depth</Label>
                  <Input
                    id="depth"
                    type="number"
                    step="0.0001"
                    value={depth}
                    onChange={(e) => setDepth(e.target.value)}
                    placeholder="0.0000"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          </div>

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
                placeholder="Additional notes and requirements..."
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
