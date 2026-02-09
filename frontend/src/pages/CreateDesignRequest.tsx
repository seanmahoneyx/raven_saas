import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Button } from '@/components/ui/button'
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

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create New Design Request</h1>
          <p className="text-sm text-muted-foreground">
            Submit a new packaging design request
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Item Info */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Design Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ident">Item Identifier</Label>
              <Input
                id="ident"
                value={ident}
                onChange={(e) => setIdent(e.target.value)}
                placeholder="Item name or description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="style">Box Style</Label>
              <Select value={style} onValueChange={setStyle}>
                <SelectTrigger>
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
            <div className="space-y-2">
              <Label htmlFor="customer">Customer</Label>
              <Select value={customer} onValueChange={setCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sampleQty">Sample Quantity</Label>
              <Input
                id="sampleQty"
                type="number"
                value={sampleQuantity}
                onChange={(e) => setSampleQuantity(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
        </section>

        {/* Dimensions */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Dimensions (inches)</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="length">Length</Label>
              <Input
                id="length"
                type="number"
                step="0.0001"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                placeholder="0.0000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="width">Width</Label>
              <Input
                id="width"
                type="number"
                step="0.0001"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                placeholder="0.0000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="depth">Depth</Label>
              <Input
                id="depth"
                type="number"
                step="0.0001"
                value={depth}
                onChange={(e) => setDepth(e.target.value)}
                placeholder="0.0000"
              />
            </div>
          </div>
        </section>

        {/* Board Specs */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Board Specifications</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Test</Label>
              <Select value={test} onValueChange={setTest}>
                <SelectTrigger>
                  <SelectValue placeholder="Select test" />
                </SelectTrigger>
                <SelectContent>
                  {TEST_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Flute</Label>
              <Select value={flute} onValueChange={setFlute}>
                <SelectTrigger>
                  <SelectValue placeholder="Select flute" />
                </SelectTrigger>
                <SelectContent>
                  {FLUTE_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Paper</Label>
              <Select value={paper} onValueChange={setPaper}>
                <SelectTrigger>
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
        </section>

        {/* Checklist */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Checklist</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center space-x-2">
              <Checkbox id="hasArd" checked={hasArd} onCheckedChange={(v) => setHasArd(!!v)} />
              <Label htmlFor="hasArd" className="font-normal">ARD (Art Ready Document)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="hasPdf" checked={hasPdf} onCheckedChange={(v) => setHasPdf(!!v)} />
              <Label htmlFor="hasPdf" className="font-normal">PDF Proof</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="hasEps" checked={hasEps} onCheckedChange={(v) => setHasEps(!!v)} />
              <Label htmlFor="hasEps" className="font-normal">EPS File</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="hasDxf" checked={hasDxf} onCheckedChange={(v) => setHasDxf(!!v)} />
              <Label htmlFor="hasDxf" className="font-normal">DXF Die Drawing</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="hasSamples" checked={hasSamples} onCheckedChange={(v) => setHasSamples(!!v)} />
              <Label htmlFor="hasSamples" className="font-normal">Physical Samples</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="palletConfig" checked={palletConfiguration} onCheckedChange={(v) => setPalletConfiguration(!!v)} />
              <Label htmlFor="palletConfig" className="font-normal">Pallet Configuration</Label>
            </div>
          </div>
        </section>

        {/* Notes */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Notes</h2>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes and requirements..."
            rows={3}
          />
        </section>

        {/* Error */}
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Design Request'}
          </Button>
        </div>
      </form>
    </div>
  )
}
