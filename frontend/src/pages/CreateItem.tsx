import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Plus, X, Printer } from 'lucide-react'
import {
  useCreateItem,
  useUnitsOfMeasure,
  useCreateBoxItem,
  useNextMspn,
  useCreatePackagingItem,
} from '@/api/items'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { useParties } from '@/api/parties'
import type { PackagingSubType } from '@/types/api'
import {
  DIVISIONS, BOX_TYPES, PKG_SUB_TYPES,
  TEST_TYPES, FLUTE_TYPES, PAPER_TYPES,
  showPkgField,
} from '@/constants/items'

type ExtraInfoType = 'gap_top' | 'gap_bot' | 'score' | 'handhole' | 'wra' | 'perforation' | 'user_defined'

interface ExtraInfoLine {
  id: number
  type: ExtraInfoType | ''
  value: string
  // Handhole-specific
  qty: string
  hh_type: string
  location: string
  // User Defined
  label: string
}

const EXTRA_INFO_TYPES: { value: ExtraInfoType; label: string }[] = [
  { value: 'gap_top', label: 'Gap Top' },
  { value: 'gap_bot', label: 'Gap Bottom' },
  { value: 'score', label: 'Score' },
  { value: 'handhole', label: 'Handhole' },
  { value: 'wra', label: 'WRA' },
  { value: 'perforation', label: 'Perforation' },
  { value: 'user_defined', label: 'User Defined' },
]

const HANDHOLE_TYPES = ['Full Cut Out', 'Hinged', 'Die Cut', 'Punch Out']

type PrintMethod = 'unprinted' | 'printed' | 'litho' | 'digital'
const PRINT_METHODS: { value: PrintMethod; label: string }[] = [
  { value: 'unprinted', label: 'Unprinted' },
  { value: 'printed', label: 'Printed' },
  { value: 'litho', label: 'Litho' },
  { value: 'digital', label: 'Digital' },
]

