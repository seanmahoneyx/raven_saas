import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
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

const STYLE_OPTIONS = ['RSC', 'DC', 'HSC', 'FOL', 'TELE', 'Other']

const TEST_OPTIONS = [
  { value: 'ect29', label: 'ECT 29' },
  { value: 'ect32', label: 'ECT 32' },
  { value: 'ect40', label: 'ECT 40' },
  { value: 'ect44', label: 'ECT 44' },
  { value: 'ect48', label: 'ECT 48' },
  { value: 'ect51', label: 'ECT 51' },
  { value: 'ect55', label: 'ECT 55' },
  { value: 'ect112', label: 'ECT 112' },
  { value: '200t', label: '200T' },
]

const FLUTE_OPTIONS = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
  { value: 'c', label: 'C' },
  { value: 'e', label: 'E' },
  { value: 'f', label: 'F' },
  { value: 'bc', label: 'BC DW' },
  { value: 'eb', label: 'EB DW' },
  { value: 'tw', label: 'TW' },
]

const PAPER_OPTIONS = [
  { value: 'k', label: 'Kraft' },
  { value: 'mw', label: 'Mottled White' },
]

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

export default function CreateDesignRequest() {
  usePageTitle('Create Design Request')
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
  const [test, setTest] = useState('')
  const [flute, setFlute] = useState('')
  const [paper, setPaper] = useState('')
  const [sampleQuantity, setSampleQuantity] = useState('')
  const [notes, setNotes] = useState('')
  const [hasArd, setHasArd] = useState(false)
  const [hasPdf, setHasPdf] = useState(false)
  const [hasEps, setHasEps] = useState(false)
  const [hasDxf, setHasDxf] = useState(false)
  const [hasSamples, setHasSamples] = useState(false)
  const [palletConfiguration, setPalletConfiguration] = useState(false)

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
      test,
      flute,
      paper,
      sample_quantity: sampleQuantity ? Number(sampleQuantity) : null,
      notes,
      has_ard: hasArd,
      has_pdf: hasPdf,
      has_eps: hasEps,
      has_dxf: hasDxf,
      has_samples: hasSamples,
      pallet_configuration: palletConfiguration,
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
          <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Create New Design Request</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
            Submit a new packaging design request
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

          {/* Board Specifications */}
          <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Board Specifications</span>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--so-text-secondary)' }}>Test</Label>
                  <Select value={test} onValueChange={setTest}>
                    <SelectTrigger style={inputStyle}>
                      <SelectValue placeholder="Select test" />
                    </SelectTrigger>
                    <SelectContent>
                      {TEST_OPTIONS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--so-text-secondary)' }}>Flute</Label>
                  <Select value={flute} onValueChange={setFlute}>
                    <SelectTrigger style={inputStyle}>
                      <SelectValue placeholder="Select flute" />
                    </SelectTrigger>
                    <SelectContent>
                      {FLUTE_OPTIONS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label style={{ color: 'var(--so-text-secondary)' }}>Paper</Label>
                  <Select value={paper} onValueChange={setPaper}>
                    <SelectTrigger style={inputStyle}>
                      <SelectValue placeholder="Select paper" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAPER_OPTIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Checklist */}
          <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Checklist</span>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center space-x-2">
                  <Checkbox id="hasArd" checked={hasArd} onCheckedChange={(v) => setHasArd(!!v)} />
                  <Label htmlFor="hasArd" className="font-normal cursor-pointer" style={{ color: 'var(--so-text-secondary)' }}>ARD (Art Ready Document)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="hasPdf" checked={hasPdf} onCheckedChange={(v) => setHasPdf(!!v)} />
                  <Label htmlFor="hasPdf" className="font-normal cursor-pointer" style={{ color: 'var(--so-text-secondary)' }}>PDF Proof</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="hasEps" checked={hasEps} onCheckedChange={(v) => setHasEps(!!v)} />
                  <Label htmlFor="hasEps" className="font-normal cursor-pointer" style={{ color: 'var(--so-text-secondary)' }}>EPS File</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="hasDxf" checked={hasDxf} onCheckedChange={(v) => setHasDxf(!!v)} />
                  <Label htmlFor="hasDxf" className="font-normal cursor-pointer" style={{ color: 'var(--so-text-secondary)' }}>DXF Die Drawing</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="hasSamples" checked={hasSamples} onCheckedChange={(v) => setHasSamples(!!v)} />
                  <Label htmlFor="hasSamples" className="font-normal cursor-pointer" style={{ color: 'var(--so-text-secondary)' }}>Physical Samples</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="palletConfig" checked={palletConfiguration} onCheckedChange={(v) => setPalletConfiguration(!!v)} />
                  <Label htmlFor="palletConfig" className="font-normal cursor-pointer" style={{ color: 'var(--so-text-secondary)' }}>Pallet Configuration</Label>
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
              {createMutation.isPending ? 'Creating...' : 'Create Design Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
