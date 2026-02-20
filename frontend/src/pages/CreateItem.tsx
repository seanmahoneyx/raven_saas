import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react'
import {
  useCreateItem,
  useUnitsOfMeasure,
  useCreateBoxItem,
} from '@/api/items'
import { useParties } from '@/api/parties'
import type { DivisionType, TestType, FluteType, PaperType, ItemType } from '@/types/api'

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

const DIVISIONS: { value: DivisionType; label: string }[] = [
  { value: 'corrugated', label: 'Corrugated' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'tooling', label: 'Tooling' },
  { value: 'janitorial', label: 'Janitorial' },
  { value: 'misc', label: 'Miscellaneous' },
]

const BOX_TYPES: { value: ItemType; label: string }[] = [
  { value: 'rsc', label: 'RSC - Regular Slotted Container' },
  { value: 'hsc', label: 'HSC - Half Slotted Container' },
  { value: 'fol', label: 'FOL - Full Overlap' },
  { value: 'dc', label: 'DC - Die Cut' },
  { value: 'tele', label: 'Tele - Telescoping' },
]

const TEST_TYPES: { value: TestType; label: string }[] = [
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

const FLUTE_TYPES: { value: FluteType; label: string }[] = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
  { value: 'c', label: 'C' },
  { value: 'e', label: 'E' },
  { value: 'f', label: 'F' },
  { value: 'bc', label: 'BC DW' },
  { value: 'eb', label: 'EB DW' },
  { value: 'tw', label: 'TW' },
]

const PAPER_TYPES: { value: PaperType; label: string }[] = [
  { value: 'k', label: 'Kraft' },
  { value: 'mw', label: 'Mottled White' },
]

interface FormData {
  sku: string
  name: string
  division: DivisionType
  description: string
  purch_desc: string
  sell_desc: string
  base_uom: string
  customer: string
  is_inventory: boolean
  is_active: boolean
  box_type: ItemType
  test: TestType | ''
  flute: FluteType | ''
  paper: PaperType | ''
  is_printed: boolean
  panels_printed: string
  colors_printed: string
  ink_list: string
  length: string
  width: string
  height: string
  blank_length: string
  blank_width: string
  out_per_rotary: string
  units_per_layer: string
  layers_per_pallet: string
  units_per_pallet: string
  unit_height: string
  pallet_height: string
  pallet_footprint: string
}

const initialFormData: FormData = {
  sku: '', name: '', division: 'misc', description: '', purch_desc: '', sell_desc: '',
  base_uom: '', customer: '', is_inventory: true, is_active: true, box_type: 'rsc',
  test: '', flute: '', paper: '', is_printed: false, panels_printed: '', colors_printed: '',
  ink_list: '', length: '', width: '', height: '', blank_length: '', blank_width: '',
  out_per_rotary: '', units_per_layer: '', layers_per_pallet: '', units_per_pallet: '',
  unit_height: '', pallet_height: '', pallet_footprint: '',
}

