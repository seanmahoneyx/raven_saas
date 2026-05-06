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
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { ArrowLeft } from 'lucide-react'
import { useParties } from '@/api/parties'
import { useCreateDesignRequest } from '@/api/design'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { PageHeader } from '@/components/page'

const STYLE_OPTIONS = ['RSC', 'DC', 'HSC', 'FOL', 'TELE', 'Other']

// ── Fraction ↔ Decimal utilities (nearest 1/16") ──
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function decimalToFraction(value: number): string {
  if (value <= 0) return ''
  const whole = Math.floor(value)
  const remainder = value - whole
  const sixteenths = Math.round(remainder * 16)
  if (sixteenths === 0) return `${whole}`
  if (sixteenths === 16) return `${whole + 1}`
  const g = gcd(sixteenths, 16)
  const num = sixteenths / g
  const den = 16 / g
  return whole > 0 ? `${whole}+${num}/${den}` : `${num}/${den}`
}

function fractionToDecimal(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/^\d+\.?\d*$/.test(trimmed)) return parseFloat(trimmed)
  const match = trimmed.match(/^(\d+)?\+?(\d+)\/(\d+)$/)
  if (match) {
    const whole = match[1] ? parseInt(match[1]) : 0
    const num = parseInt(match[2])
    const den = parseInt(match[3])
    if (den === 0) return null
    return whole + num / den
  }
  return null
}

function roundTo16th(value: number): number {
  return Math.round(value * 16) / 16
}

