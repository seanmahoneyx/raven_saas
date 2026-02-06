import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { Checkbox } from '@/components/ui/checkbox'
import { useParties } from '@/api/parties'
import { useCreateDesignRequest, useUpdateDesignRequest } from '@/api/design'
import type { DesignRequest } from '@/types/api'

interface DesignRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  designRequest?: DesignRequest | null
  onSuccess?: (dr: DesignRequest) => void
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'completed', label: 'Completed' },
]

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

export function DesignRequestDialog({
  open,
  onOpenChange,
  designRequest,
  onSuccess,
}: DesignRequestDialogProps) {
  const isEditing = !!designRequest
  const createMutation = useCreateDesignRequest()
  const updateMutation = useUpdateDesignRequest()
  const { data: partiesData } = useParties({ party_type: 'CUSTOMER' })

  const customers = partiesData?.results ?? []

  // Form state
  const [ident, setIdent] = useState('')
  const [style, setStyle] = useState('')
  const [status, setStatus] = useState('pending')
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

  // Populate form when editing
  useEffect(() => {
    if (designRequest) {
      setIdent(designRequest.ident || '')
      setStyle(designRequest.style || '')
      setStatus(designRequest.status || 'pending')
      setCustomer(designRequest.customer ? String(designRequest.customer) : '')
      setLength(designRequest.length || '')
      setWidth(designRequest.width || '')
      setDepth(designRequest.depth || '')
      setTest(designRequest.test || '')
      setFlute(designRequest.flute || '')
      setPaper(designRequest.paper || '')
      setSampleQuantity(designRequest.sample_quantity ? String(designRequest.sample_quantity) : '')
      setNotes(designRequest.notes || '')
      setHasArd(designRequest.has_ard)
      setHasPdf(designRequest.has_pdf)
      setHasEps(designRequest.has_eps)
      setHasDxf(designRequest.has_dxf)
      setHasSamples(designRequest.has_samples)
      setPalletConfiguration(designRequest.pallet_configuration)
    } else {
      // Reset form for new
      setIdent('')
      setStyle('')
      setStatus('pending')
      setCustomer('')
      setLength('')
      setWidth('')
      setDepth('')
      setTest('')
      setFlute('')
      setPaper('')
      setSampleQuantity('')
      setNotes('')
      setHasArd(false)
      setHasPdf(false)
      setHasEps(false)
      setHasDxf(false)
      setHasSamples(false)
      setPalletConfiguration(false)
    }
  }, [designRequest, open])

  const handleSubmit = async () => {
    const payload: Record<string, unknown> = {
      ident,
      style,
      status,
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
      let result: DesignRequest
      if (isEditing) {
        result = await updateMutation.mutateAsync({ id: designRequest!.id, ...payload } as any)
      } else {
        result = await createMutation.mutateAsync(payload as any)
      }
      onOpenChange(false)
      onSuccess?.(result)
    } catch (err) {
      console.error('Failed to save design request:', err)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Design Request' : 'New Design Request'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Row 1: Ident + Style */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ident">Item Identifier</Label>
              <Input id="ident" value={ident} onChange={(e) => setIdent(e.target.value)} placeholder="Item name or description" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="style">Box Style</Label>
              <Select value={style} onValueChange={setStyle}>
                <SelectTrigger><SelectValue placeholder="Select style" /></SelectTrigger>
                <SelectContent>
                  {STYLE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Customer + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer">Customer</Label>
              <Select value={customer} onValueChange={setCustomer}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isEditing && (
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Row 3: Dimensions */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="length">Length</Label>
              <Input id="length" type="number" step="0.0001" value={length} onChange={(e) => setLength(e.target.value)} placeholder="0.0000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="width">Width</Label>
              <Input id="width" type="number" step="0.0001" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="0.0000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="depth">Depth</Label>
              <Input id="depth" type="number" step="0.0001" value={depth} onChange={(e) => setDepth(e.target.value)} placeholder="0.0000" />
            </div>
          </div>

          {/* Row 4: Board specs */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Test</Label>
              <Select value={test} onValueChange={setTest}>
                <SelectTrigger><SelectValue placeholder="Select test" /></SelectTrigger>
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
                <SelectTrigger><SelectValue placeholder="Select flute" /></SelectTrigger>
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
                <SelectTrigger><SelectValue placeholder="Select paper" /></SelectTrigger>
                <SelectContent>
                  {PAPER_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 5: Sample quantity */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sampleQty">Sample Quantity</Label>
              <Input id="sampleQty" type="number" value={sampleQuantity} onChange={(e) => setSampleQuantity(e.target.value)} placeholder="0" />
            </div>
          </div>

          {/* Checklist */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Checklist</Label>
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
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes and requirements..." rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Saving...' : isEditing ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