// ── Fraction ↔ Decimal utilities (nearest 1/16") ──
function decimalToFraction(value: number): string {
  if (value <= 0) return ''
  const whole = Math.floor(value)
  const remainder = value - whole
  const sixteenths = Math.round(remainder * 16)
  if (sixteenths === 0) return `${whole}`
  if (sixteenths === 16) return `${whole + 1}`
  // Simplify: find GCD of sixteenths and 16
  const g = gcd(sixteenths, 16)
  const num = sixteenths / g
  const den = 16 / g
  return whole > 0 ? `${whole}+${num}/${den}` : `${num}/${den}`
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function fractionToDecimal(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  // Try pure decimal first
  if (/^\d+\.?\d*$/.test(trimmed)) return parseFloat(trimmed)
  // Parse fraction format: "W+N/D" or "N/D"
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

/** Round a decimal to the nearest 1/16th */
function roundTo16th(value: number): number {
  return Math.round(value * 16) / 16
}

interface FormData {
  name: string
  secondary_ident: string
  division: DivisionType
  purch_desc: string
  sell_desc: string
  base_uom: string
  customer: string
  item_type: 'inventory' | 'crossdock' | 'non_stockable' | 'other_charge'
  is_active: boolean
  box_type: ItemType
  test: TestType | ''
  flute: FluteType | ''
  paper: PaperType | ''
  print_method: PrintMethod
  panels_printed: string
  colors_printed: string
  ink_colors: string[]
  length: string
  width: string
  height: string
  blank_length: string
  blank_width: string
  out_per_rotary: string
  units_per_bundle: string
  units_per_pallet: string
  unit_height: string
  pallet_height: string
  pallet_footprint: string
  extra_info: ExtraInfoLine[]
  special_instructions: string
  // Packaging fields
  pkg_sub_type: PackagingSubType
  material_type: string
  color: string
  thickness: string
  thickness_unit: string
  diameter: string
  pieces_per_case: string
  weight_capacity_lbs: string
  roll_length: string
  roll_width: string
  rolls_per_case: string
  core_diameter: string
  sheets_per_bundle: string
  bubble_size: string
  perforated: boolean
  perforation_interval: string
  lip_style: string
  density: string
  cells_x: string
  cells_y: string
  adhesive_type: string
  tape_type: string
  break_strength_lbs: string
  stretch_pct: string
  inner_diameter: string
  lid_included: boolean
  label_type: string
  labels_per_roll: string
}

const initialFormData: FormData = {
  name: '', secondary_ident: '', division: 'corrugated', purch_desc: '', sell_desc: '',
  base_uom: '', customer: '', item_type: 'inventory', is_active: true, box_type: 'rsc',
  test: '', flute: '', paper: '', print_method: 'unprinted' as PrintMethod,
  panels_printed: '', colors_printed: '', ink_colors: [], length: '', width: '', height: '', blank_length: '', blank_width: '',
  out_per_rotary: '', units_per_bundle: '', units_per_pallet: '',
  unit_height: '', pallet_height: '', pallet_footprint: '',
  extra_info: [], special_instructions: '',
  // Packaging
  pkg_sub_type: 'bags', material_type: '', color: '', thickness: '', thickness_unit: 'mil',
  diameter: '', pieces_per_case: '', weight_capacity_lbs: '', roll_length: '', roll_width: '',
  rolls_per_case: '', core_diameter: '', sheets_per_bundle: '', bubble_size: '', perforated: false,
  perforation_interval: '', lip_style: '', density: '', cells_x: '', cells_y: '',
  adhesive_type: '', tape_type: '', break_strength_lbs: '', stretch_pct: '', inner_diameter: '',
  lid_included: false, label_type: '', labels_per_roll: '',
}

export default function CreateItem() {
  usePageTitle('Create Item')
  const navigate = useNavigate()

  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [error, setError] = useState('')
  const [dimDisplay, setDimDisplay] = useState<'fraction' | 'decimal'>('fraction')
  const [autoCreatePlate, setAutoCreatePlate] = useState(false)
  const [autoCreateSteel, setAutoCreateSteel] = useState(false)

  const extraInfoIdRef = useRef(1)
  const printAfterCreate = useRef(false)

  const { data: nextMspn } = useNextMspn()
  const { data: uomData } = useUnitsOfMeasure()
  const { data: customersData } = useParties({ party_type: 'CUSTOMER' })

  const createItem = useCreateItem()
  const createBoxItem = useCreateBoxItem(formData.box_type as 'dc' | 'rsc' | 'hsc' | 'fol' | 'tele')
  const createPkgItem = useCreatePackagingItem()

  const isCorrugated = formData.division === 'corrugated'
  const isPackaging = formData.division === 'packaging'
  const isDC = formData.box_type === 'dc'
  const isPending = createItem.isPending || createBoxItem.isPending || createPkgItem.isPending
  const uomList = uomData?.results ?? []
  const customerList = customersData?.results ?? []
  const colorCount = formData.colors_printed ? parseInt(formData.colors_printed) || 0 : 0

  // Sync ink_colors array size when color count changes
  const inkColors = useMemo(() => {
    const current = formData.ink_colors
    if (colorCount <= 0) return []
    const arr = [...current]
    while (arr.length < colorCount) arr.push('')
    return arr.slice(0, colorCount)
  }, [colorCount, formData.ink_colors])

  // Auto-generate purchase description from form fields
  const autoPurchDesc = useMemo(() => {
    if (!isCorrugated) return ''
    const lines: string[] = []

    // Line 1: Ident
    if (formData.name) lines.push(formData.name)
    // Line 2: Secondary Ident
    if (formData.secondary_ident) lines.push(formData.secondary_ident)

    // Blank line separator
    if (lines.length > 0) lines.push('')

    // Board spec: BOX_TYPE TEST FLUTE PAPER
    const boxLabel = BOX_TYPES.find(b => b.value === formData.box_type)?.value.toUpperCase() || ''
    const testLabel = TEST_TYPES.find(t => t.value === formData.test)?.label || ''
    const fluteLabel = FLUTE_TYPES.find(f => f.value === formData.flute)?.label || ''
    const paperLabel = PAPER_TYPES.find(p => p.value === formData.paper)?.label || ''
    const specParts = [boxLabel, testLabel, fluteLabel, paperLabel].filter(Boolean)
    if (specParts.length > 0) lines.push(specParts.join(' '))

    // Dimensions
    if (isDC) {
      const dims = [formData.length, formData.width].filter(Boolean).join(' x ')
      if (dims) lines.push(dims)
      const blanks = [formData.blank_length, formData.blank_width].filter(Boolean)
      if (blanks.length > 0) lines.push(`Blank: ${blanks.join(' x ')}`)
    } else {
      const dims = [formData.length, formData.width, formData.height].filter(Boolean).join(' x ')
      if (dims) lines.push(dims)
    }

    // Print status
    if (formData.print_method !== 'unprinted') {
      const printParts = [formData.print_method.toUpperCase()]
      if (formData.panels_printed) printParts.push(`${formData.panels_printed} PANEL${Number(formData.panels_printed) !== 1 ? 'S' : ''}`)
      if (formData.colors_printed) printParts.push(`${formData.colors_printed} COLOR${Number(formData.colors_printed) !== 1 ? 'S' : ''}`)
      lines.push(printParts.join(' '))
    } else {
      lines.push('PLAIN')
    }

    // Ink list
    const inks = inkColors.filter(Boolean).join(', ')
    if (inks) lines.push(inks)

    // Extra info
    const extras: string[] = []
    for (const info of formData.extra_info) {
      if (!info.type) continue
      switch (info.type) {
        case 'gap_top': if (info.value) extras.push(`Gap Top: ${info.value}`); break
        case 'gap_bot': if (info.value) extras.push(`Gap Bottom: ${info.value}`); break
        case 'score': if (info.value) extras.push(`Score: ${info.value}`); break
        case 'handhole': {
          const parts = [info.qty && `${info.qty}`, info.hh_type, info.location].filter(Boolean)
          if (parts.length) extras.push(`Handhole: ${parts.join(' - ')}`)
          break
        }
        case 'wra': extras.push(`WRA: ${info.value === 'yes' ? 'Yes' : 'No'}`); break
        case 'perforation': if (info.value) extras.push(`Perforation: ${info.value}`); break
        case 'user_defined': if (info.label || info.value) extras.push(`${info.label || 'Custom'}: ${info.value}`); break
      }
    }
    if (formData.special_instructions) extras.push(formData.special_instructions)

    if (extras.length > 0) {
      lines.push('')
      lines.push(...extras)
    }

    return lines.join('\n')
  }, [formData, isCorrugated, isDC, inkColors])

  const dimFields: (keyof FormData)[] = ['length', 'width', 'height', 'blank_length', 'blank_width']

  /** Handle dimension blur: normalize the stored value */
  const handleDimBlur = (field: keyof FormData) => {
    const raw = formData[field] as string
    if (!raw) return
    const dec = fractionToDecimal(raw)
    if (dec !== null) {
      const rounded = roundTo16th(dec)
      if (dimDisplay === 'fraction') {
        set(field, decimalToFraction(rounded))
      } else {
        set(field, String(rounded))
      }
    }
  }

  /** Toggle display mode and convert all existing dimension values */
  const toggleDimDisplay = () => {
    const next = dimDisplay === 'fraction' ? 'decimal' : 'fraction'
    setDimDisplay(next)
    setFormData(prev => {
      const updated = { ...prev }
      for (const field of dimFields) {
        const raw = prev[field] as string
        if (!raw) continue
        const dec = fractionToDecimal(raw)
        if (dec === null) continue
        const rounded = roundTo16th(dec)
        ;(updated as Record<string, unknown>)[field] = next === 'fraction' ? decimalToFraction(rounded) : String(rounded)
      }
      return updated
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const effectivePurchDesc = isCorrugated ? autoPurchDesc : formData.purch_desc

    const basePayload = {
      sku: '', // auto-generated by backend
      name: formData.name, division: formData.division,
      purch_desc: effectivePurchDesc || undefined,
      sell_desc: formData.sell_desc || undefined, base_uom: Number(formData.base_uom),
      customer: formData.customer ? Number(formData.customer) : null,
      item_type: formData.item_type, is_active: formData.is_active,
      lifecycle_status: 'draft',
      units_per_layer: formData.units_per_bundle ? Number(formData.units_per_bundle) : null,
      layers_per_pallet: null,
      units_per_pallet: formData.units_per_pallet ? Number(formData.units_per_pallet) : null,
      unit_height: formData.unit_height || null, pallet_height: formData.pallet_height || null,
      pallet_footprint: formData.pallet_footprint || undefined,
    }

    try {
      if (isCorrugated) {
        const corrugatedPayload = {
          ...basePayload,
          test: formData.test || undefined, flute: formData.flute || undefined,
          paper: formData.paper || undefined, is_printed: formData.print_method !== 'unprinted',
          panels_printed: formData.panels_printed ? Number(formData.panels_printed) : null,
          colors_printed: formData.colors_printed ? Number(formData.colors_printed) : null,
          ink_list: inkColors.filter(Boolean).join(', ') || undefined, length: formData.length, width: formData.width,
          ...(isDC
            ? { blank_length: formData.blank_length || null, blank_width: formData.blank_width || null, out_per_rotary: formData.out_per_rotary ? Number(formData.out_per_rotary) : null }
            : { height: formData.height }),
        }
        const boxResult = await createBoxItem.mutateAsync(corrugatedPayload)
        if (printAfterCreate.current && boxResult?.id) {
          window.open(`/api/v1/items/${boxResult.id}/spec_sheet/`, '_blank')
        }
      } else if (isPackaging) {
        const st = formData.pkg_sub_type
        const pkgPayload: Record<string, any> = {
          ...basePayload,
          sub_type: st,
          material_type: formData.material_type || '',
          color: formData.color || '',
          thickness: showPkgField('thickness', st) && formData.thickness ? formData.thickness : null,
          thickness_unit: formData.thickness_unit || 'mil',
          length: showPkgField('length', st) && formData.length ? formData.length : null,
          width: showPkgField('width', st) && formData.width ? formData.width : null,
          height: showPkgField('height', st) && formData.height ? formData.height : null,
          diameter: showPkgField('diameter', st) && formData.diameter ? formData.diameter : null,
          pieces_per_case: showPkgField('pieces_per_case', st) && formData.pieces_per_case ? Number(formData.pieces_per_case) : null,
          weight_capacity_lbs: showPkgField('weight_capacity_lbs', st) && formData.weight_capacity_lbs ? formData.weight_capacity_lbs : null,
          roll_length: showPkgField('roll_length', st) && formData.roll_length ? formData.roll_length : null,
          roll_width: showPkgField('roll_width', st) && formData.roll_width ? formData.roll_width : null,
          rolls_per_case: showPkgField('rolls_per_case', st) && formData.rolls_per_case ? Number(formData.rolls_per_case) : null,
          core_diameter: showPkgField('core_diameter', st) && formData.core_diameter ? formData.core_diameter : null,
          sheets_per_bundle: showPkgField('sheets_per_bundle', st) && formData.sheets_per_bundle ? Number(formData.sheets_per_bundle) : null,
          bubble_size: showPkgField('bubble_size', st) ? formData.bubble_size || '' : '',
          perforated: showPkgField('perforated', st) ? formData.perforated : false,
          perforation_interval: showPkgField('perforation_interval', st) ? formData.perforation_interval || '' : '',
          lip_style: showPkgField('lip_style', st) ? formData.lip_style || '' : '',
          density: showPkgField('density', st) && formData.density ? formData.density : null,
          cells_x: showPkgField('cells_x', st) && formData.cells_x ? Number(formData.cells_x) : null,
          cells_y: showPkgField('cells_y', st) && formData.cells_y ? Number(formData.cells_y) : null,
          adhesive_type: showPkgField('adhesive_type', st) ? formData.adhesive_type || '' : '',
          tape_type: showPkgField('tape_type', st) ? formData.tape_type || '' : '',
          break_strength_lbs: showPkgField('break_strength_lbs', st) && formData.break_strength_lbs ? formData.break_strength_lbs : null,
          stretch_pct: showPkgField('stretch_pct', st) && formData.stretch_pct ? Number(formData.stretch_pct) : null,
          inner_diameter: showPkgField('inner_diameter', st) && formData.inner_diameter ? formData.inner_diameter : null,
          lid_included: showPkgField('lid_included', st) ? formData.lid_included : false,
          label_type: showPkgField('label_type', st) ? formData.label_type || '' : '',
          labels_per_roll: showPkgField('labels_per_roll', st) && formData.labels_per_roll ? Number(formData.labels_per_roll) : null,
        }
        const pkgResult = await createPkgItem.mutateAsync(pkgPayload)
        if (printAfterCreate.current && pkgResult?.id) {
          window.open(`/api/v1/items/${pkgResult.id}/spec_sheet/`, '_blank')
        }
      } else {
        const baseResult = await createItem.mutateAsync(basePayload)
        if (printAfterCreate.current && baseResult?.id) {
          window.open(`/api/v1/items/${baseResult.id}/spec_sheet/`, '_blank')
        }
      }

      // Create companion items
      const companionPromises: Promise<unknown>[] = []
      if (autoCreatePlate) {
        companionPromises.push(createItem.mutateAsync({
          sku: '',
          name: `${formData.name} - Print Plate`,
          division: 'tooling',
          item_type: 'non_stockable',
          is_active: true,
          base_uom: Number(formData.base_uom),
          purch_desc: `Print plate for ${formData.name}`,
          sell_desc: `Print plate for ${formData.name}`,
        }))
      }
      if (autoCreateSteel) {
        companionPromises.push(createItem.mutateAsync({
          sku: '',
          name: `${formData.name} - Steel`,
          division: 'tooling',
          item_type: 'non_stockable',
          is_active: true,
          base_uom: Number(formData.base_uom),
          purch_desc: `Steel die for ${formData.name}`,
          sell_desc: `Steel die for ${formData.name}`,
        }))
      }
      if (companionPromises.length > 0) {
        await Promise.all(companionPromises)
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

  const set = (field: keyof FormData, value: any) => setFormData(prev => ({ ...prev, [field]: value }))

  const addExtraInfo = () => {
    setFormData(prev => ({
      ...prev,
      extra_info: [...prev.extra_info, {
        id: extraInfoIdRef.current++,
        type: '',
        value: '',
        qty: '',
        hh_type: '',
        location: '',
        label: '',
      }]
    }))
  }

  const updateExtraInfo = (id: number, updates: Partial<ExtraInfoLine>) => {
    setFormData(prev => ({
      ...prev,
      extra_info: prev.extra_info.map(line => line.id === id ? { ...line, ...updates } : line)
    }))
  }

  const removeExtraInfo = (id: number) => {
    setFormData(prev => ({
      ...prev,
      extra_info: prev.extra_info.filter(line => line.id !== id)
    }))
  }


  const inputStyle: React.CSSProperties = { borderColor: 'var(--so-border)', background: 'var(--so-surface)' }
  const labelStyle: React.CSSProperties = { color: 'var(--so-text-secondary)', fontSize: '13px', fontWeight: 500 }
  const sectionStyle: React.CSSProperties = { borderTop: '1px solid var(--so-border-light)', paddingTop: '20px', marginTop: '20px' }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[860px] mx-auto px-8 py-7 pb-16">
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

        <form onSubmit={handleSubmit}>
          <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-5 space-y-5">

              {/* ── Row 1: MSPN, Customer, Ident, Secondary Ident ── */}
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label style={labelStyle}>MSPN <span style={{ color: 'var(--so-text-tertiary)', fontWeight: 400 }}>(Auto)</span></Label>
                  <Input
                    value={nextMspn ?? 'MSPN-000001'}
                    disabled
                    className="font-mono bg-muted"
                    style={{ ...inputStyle, opacity: 0.7, cursor: 'not-allowed' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label style={labelStyle}>Customer</Label>
                  <Select value={formData.customer || 'none'} onValueChange={v => set('customer', v === 'none' ? '' : v)}>
                    <SelectTrigger style={inputStyle}><SelectValue placeholder="None (stock)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (stock item)</SelectItem>
                      {customerList.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.code} - {c.display_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label style={labelStyle}>Ident *</Label>
                  <Input value={formData.name} onChange={e => set('name', e.target.value)} placeholder="Ident" required style={inputStyle} />
                </div>
                <div className="space-y-1.5">
                  <Label style={labelStyle}>Secondary Ident</Label>
                  <Input value={formData.secondary_ident} onChange={e => set('secondary_ident', e.target.value)} placeholder="Secondary ident" style={inputStyle} />
                </div>
              </div>

              {/* ── Row 2: Item Type, Division, UoM, Active ── */}
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label style={labelStyle}>Item Type</Label>
                  <Select value={formData.item_type} onValueChange={v => set('item_type', v)}>
                    <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inventory">Inventory</SelectItem>
                      <SelectItem value="crossdock">Crossdock</SelectItem>
                      <SelectItem value="non_stockable">Non-Stockable</SelectItem>
                      <SelectItem value="other_charge">Other Charge</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label style={labelStyle}>Division *</Label>
                  <Select value={formData.division} onValueChange={v => set('division', v)}>
                    <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                    <SelectContent>{DIVISIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label style={labelStyle}>UoM *</Label>
                  <Select value={formData.base_uom} onValueChange={v => set('base_uom', v)}>
                    <SelectTrigger style={inputStyle}><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>{uomList.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.code} - {u.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label style={labelStyle}>Active Status</Label>
                  <div className="flex items-center gap-2 h-9 px-1">
                    <Switch id="is_active" checked={formData.is_active} onCheckedChange={v => set('is_active', v)} />
                    <Label htmlFor="is_active" className="text-sm" style={{ color: formData.is_active ? 'var(--so-success, #4a905c)' : 'var(--so-text-tertiary)' }}>
                      {formData.is_active ? 'Active' : 'Inactive'}
                    </Label>
                  </div>
                </div>
              </div>

              {/* ── Board Specifications (Corrugated only) ── */}
              {isCorrugated && (
                <div style={sectionStyle}>
                  <h3 className="text-[13px] font-semibold tracking-wide uppercase mb-4" style={{ color: 'var(--so-text-tertiary)' }}>Board Specifications</h3>
                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <div className="space-y-1.5">
                      <Label style={labelStyle}>Box Type *</Label>
                      <Select value={formData.box_type} onValueChange={v => set('box_type', v)}>
                        <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                        <SelectContent>{BOX_TYPES.map(bt => <SelectItem key={bt.value} value={bt.value}>{bt.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label style={labelStyle}>Test (ECT)</Label>
                      <Select value={formData.test || 'none'} onValueChange={v => set('test', v === 'none' ? '' : v)}>
                        <SelectTrigger style={inputStyle}><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent><SelectItem value="none">None</SelectItem>{TEST_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label style={labelStyle}>Flute</Label>
                      <Select value={formData.flute || 'none'} onValueChange={v => set('flute', v === 'none' ? '' : v)}>
                        <SelectTrigger style={inputStyle}><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent><SelectItem value="none">None</SelectItem>{FLUTE_TYPES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label style={labelStyle}>Paper</Label>
                      <Select value={formData.paper || 'none'} onValueChange={v => set('paper', v === 'none' ? '' : v)}>
                        <SelectTrigger style={inputStyle}><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent><SelectItem value="none">None</SelectItem>{PAPER_TYPES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Dimensions */}
                  <div className="flex items-center gap-3 mb-1.5">
                    <Label style={{ ...labelStyle, marginBottom: 0 }}>Dimensions (inches)</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px]" style={{ color: dimDisplay === 'fraction' ? 'var(--so-primary)' : 'var(--so-text-tertiary)' }}>Fraction</span>
                      <Switch checked={dimDisplay === 'decimal'} onCheckedChange={() => toggleDimDisplay()} />
                      <span className="text-[11px]" style={{ color: dimDisplay === 'decimal' ? 'var(--so-primary)' : 'var(--so-text-tertiary)' }}>Decimal</span>
                    </div>
                  </div>
                  {isDC ? (
                    <div className="grid grid-cols-5 gap-3">
                      <div><Input value={formData.length} onChange={e => set('length', e.target.value)} onBlur={() => handleDimBlur('length')} placeholder="L" required style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Length</span></div>
                      <div><Input value={formData.width} onChange={e => set('width', e.target.value)} onBlur={() => handleDimBlur('width')} placeholder="W" required style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Width</span></div>
                      <div><Input value={formData.blank_length} onChange={e => set('blank_length', e.target.value)} onBlur={() => handleDimBlur('blank_length')} placeholder="BL" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Blank L</span></div>
                      <div><Input value={formData.blank_width} onChange={e => set('blank_width', e.target.value)} onBlur={() => handleDimBlur('blank_width')} placeholder="BW" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Blank W</span></div>
                      <div><Input value={formData.out_per_rotary} onChange={e => set('out_per_rotary', e.target.value)} placeholder="#" type="number" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}># Out</span></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3" style={{ maxWidth: '60%' }}>
                      <div><Input value={formData.length} onChange={e => set('length', e.target.value)} onBlur={() => handleDimBlur('length')} placeholder="L" required style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Length</span></div>
                      <div><Input value={formData.width} onChange={e => set('width', e.target.value)} onBlur={() => handleDimBlur('width')} placeholder="W" required style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Width</span></div>
                      <div><Input value={formData.height} onChange={e => set('height', e.target.value)} onBlur={() => handleDimBlur('height')} placeholder="H" required style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Height</span></div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Packaging Specifications ── */}
              {isPackaging && (
                <div style={sectionStyle}>
                  <h3 className="text-[13px] font-semibold tracking-wide uppercase mb-4" style={{ color: 'var(--so-text-tertiary)' }}>Packaging Specifications</h3>

                  {/* Sub-type selector */}
                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <div className="space-y-1.5">
                      <Label style={labelStyle}>Type *</Label>
                      <Select value={formData.pkg_sub_type} onValueChange={v => set('pkg_sub_type', v)}>
                        <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                        <SelectContent>{PKG_SUB_TYPES.map(st => <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    {showPkgField('material_type', formData.pkg_sub_type) && (
                      <div className="space-y-1.5">
                        <Label style={labelStyle}>Material</Label>
                        <Input value={formData.material_type} onChange={e => set('material_type', e.target.value)} placeholder="e.g., Poly, Kraft" style={inputStyle} />
                      </div>
                    )}
                    {showPkgField('color', formData.pkg_sub_type) && (
                      <div className="space-y-1.5">
                        <Label style={labelStyle}>Color</Label>
                        <Input value={formData.color} onChange={e => set('color', e.target.value)} placeholder="Clear" style={inputStyle} />
                      </div>
                    )}
                    {showPkgField('thickness', formData.pkg_sub_type) && (
                      <div className="space-y-1.5">
                        <Label style={labelStyle}>Thickness</Label>
                        <div className="flex gap-1">
                          <Input value={formData.thickness} onChange={e => set('thickness', e.target.value)} placeholder="0" style={{ ...inputStyle, width: '80px' }} />
                          <Select value={formData.thickness_unit} onValueChange={v => set('thickness_unit', v)}>
                            <SelectTrigger style={{ ...inputStyle, width: '80px' }}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mil">Mil</SelectItem>
                              <SelectItem value="gauge">Gauge</SelectItem>
                              <SelectItem value="mm">mm</SelectItem>
                              <SelectItem value="inches">in</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Dimensions */}
                  {(showPkgField('length', formData.pkg_sub_type) || showPkgField('diameter', formData.pkg_sub_type)) && (
                    <>
                      <Label style={{ ...labelStyle, marginBottom: '6px', display: 'block' }}>Dimensions (inches)</Label>
                      <div className="grid grid-cols-4 gap-3 mb-4" style={{ maxWidth: '60%' }}>
                        {showPkgField('length', formData.pkg_sub_type) && (
                          <div><Input value={formData.length} onChange={e => set('length', e.target.value)} placeholder="L" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Length</span></div>
                        )}
                        {showPkgField('width', formData.pkg_sub_type) && (
                          <div><Input value={formData.width} onChange={e => set('width', e.target.value)} placeholder="W" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Width</span></div>
                        )}
                        {showPkgField('height', formData.pkg_sub_type) && (
                          <div><Input value={formData.height} onChange={e => set('height', e.target.value)} placeholder="H" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Height</span></div>
                        )}
                        {showPkgField('diameter', formData.pkg_sub_type) && (
                          <div><Input value={formData.diameter} onChange={e => set('diameter', e.target.value)} placeholder="Dia" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Diameter</span></div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Roll specs */}
                  {showPkgField('roll_length', formData.pkg_sub_type) && (
                    <>
                      <Label style={{ ...labelStyle, marginBottom: '6px', display: 'block' }}>Roll Specs</Label>
                      <div className="grid grid-cols-4 gap-3 mb-4" style={{ maxWidth: '60%' }}>
                        <div><Input value={formData.roll_width} onChange={e => set('roll_width', e.target.value)} placeholder="W" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Width (in)</span></div>
                        <div><Input value={formData.roll_length} onChange={e => set('roll_length', e.target.value)} placeholder="L" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Length (ft)</span></div>
                        {showPkgField('rolls_per_case', formData.pkg_sub_type) && (
                          <div><Input type="number" value={formData.rolls_per_case} onChange={e => set('rolls_per_case', e.target.value)} placeholder="#" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Rolls/Case</span></div>
                        )}
                        {showPkgField('core_diameter', formData.pkg_sub_type) && (
                          <div><Input value={formData.core_diameter} onChange={e => set('core_diameter', e.target.value)} placeholder="3" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Core (in)</span></div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Count fields */}
                  {(showPkgField('pieces_per_case', formData.pkg_sub_type) || showPkgField('sheets_per_bundle', formData.pkg_sub_type)) && (
                    <div className="grid grid-cols-3 gap-3 mb-4" style={{ maxWidth: '60%' }}>
                      {showPkgField('pieces_per_case', formData.pkg_sub_type) && (
                        <div className="space-y-1.5"><Label style={labelStyle}>Pieces/Case</Label><Input type="number" value={formData.pieces_per_case} onChange={e => set('pieces_per_case', e.target.value)} placeholder="0" style={inputStyle} /></div>
                      )}
                      {showPkgField('sheets_per_bundle', formData.pkg_sub_type) && (
                        <div className="space-y-1.5"><Label style={labelStyle}>Sheets/Bundle</Label><Input type="number" value={formData.sheets_per_bundle} onChange={e => set('sheets_per_bundle', e.target.value)} placeholder="0" style={inputStyle} /></div>
                      )}
                      {showPkgField('weight_capacity_lbs', formData.pkg_sub_type) && (
                        <div className="space-y-1.5"><Label style={labelStyle}>Weight Cap (lbs)</Label><Input value={formData.weight_capacity_lbs} onChange={e => set('weight_capacity_lbs', e.target.value)} placeholder="0" style={inputStyle} /></div>
                      )}
                    </div>
                  )}

                  {/* Sub-type specific fields */}
                  {showPkgField('bubble_size', formData.pkg_sub_type) && (
                    <div className="grid grid-cols-3 gap-3 mb-4" style={{ maxWidth: '60%' }}>
                      <div className="space-y-1.5">
                        <Label style={labelStyle}>Bubble Size</Label>
                        <Select value={formData.bubble_size || 'none'} onValueChange={v => set('bubble_size', v === 'none' ? '' : v)}>
                          <SelectTrigger style={inputStyle}><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="3/16">3/16" (Small)</SelectItem>
                            <SelectItem value="5/16">5/16" (Medium)</SelectItem>
                            <SelectItem value="1/2">1/2" (Large)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  {showPkgField('perforated', formData.pkg_sub_type) && (
                    <div className="flex items-center gap-3 mb-4">
                      <Switch id="pkg_perforated" checked={formData.perforated} onCheckedChange={v => set('perforated', v)} />
                      <Label htmlFor="pkg_perforated" style={labelStyle}>Perforated</Label>
                      {formData.perforated && (
                        <Input value={formData.perforation_interval} onChange={e => set('perforation_interval', e.target.value)} placeholder="e.g., every 12 inches" style={{ ...inputStyle, width: '200px' }} />
                      )}
                    </div>
                  )}
                  {showPkgField('lip_style', formData.pkg_sub_type) && (
                    <div className="grid grid-cols-3 gap-3 mb-4" style={{ maxWidth: '60%' }}>
                      <div className="space-y-1.5">
                        <Label style={labelStyle}>Lip Style</Label>
                        <Select value={formData.lip_style || 'none'} onValueChange={v => set('lip_style', v === 'none' ? '' : v)}>
                          <SelectTrigger style={inputStyle}><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="resealable">Resealable</SelectItem>
                            <SelectItem value="ziplock">Zip-Lock</SelectItem>
                            <SelectItem value="flap">Flap</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  {showPkgField('density', formData.pkg_sub_type) && (
                    <div className="grid grid-cols-3 gap-3 mb-4" style={{ maxWidth: '40%' }}>
                      <div className="space-y-1.5"><Label style={labelStyle}>Density (lb/ft3)</Label><Input value={formData.density} onChange={e => set('density', e.target.value)} placeholder="0" style={inputStyle} /></div>
                    </div>
                  )}
                  {showPkgField('cells_x', formData.pkg_sub_type) && (
                    <div className="grid grid-cols-3 gap-3 mb-4" style={{ maxWidth: '40%' }}>
                      <div className="space-y-1.5"><Label style={labelStyle}>Cells Across (X)</Label><Input type="number" value={formData.cells_x} onChange={e => set('cells_x', e.target.value)} placeholder="0" style={inputStyle} /></div>
                      <div className="space-y-1.5"><Label style={labelStyle}>Cells Down (Y)</Label><Input type="number" value={formData.cells_y} onChange={e => set('cells_y', e.target.value)} placeholder="0" style={inputStyle} /></div>
                    </div>
                  )}
                  {showPkgField('tape_type', formData.pkg_sub_type) && (
                    <div className="grid grid-cols-3 gap-3 mb-4" style={{ maxWidth: '60%' }}>
                      <div className="space-y-1.5">
                        <Label style={labelStyle}>Tape Type</Label>
                        <Select value={formData.tape_type || 'none'} onValueChange={v => set('tape_type', v === 'none' ? '' : v)}>
                          <SelectTrigger style={inputStyle}><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="flatback">Flatback</SelectItem>
                            <SelectItem value="filament">Filament</SelectItem>
                            <SelectItem value="masking">Masking</SelectItem>
                            <SelectItem value="packing">Packing</SelectItem>
                            <SelectItem value="duct">Duct</SelectItem>
                            <SelectItem value="double_sided">Double-Sided</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  {showPkgField('adhesive_type', formData.pkg_sub_type) && (
                    <div className="grid grid-cols-3 gap-3 mb-4" style={{ maxWidth: '60%' }}>
                      <div className="space-y-1.5">
                        <Label style={labelStyle}>Adhesive Type</Label>
                        <Select value={formData.adhesive_type || 'none'} onValueChange={v => set('adhesive_type', v === 'none' ? '' : v)}>
                          <SelectTrigger style={inputStyle}><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="acrylic">Acrylic</SelectItem>
                            <SelectItem value="rubber">Rubber</SelectItem>
                            <SelectItem value="hot_melt">Hot Melt</SelectItem>
                            <SelectItem value="silicone">Silicone</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  {showPkgField('break_strength_lbs', formData.pkg_sub_type) && (
                    <div className="grid grid-cols-3 gap-3 mb-4" style={{ maxWidth: '40%' }}>
                      <div className="space-y-1.5"><Label style={labelStyle}>Break Strength (lbs)</Label><Input value={formData.break_strength_lbs} onChange={e => set('break_strength_lbs', e.target.value)} placeholder="0" style={inputStyle} /></div>
                    </div>
                  )}
                  {showPkgField('stretch_pct', formData.pkg_sub_type) && (
                    <div className="grid grid-cols-3 gap-3 mb-4" style={{ maxWidth: '40%' }}>
                      <div className="space-y-1.5"><Label style={labelStyle}>Pre-Stretch %</Label><Input type="number" value={formData.stretch_pct} onChange={e => set('stretch_pct', e.target.value)} placeholder="0" style={inputStyle} /></div>
                    </div>
                  )}
                  {showPkgField('inner_diameter', formData.pkg_sub_type) && (
                    <div className="grid grid-cols-3 gap-3 mb-4" style={{ maxWidth: '40%' }}>
                      <div className="space-y-1.5"><Label style={labelStyle}>Inner Diameter (in)</Label><Input value={formData.inner_diameter} onChange={e => set('inner_diameter', e.target.value)} placeholder="0" style={inputStyle} /></div>
                    </div>
                  )}
                  {showPkgField('lid_included', formData.pkg_sub_type) && (
                    <div className="flex items-center gap-2 mb-4">
                      <Switch id="pkg_lid" checked={formData.lid_included} onCheckedChange={v => set('lid_included', v)} />
                      <Label htmlFor="pkg_lid" style={labelStyle}>Lid Included</Label>
                    </div>
                  )}
                  {showPkgField('label_type', formData.pkg_sub_type) && (
                    <div className="grid grid-cols-3 gap-3 mb-4" style={{ maxWidth: '60%' }}>
                      <div className="space-y-1.5">
                        <Label style={labelStyle}>Label Type</Label>
                        <Select value={formData.label_type || 'none'} onValueChange={v => set('label_type', v === 'none' ? '' : v)}>
                          <SelectTrigger style={inputStyle}><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="thermal">Thermal Transfer</SelectItem>
                            <SelectItem value="direct_thermal">Direct Thermal</SelectItem>
                            <SelectItem value="laser">Laser</SelectItem>
                            <SelectItem value="inkjet">Inkjet</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {showPkgField('labels_per_roll', formData.pkg_sub_type) && (
                        <div className="space-y-1.5"><Label style={labelStyle}>Labels/Roll</Label><Input type="number" value={formData.labels_per_roll} onChange={e => set('labels_per_roll', e.target.value)} placeholder="0" style={inputStyle} /></div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Print Method (Corrugated only) ── */}
              {isCorrugated && (
                <div style={sectionStyle}>
                  <h3 className="text-[13px] font-semibold tracking-wide uppercase mb-4" style={{ color: 'var(--so-text-tertiary)' }}>Print Method</h3>
                  <div className="flex items-center gap-1 mb-4 rounded-lg p-1" style={{ background: 'var(--so-bg)', border: '1px solid var(--so-border-light)', width: 'fit-content' }}>
                    {PRINT_METHODS.map(pm => (
                      <button
                        key={pm.value}
                        type="button"
                        onClick={() => {
                          set('print_method', pm.value)
                          if (pm.value === 'unprinted') {
                            set('ink_colors', [])
                            set('panels_printed', '')
                            set('colors_printed', '')
                          }
                        }}
                        className="px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors"
                        style={{
                          background: formData.print_method === pm.value ? 'var(--so-surface)' : 'transparent',
                          color: formData.print_method === pm.value ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)',
                          boxShadow: formData.print_method === pm.value ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        }}
                      >
                        {pm.label}
                      </button>
                    ))}
                  </div>
                  {formData.print_method !== 'unprinted' && (
                    <div className="space-y-4">
                      {formData.print_method === 'printed' && (
                        <div className="grid grid-cols-2 gap-4" style={{ maxWidth: '50%' }}>
                          <div className="space-y-1.5">
                            <Label style={labelStyle}>Panels Printed</Label>
                            <Input type="number" min="0" value={formData.panels_printed} onChange={e => set('panels_printed', e.target.value)} placeholder="0" style={inputStyle} />
                          </div>
                          <div className="space-y-1.5">
                            <Label style={labelStyle}># of Colors</Label>
                            <Input type="number" min="0" max="8" value={formData.colors_printed} onChange={e => set('colors_printed', e.target.value)} placeholder="0" style={inputStyle} />
                          </div>
                        </div>
                      )}
                      {(formData.print_method !== 'printed' || colorCount > 0) && (
                        <div className="space-y-1.5">
                          <Label style={labelStyle}>Ink Colors</Label>
                          {formData.print_method === 'printed' ? (
                            <div className="flex flex-wrap gap-2">
                              {Array.from({ length: colorCount }).map((_, i) => (
                                <Input
                                  key={i}
                                  value={inkColors[i] || ''}
                                  onChange={e => {
                                    const updated = [...inkColors]
                                    updated[i] = e.target.value
                                    set('ink_colors', updated)
                                  }}
                                  placeholder={`Color ${i + 1}`}
                                  style={{ ...inputStyle, width: '140px' }}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-2">
                                {formData.ink_colors.map((color, i) => (
                                  <div key={i} className="flex items-center gap-1">
                                    <Input
                                      value={color}
                                      onChange={e => {
                                        const updated = [...formData.ink_colors]
                                        updated[i] = e.target.value
                                        set('ink_colors', updated)
                                      }}
                                      placeholder={`Color ${i + 1}`}
                                      style={{ ...inputStyle, width: '140px' }}
                                    />
                                    <button type="button" onClick={() => set('ink_colors', formData.ink_colors.filter((_, idx) => idx !== i))} className="p-1 rounded hover:bg-red-50" style={{ color: 'var(--so-text-tertiary)' }}>
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <button type="button" className={outlineBtnClass + ' !py-1 !px-2.5 text-[12px]'} style={outlineBtnStyle} onClick={() => set('ink_colors', [...formData.ink_colors, ''])}>
                                <Plus className="h-3.5 w-3.5 mr-1" /> Add Color
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Extra Info (Corrugated only) ── */}
              {isCorrugated && (
                <div style={sectionStyle}>
                  <h3 className="text-[13px] font-semibold tracking-wide uppercase mb-3" style={{ color: 'var(--so-text-tertiary)' }}>Extra Info</h3>
                  <button type="button" className={outlineBtnClass + ' !py-1 !px-2.5 text-[12px] mb-3'} style={outlineBtnStyle} onClick={addExtraInfo}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Info
                  </button>
                  <div className="space-y-3">
                    {formData.extra_info.map(line => (
                      <div key={line.id} className="flex items-start gap-3 rounded-lg px-3 py-2.5" style={{ background: 'var(--so-bg)', border: '1px solid var(--so-border-light)' }}>
                        <div className="space-y-1.5 w-[160px] shrink-0">
                          <Select value={line.type || 'none'} onValueChange={v => updateExtraInfo(line.id, { type: (v === 'none' ? '' : v) as ExtraInfoType | '', value: '', qty: '', hh_type: '', location: '', label: '' })}>
                            <SelectTrigger style={inputStyle}><SelectValue placeholder="Select type..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Select type...</SelectItem>
                              {EXTRA_INFO_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1 flex items-center gap-3">
                          {(line.type === 'gap_top' || line.type === 'gap_bot' || line.type === 'score' || line.type === 'perforation') && (
                            <Input value={line.value} onChange={e => updateExtraInfo(line.id, { value: e.target.value })} placeholder={line.type === 'score' ? 'e.g. 12 x 8' : 'e.g. 1/8"'} style={inputStyle} />
                          )}
                          {line.type === 'handhole' && (
                            <>
                              <Input type="number" min="0" value={line.qty} onChange={e => updateExtraInfo(line.id, { qty: e.target.value })} placeholder="Qty" style={{ ...inputStyle, width: '80px' }} className="shrink-0" />
                              <Select value={line.hh_type || 'none'} onValueChange={v => updateExtraInfo(line.id, { hh_type: v === 'none' ? '' : v })}>
                                <SelectTrigger style={{ ...inputStyle, width: '160px' }} className="shrink-0"><SelectValue placeholder="Type..." /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Select type...</SelectItem>
                                  {HANDHOLE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Input value={line.location} onChange={e => updateExtraInfo(line.id, { location: e.target.value })} placeholder="Location" style={inputStyle} />
                            </>
                          )}
                          {line.type === 'wra' && (
                            <div className="flex items-center gap-2 h-9">
                              <Switch checked={line.value === 'yes'} onCheckedChange={v => updateExtraInfo(line.id, { value: v ? 'yes' : 'no' })} />
                              <span className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>{line.value === 'yes' ? 'Yes' : 'No'}</span>
                            </div>
                          )}
                          {line.type === 'user_defined' && (
                            <>
                              <Input value={line.label} onChange={e => updateExtraInfo(line.id, { label: e.target.value })} placeholder="Label" style={{ ...inputStyle, width: '140px' }} className="shrink-0" />
                              <Input value={line.value} onChange={e => updateExtraInfo(line.id, { value: e.target.value })} placeholder="Value" style={inputStyle} />
                            </>
                          )}
                          {!line.type && (
                            <span className="text-[13px] italic" style={{ color: 'var(--so-text-tertiary)' }}>Select a type to configure</span>
                          )}
                        </div>
                        <button type="button" onClick={() => removeExtraInfo(line.id)} className="mt-1.5 p-1 rounded hover:bg-red-50" style={{ color: 'var(--so-text-tertiary)' }}>
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {formData.extra_info.length === 0 && (
                      <p className="text-[13px] italic py-2" style={{ color: 'var(--so-text-tertiary)' }}>No extra info added. Click "Add Info" to start.</p>
                    )}
                  </div>
                  {/* Keep Special Instructions below the line items */}
                  <div className="space-y-1.5 mt-4">
                    <Label style={labelStyle}>Special Instructions</Label>
                    <Textarea value={formData.special_instructions} onChange={e => set('special_instructions', e.target.value)} placeholder="Any additional manufacturing notes..." rows={2} style={inputStyle} />
                  </div>
                </div>
              )}

              {/* ── Companion Items ── */}
              <div style={sectionStyle}>
                <h3 className="text-[13px] font-semibold tracking-wide uppercase mb-4" style={{ color: 'var(--so-text-tertiary)' }}>Companion Items</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <Checkbox id="auto_plate" checked={autoCreatePlate} onCheckedChange={v => setAutoCreatePlate(v === true)} />
                    <Label htmlFor="auto_plate" className="text-sm cursor-pointer" style={{ color: 'var(--so-text-primary)' }}>
                      Auto-create matching <span className="font-semibold">Print Plate</span> item
                    </Label>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Checkbox id="auto_steel" checked={autoCreateSteel} onCheckedChange={v => setAutoCreateSteel(v === true)} />
                    <Label htmlFor="auto_steel" className="text-sm cursor-pointer" style={{ color: 'var(--so-text-primary)' }}>
                      Auto-create matching <span className="font-semibold">Steel</span> item
                    </Label>
                  </div>
                </div>
              </div>

              {/* ── Descriptions ── */}
              <div style={sectionStyle}>
                <h3 className="text-[13px] font-semibold tracking-wide uppercase mb-4" style={{ color: 'var(--so-text-tertiary)' }}>Descriptions</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label style={labelStyle}>Purchase Description {isCorrugated && <span style={{ color: 'var(--so-text-tertiary)', fontWeight: 400 }}>(Auto-generated)</span>}</Label>
                      {isCorrugated ? (
                        <Textarea
                          value={autoPurchDesc}
                          readOnly
                          rows={Math.max(3, autoPurchDesc.split('\n').length)}
                          className="font-mono text-[12px]"
                          style={{ ...inputStyle, opacity: 0.85, cursor: 'default', resize: 'none' }}
                        />
                      ) : (
                        <Textarea value={formData.purch_desc} onChange={e => set('purch_desc', e.target.value)} placeholder="Shows on POs..." rows={2} style={inputStyle} />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label style={labelStyle}>Sales Description</Label>
                      <Textarea value={formData.sell_desc} onChange={e => set('sell_desc', e.target.value)} placeholder="Shows on invoices..." rows={2} style={inputStyle} />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Unitizing / Pallet Info ── */}
              <div style={sectionStyle}>
                <h3 className="text-[13px] font-semibold tracking-wide uppercase mb-4" style={{ color: 'var(--so-text-tertiary)' }}>Unitizing / Pallet</h3>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="space-y-1.5"><Label style={labelStyle}>Units/Bundle</Label><Input type="number" value={formData.units_per_bundle} onChange={e => set('units_per_bundle', e.target.value)} placeholder="0" style={inputStyle} /></div>
                  <div className="space-y-1.5"><Label style={labelStyle}>Units/Pallet</Label><Input type="number" value={formData.units_per_pallet} onChange={e => set('units_per_pallet', e.target.value)} placeholder="0" style={inputStyle} /></div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5"><Label style={labelStyle}>Unit Height</Label><Input value={formData.unit_height} onChange={e => set('unit_height', e.target.value)} placeholder='inches' style={inputStyle} /></div>
                  <div className="space-y-1.5"><Label style={labelStyle}>Pallet Height</Label><Input value={formData.pallet_height} onChange={e => set('pallet_height', e.target.value)} placeholder='inches' style={inputStyle} /></div>
                  <div className="space-y-1.5"><Label style={labelStyle}>Pallet Footprint</Label><Input value={formData.pallet_footprint} onChange={e => set('pallet_footprint', e.target.value)} placeholder="48x40" style={inputStyle} /></div>
                </div>
              </div>

            </div>

            {/* ── Footer ── */}
            {error && (
              <div className="mx-6 mb-4 text-[13px] rounded-md px-3 py-2.5" style={{ background: 'var(--so-danger-bg)', color: 'var(--so-danger-text)' }}>{error}</div>
            )}
            <div className="flex justify-end gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--so-border-light)' }}>
              <button type="button" className={outlineBtnClass} style={outlineBtnStyle} onClick={() => navigate(-1)}>Cancel</button>
              <button
                type="submit"
                className={`${outlineBtnClass} ${isPending || !formData.base_uom ? 'opacity-50 pointer-events-none' : ''}`}
                style={outlineBtnStyle}
                disabled={isPending || !formData.base_uom}
                onClick={() => { printAfterCreate.current = true }}
              >
                <Printer className="h-3.5 w-3.5" />
                Create & Print
              </button>
              <button
                type="submit"
                className={`${primaryBtnClass} ${isPending || !formData.base_uom ? 'opacity-50 pointer-events-none' : ''}`}
                style={primaryBtnStyle}
                disabled={isPending || !formData.base_uom}
                onClick={() => { printAfterCreate.current = false }}
              >
                {isPending ? 'Creating...' : 'Create Item'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