export default function CreateItem() {
  usePageTitle('Create Item')
  const navigate = useNavigate()

  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [error, setError] = useState('')
  const [openSections, setOpenSections] = useState({
    descriptions: false,
    printing: false,
    unitizing: false,
  })

  const { data: uomData } = useUnitsOfMeasure()
  const { data: customersData } = useParties({ party_type: 'CUSTOMER' })

  const createItem = useCreateItem()
  const createBoxItem = useCreateBoxItem(formData.box_type as 'dc' | 'rsc' | 'hsc' | 'fol' | 'tele')

  const isCorrugated = formData.division === 'corrugated'
  const isDC = formData.box_type === 'dc'
  const isPending = createItem.isPending || createBoxItem.isPending
  const uomList = uomData?.results ?? []
  const customerList = customersData?.results ?? []

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const basePayload = {
      sku: formData.sku, name: formData.name, division: formData.division,
      description: formData.description || undefined, purch_desc: formData.purch_desc || undefined,
      sell_desc: formData.sell_desc || undefined, base_uom: Number(formData.base_uom),
      customer: formData.customer ? Number(formData.customer) : null,
      is_inventory: formData.is_inventory, is_active: formData.is_active,
      units_per_layer: formData.units_per_layer ? Number(formData.units_per_layer) : null,
      layers_per_pallet: formData.layers_per_pallet ? Number(formData.layers_per_pallet) : null,
      units_per_pallet: formData.units_per_pallet ? Number(formData.units_per_pallet) : null,
      unit_height: formData.unit_height || null, pallet_height: formData.pallet_height || null,
      pallet_footprint: formData.pallet_footprint || undefined,
    }

    try {
      if (isCorrugated) {
        const corrugatedPayload = {
          ...basePayload,
          test: formData.test || undefined, flute: formData.flute || undefined,
          paper: formData.paper || undefined, is_printed: formData.is_printed,
          panels_printed: formData.panels_printed ? Number(formData.panels_printed) : null,
          colors_printed: formData.colors_printed ? Number(formData.colors_printed) : null,
          ink_list: formData.ink_list || undefined, length: formData.length, width: formData.width,
          ...(isDC
            ? { blank_length: formData.blank_length || null, blank_width: formData.blank_width || null, out_per_rotary: formData.out_per_rotary ? Number(formData.out_per_rotary) : null }
            : { height: formData.height }),
        }
        await createBoxItem.mutateAsync(corrugatedPayload)
      } else {
        await createItem.mutateAsync(basePayload)
      }
      navigate('/items')
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object') {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to create item'))
      }
    }
  }

  const inputStyle: React.CSSProperties = { borderColor: 'var(--so-border)', background: 'var(--so-surface)' }
  const labelStyle: React.CSSProperties = { color: 'var(--so-text-secondary)' }
  const hintStyle: React.CSSProperties = { color: 'var(--so-text-tertiary)' }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">
        {/* Header */}
        <div className="flex items-center gap-4 mb-7 animate-in">
          <button className={outlineBtnClass + ' !px-2'} style={outlineBtnStyle} onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Create New Item</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Add a new product to your catalog</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Classification */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Classification</span>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>Division *</Label>
                  <Select value={formData.division} onValueChange={(value) => setFormData({ ...formData, division: value as DivisionType })}>
                    <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                    <SelectContent>{DIVISIONS.map((d) => (<SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                {isCorrugated && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium" style={labelStyle}>Box Type *</Label>
                    <Select value={formData.box_type} onValueChange={(value) => setFormData({ ...formData, box_type: value as ItemType })}>
                      <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                      <SelectContent>{BOX_TYPES.map((bt) => (<SelectItem key={bt.value} value={bt.value}>{bt.label}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Item Information */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Item Information</span>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>MSPN *</Label>
                  <Input value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} placeholder="ITEM-001" required className="font-mono" style={inputStyle} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>Unit of Measure *</Label>
                  <Select value={formData.base_uom} onValueChange={(value) => setFormData({ ...formData, base_uom: value })}>
                    <SelectTrigger style={inputStyle}><SelectValue placeholder="Select UOM..." /></SelectTrigger>
                    <SelectContent>{uomList.map((uom) => (<SelectItem key={uom.id} value={String(uom.id)}>{uom.code} - {uom.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>Name *</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Product name" required style={inputStyle} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>Customer</Label>
                  <Select value={formData.customer || 'none'} onValueChange={(value) => setFormData({ ...formData, customer: value === 'none' ? '' : value })}>
                    <SelectTrigger style={inputStyle}><SelectValue placeholder="None (stock item)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (stock item)</SelectItem>
                      {customerList.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.code} - {c.display_name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center space-x-2">
                  <Switch id="is_inventory" checked={formData.is_inventory} onCheckedChange={(checked) => setFormData({ ...formData, is_inventory: checked })} />
                  <Label htmlFor="is_inventory" className="text-sm font-medium" style={labelStyle}>Track Inventory</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="is_active" checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
                  <Label htmlFor="is_active" className="text-sm font-medium" style={labelStyle}>Active</Label>
                </div>
              </div>
            </div>
          </div>

          {/* Board Specifications (Corrugated only) */}
          {isCorrugated && (
            <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
              <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                <span className="text-sm font-semibold">Board Specifications</span>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium" style={labelStyle}>Test (ECT)</Label>
                    <Select value={formData.test || 'none'} onValueChange={(value) => setFormData({ ...formData, test: (value === 'none' ? '' : value) as TestType | '' })}>
                      <SelectTrigger style={inputStyle}><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent><SelectItem value="none">None</SelectItem>{TEST_TYPES.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium" style={labelStyle}>Flute</Label>
                    <Select value={formData.flute || 'none'} onValueChange={(value) => setFormData({ ...formData, flute: (value === 'none' ? '' : value) as FluteType | '' })}>
                      <SelectTrigger style={inputStyle}><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent><SelectItem value="none">None</SelectItem>{FLUTE_TYPES.map((f) => (<SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium" style={labelStyle}>Paper</Label>
                    <Select value={formData.paper || 'none'} onValueChange={(value) => setFormData({ ...formData, paper: (value === 'none' ? '' : value) as PaperType | '' })}>
                      <SelectTrigger style={inputStyle}><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent><SelectItem value="none">None</SelectItem>{PAPER_TYPES.map((p) => (<SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>Dimensions (inches)</Label>
                  {isDC ? (
                    <div className="grid grid-cols-5 gap-2">
                      <div><Input value={formData.length} onChange={(e) => setFormData({ ...formData, length: e.target.value })} placeholder="L" required style={inputStyle} /><span className="text-[11px]" style={hintStyle}>Length</span></div>
                      <div><Input value={formData.width} onChange={(e) => setFormData({ ...formData, width: e.target.value })} placeholder="W" required style={inputStyle} /><span className="text-[11px]" style={hintStyle}>Width</span></div>
                      <div><Input value={formData.blank_length} onChange={(e) => setFormData({ ...formData, blank_length: e.target.value })} placeholder="BL" style={inputStyle} /><span className="text-[11px]" style={hintStyle}>Blank L</span></div>
                      <div><Input value={formData.blank_width} onChange={(e) => setFormData({ ...formData, blank_width: e.target.value })} placeholder="BW" style={inputStyle} /><span className="text-[11px]" style={hintStyle}>Blank W</span></div>
                      <div><Input value={formData.out_per_rotary} onChange={(e) => setFormData({ ...formData, out_per_rotary: e.target.value })} placeholder="#" type="number" style={inputStyle} /><span className="text-[11px]" style={hintStyle}># Out</span></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      <div><Input value={formData.length} onChange={(e) => setFormData({ ...formData, length: e.target.value })} placeholder="L" required style={inputStyle} /><span className="text-[11px]" style={hintStyle}>Length</span></div>
                      <div><Input value={formData.width} onChange={(e) => setFormData({ ...formData, width: e.target.value })} placeholder="W" required style={inputStyle} /><span className="text-[11px]" style={hintStyle}>Width</span></div>
                      <div><Input value={formData.height} onChange={(e) => setFormData({ ...formData, height: e.target.value })} placeholder="H" required style={inputStyle} /><span className="text-[11px]" style={hintStyle}>Height</span></div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Descriptions (collapsible) */}
          <Collapsible open={openSections.descriptions} onOpenChange={() => toggleSection('descriptions')}>
            <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
              <CollapsibleTrigger asChild>
                <button type="button" className="w-full flex items-center px-6 py-4 cursor-pointer transition-colors" style={{ color: 'var(--so-text-primary)' }}>
                  {openSections.descriptions ? <ChevronDown className="h-4 w-4 mr-2" style={{ color: 'var(--so-text-tertiary)' }} /> : <ChevronRight className="h-4 w-4 mr-2" style={{ color: 'var(--so-text-tertiary)' }} />}
                  <span className="text-sm font-semibold">Descriptions</span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-6 pb-5 space-y-4" style={{ borderTop: '1px solid var(--so-border-light)' }}>
                  <div className="space-y-2 pt-4">
                    <Label className="text-sm font-medium" style={labelStyle}>General Description</Label>
                    <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="General description..." rows={2} style={inputStyle} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium" style={labelStyle}>Purchase Description</Label>
                      <Textarea value={formData.purch_desc} onChange={(e) => setFormData({ ...formData, purch_desc: e.target.value })} placeholder="Shows on POs..." rows={2} style={inputStyle} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium" style={labelStyle}>Sales Description</Label>
                      <Textarea value={formData.sell_desc} onChange={(e) => setFormData({ ...formData, sell_desc: e.target.value })} placeholder="Shows on invoices..." rows={2} style={inputStyle} />
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Printing (collapsible, corrugated only) */}
          {isCorrugated && (
            <Collapsible open={openSections.printing} onOpenChange={() => toggleSection('printing')}>
              <div className="rounded-[14px] border overflow-hidden animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
                <CollapsibleTrigger asChild>
                  <button type="button" className="w-full flex items-center px-6 py-4 cursor-pointer transition-colors" style={{ color: 'var(--so-text-primary)' }}>
                    {openSections.printing ? <ChevronDown className="h-4 w-4 mr-2" style={{ color: 'var(--so-text-tertiary)' }} /> : <ChevronRight className="h-4 w-4 mr-2" style={{ color: 'var(--so-text-tertiary)' }} />}
                    <span className="text-sm font-semibold">Printing</span>
                    {formData.is_printed && (
                      <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--so-accent-light)', color: 'var(--so-accent)' }}>Printed</span>
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-6 pb-5 space-y-4" style={{ borderTop: '1px solid var(--so-border-light)' }}>
                    <div className="flex items-center space-x-2 pt-4">
                      <Switch id="is_printed" checked={formData.is_printed} onCheckedChange={(checked) => setFormData({ ...formData, is_printed: checked })} />
                      <Label htmlFor="is_printed" className="text-sm font-medium" style={labelStyle}>Printed Item</Label>
                    </div>
                    {formData.is_printed && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium" style={labelStyle}>Panels Printed</Label>
                            <Input type="number" value={formData.panels_printed} onChange={(e) => setFormData({ ...formData, panels_printed: e.target.value })} placeholder="0" style={inputStyle} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium" style={labelStyle}>Colors</Label>
                            <Input type="number" value={formData.colors_printed} onChange={(e) => setFormData({ ...formData, colors_printed: e.target.value })} placeholder="0" style={inputStyle} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium" style={labelStyle}>Ink Colors</Label>
                          <Input value={formData.ink_list} onChange={(e) => setFormData({ ...formData, ink_list: e.target.value })} placeholder="e.g., PMS 286, Black, Red" style={inputStyle} />
                        </div>
                      </>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}

          {/* Unitizing (collapsible) */}
          <Collapsible open={openSections.unitizing} onOpenChange={() => toggleSection('unitizing')}>
            <div className="rounded-[14px] border overflow-hidden animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
              <CollapsibleTrigger asChild>
                <button type="button" className="w-full flex items-center px-6 py-4 cursor-pointer transition-colors" style={{ color: 'var(--so-text-primary)' }}>
                  {openSections.unitizing ? <ChevronDown className="h-4 w-4 mr-2" style={{ color: 'var(--so-text-tertiary)' }} /> : <ChevronRight className="h-4 w-4 mr-2" style={{ color: 'var(--so-text-tertiary)' }} />}
                  <span className="text-sm font-semibold">Unitizing / Pallet Info</span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-6 pb-5 space-y-4" style={{ borderTop: '1px solid var(--so-border-light)' }}>
                  <div className="grid grid-cols-3 gap-4 pt-4">
                    <div className="space-y-2"><Label className="text-sm font-medium" style={labelStyle}>Units/Layer</Label><Input type="number" value={formData.units_per_layer} onChange={(e) => setFormData({ ...formData, units_per_layer: e.target.value })} placeholder="0" style={inputStyle} /></div>
                    <div className="space-y-2"><Label className="text-sm font-medium" style={labelStyle}>Layers/Pallet</Label><Input type="number" value={formData.layers_per_pallet} onChange={(e) => setFormData({ ...formData, layers_per_pallet: e.target.value })} placeholder="0" style={inputStyle} /></div>
                    <div className="space-y-2"><Label className="text-sm font-medium" style={labelStyle}>Units/Pallet</Label><Input type="number" value={formData.units_per_pallet} onChange={(e) => setFormData({ ...formData, units_per_pallet: e.target.value })} placeholder="0" style={inputStyle} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2"><Label className="text-sm font-medium" style={labelStyle}>Unit Height</Label><Input value={formData.unit_height} onChange={(e) => setFormData({ ...formData, unit_height: e.target.value })} placeholder="inches" style={inputStyle} /></div>
                    <div className="space-y-2"><Label className="text-sm font-medium" style={labelStyle}>Pallet Height</Label><Input value={formData.pallet_height} onChange={(e) => setFormData({ ...formData, pallet_height: e.target.value })} placeholder="inches" style={inputStyle} /></div>
                    <div className="space-y-2"><Label className="text-sm font-medium" style={labelStyle}>Pallet Footprint</Label><Input value={formData.pallet_footprint} onChange={(e) => setFormData({ ...formData, pallet_footprint: e.target.value })} placeholder="48x40" style={inputStyle} /></div>
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {error && (
            <div className="text-[13px] rounded-md px-3 py-2.5" style={{ background: 'var(--so-danger-bg)', color: 'var(--so-danger-text)' }}>{error}</div>
          )}

          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid var(--so-border-light)' }}>
            <button type="button" className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate(-1)}>Cancel</button>
            <button type="submit" className={`${primaryBtnClass} ${isPending || !formData.base_uom ? 'opacity-50 pointer-events-none' : ''}`} style={primaryBtnStyle} disabled={isPending || !formData.base_uom}>
              {isPending ? 'Creating...' : 'Create Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