const DIM_FIELDS = ['length', 'width', 'depth'] as const

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
  const [needsArd, setNeedsArd] = useState(false)
  const [needsDxf, setNeedsDxf] = useState(false)
  const [needsEps, setNeedsEps] = useState(false)
  const [needsPdf, setNeedsPdf] = useState(false)
  const [needsSamples, setNeedsSamples] = useState(false)
  const [needsPalletPattern, setNeedsPalletPattern] = useState(false)
  const [dimDisplay, setDimDisplay] = useState<'fraction' | 'decimal'>('fraction')

  const dimState: Record<string, { value: string; set: (v: string) => void }> = {
    length: { value: length, set: setLength },
    width: { value: width, set: setWidth },
    depth: { value: depth, set: setDepth },
  }

  const handleDimBlur = (field: typeof DIM_FIELDS[number]) => {
    const raw = dimState[field].value
    if (!raw) return
    const dec = fractionToDecimal(raw)
    if (dec !== null) {
      const rounded = roundTo16th(dec)
      dimState[field].set(dimDisplay === 'fraction' ? decimalToFraction(rounded) : String(rounded))
    }
  }

  const toggleDimDisplay = () => {
    const next = dimDisplay === 'fraction' ? 'decimal' : 'fraction'
    setDimDisplay(next)
    for (const field of DIM_FIELDS) {
      const raw = dimState[field].value
      if (!raw) continue
      const dec = fractionToDecimal(raw)
      if (dec === null) continue
      const rounded = roundTo16th(dec)
      dimState[field].set(next === 'fraction' ? decimalToFraction(rounded) : String(rounded))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const toDecimalValue = (raw: string) => {
      if (!raw) return null
      const dec = fractionToDecimal(raw)
      return dec !== null ? roundTo16th(dec) : null
    }

    const payload: Record<string, unknown> = {
      ident,
      style,
      status: 'pending',
      customer: customer ? Number(customer) : null,
      length: toDecimalValue(length),
      width: toDecimalValue(width),
      depth: toDecimalValue(depth),
      sample_quantity: sampleQuantity ? parseInt(sampleQuantity, 10) : null,
      notes,
      has_ard: needsArd,
      has_dxf: needsDxf,
      has_eps: needsEps,
      has_pdf: needsPdf,
      has_samples: needsSamples,
      pallet_configuration: needsPalletPattern,
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
      <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-7 pb-16">

        <PageHeader
          title="Submit Design Request"
          description="Request a new packaging design from the design team"
          breadcrumb={[{ label: 'Design Requests', to: '/design-requests' }, { label: 'New' }]}
        />

        <form onSubmit={handleSubmit}>
          {/* Design Information + Dimensions */}
          <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Design Information</span>
              <span className="text-[12px] font-medium" style={{ color: 'var(--so-text-tertiary)' }}>
                Design # assigned on submission
              </span>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1.5 col-span-2">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1.5 col-span-2">
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
              </div>
              <div style={{ paddingTop: '4px', borderTop: '1px solid var(--so-border-light)' }}>
                <div className="flex items-center gap-3 mb-3">
                  <Label style={{ color: 'var(--so-text-secondary)', marginBottom: 0 }}>Dimensions (inches)</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: dimDisplay === 'fraction' ? 'var(--so-primary)' : 'var(--so-text-tertiary)' }}>Fraction</span>
                    <Switch checked={dimDisplay === 'decimal'} onCheckedChange={() => toggleDimDisplay()} />
                    <span className="text-[11px]" style={{ color: dimDisplay === 'decimal' ? 'var(--so-primary)' : 'var(--so-text-tertiary)' }}>Decimal</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Input
                      id="length"
                      value={length}
                      onChange={(e) => setLength(e.target.value)}
                      onBlur={() => handleDimBlur('length')}
                      placeholder={dimDisplay === 'fraction' ? 'L' : '0.0000'}
                      style={inputStyle}
                    />
                    <span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Length</span>
                  </div>
                  <div className="space-y-1.5">
                    <Input
                      id="width"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      onBlur={() => handleDimBlur('width')}
                      placeholder={dimDisplay === 'fraction' ? 'W' : '0.0000'}
                      style={inputStyle}
                    />
                    <span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Width</span>
                  </div>
                  <div className="space-y-1.5">
                    <Input
                      id="depth"
                      value={depth}
                      onChange={(e) => setDepth(e.target.value)}
                      onBlur={() => handleDimBlur('depth')}
                      placeholder={dimDisplay === 'fraction' ? 'D' : '0.0000'}
                      style={inputStyle}
                    />
                    <span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Depth</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Requested Files */}
          <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Requested Files</span>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox id="needsArd" checked={needsArd} onCheckedChange={(v) => setNeedsArd(!!v)} />
                  <Label htmlFor="needsArd" className="font-normal cursor-pointer" style={{ color: 'var(--so-text-secondary)' }}>.ARD</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="needsPdf" checked={needsPdf} onCheckedChange={(v) => setNeedsPdf(!!v)} />
                  <Label htmlFor="needsPdf" className="font-normal cursor-pointer" style={{ color: 'var(--so-text-secondary)' }}>.PDF</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="needsDxf" checked={needsDxf} onCheckedChange={(v) => setNeedsDxf(!!v)} />
                  <Label htmlFor="needsDxf" className="font-normal cursor-pointer" style={{ color: 'var(--so-text-secondary)' }}>.DXF</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="needsEps" checked={needsEps} onCheckedChange={(v) => setNeedsEps(!!v)} />
                  <Label htmlFor="needsEps" className="font-normal cursor-pointer" style={{ color: 'var(--so-text-secondary)' }}>.EPS</Label>
                </div>
              </div>
            </div>
          </div>

          {/* Samples */}
          <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Samples</span>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox id="needsSamples" checked={needsSamples} onCheckedChange={(v) => setNeedsSamples(!!v)} />
                <Label htmlFor="needsSamples" className="font-normal cursor-pointer" style={{ color: 'var(--so-text-secondary)' }}>Samples needed</Label>
              </div>
              {needsSamples && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4" style={{ paddingTop: '4px', borderTop: '1px solid var(--so-border-light)' }}>
                  <div className="space-y-1.5">
                    <Label htmlFor="sampleQty" style={{ color: 'var(--so-text-secondary)' }}>Number of Samples</Label>
                    <Input
                      id="sampleQty"
                      type="number"
                      min="1"
                      step="1"
                      value={sampleQuantity}
                      onChange={(e) => setSampleQuantity(e.target.value)}
                      placeholder="# of samples"
                      style={inputStyle}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Pallet Configuration */}
          <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Pallet Configuration</span>
            </div>
            <div className="px-6 py-5">
              <div className="flex items-center space-x-2">
                <Checkbox id="needsPalletPattern" checked={needsPalletPattern} onCheckedChange={(v) => setNeedsPalletPattern(!!v)} />
                <Label htmlFor="needsPalletPattern" className="font-normal cursor-pointer" style={{ color: 'var(--so-text-secondary)' }}>Yes, include pallet configuration</Label>
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
