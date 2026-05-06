import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
  useUpdateItem,
  useUnitsOfMeasure,
  useCreateBoxItem,
  useUpdateBoxItem,
  useNextMspn,
  useCreatePackagingItem,
  useUpdatePackagingItem,
} from '@/api/items'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { useParties } from '@/api/parties'
import type {
  Item, ItemExtraInfoLine, PackagingSubType, DivisionType, ItemType,
  TestType, FluteType, PaperType, LifecycleStatus,
} from '@/types/api'
import {
  DIVISIONS, BOX_TYPES, PKG_SUB_TYPES,
  TEST_TYPES, FLUTE_TYPES, PAPER_TYPES,
  showPkgField,
} from '@/constants/items'

export type ItemFormMode = 'create' | 'request' | 'setup' | 'edit'

export type ItemFormSectionKey =
  | 'mspn'
  | 'corrugated'
  | 'packaging'
  | 'print'
  | 'extra-info'
  | 'companion'
  | 'descriptions'
  | 'unitizing'

interface ItemFormShellProps {
  mode: ItemFormMode
  initialItem?: Item | null
  hideSections?: ItemFormSectionKey[]
  primaryActionLabel?: string
  extraActions?: React.ReactNode
  onSuccess?: (item: Item) => void
  onCancel?: () => void
  /** When true, render only the form card (no page header / outer page wrapper). For embedding inside another page. */
  noPageChrome?: boolean
  pageTitle?: string
  pageDescription?: string
}

type ExtraInfoType = ItemExtraInfoLine['type']

interface ExtraInfoLine extends ItemExtraInfoLine {}

const EXTRA_INFO_TYPES: { value: Exclude<ExtraInfoType, ''>; label: string }[] = [
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

// ─── Fraction ↔ Decimal utilities (nearest 1/16") ──────────────────────────
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

interface FormData {
  name: string
  secondary_ident: string
  division: DivisionType | ''
  purch_desc: string
  sell_desc: string
  base_uom: string
  customer: string
  item_type: 'inventory' | 'crossdock' | 'non_stockable' | 'other_charge'
  is_active: boolean
  box_type: ItemType | ''
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
  pkg_sub_type: PackagingSubType | ''
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
  test: '', flute: '', paper: '', print_method: 'unprinted',
  panels_printed: '', colors_printed: '', ink_colors: [], length: '', width: '', height: '', blank_length: '', blank_width: '',
  out_per_rotary: '', units_per_bundle: '', units_per_pallet: '',
  unit_height: '', pallet_height: '', pallet_footprint: '',
  extra_info: [], special_instructions: '',
  pkg_sub_type: 'bags', material_type: '', color: '', thickness: '', thickness_unit: 'mil',
  diameter: '', pieces_per_case: '', weight_capacity_lbs: '', roll_length: '', roll_width: '',
  rolls_per_case: '', core_diameter: '', sheets_per_bundle: '', bubble_size: '', perforated: false,
  perforation_interval: '', lip_style: '', density: '', cells_x: '', cells_y: '',
  adhesive_type: '', tape_type: '', break_strength_lbs: '', stretch_pct: '', inner_diameter: '',
  lid_included: false, label_type: '', labels_per_roll: '',
}

/** Hydrate FormData from an existing Item (for setup/edit modes). */
function itemToFormData(item: Item): FormData {
  const corr = item.corrugated_details ?? null
  const dims = item.dimensions ?? null
  const pkg = item.packaging_details ?? null
  const extras = (item.extra_info_lines ?? []) as ExtraInfoLine[]

  const printMethod: PrintMethod = corr?.is_printed ? 'printed' : 'unprinted'
  const inkColors = corr?.ink_list
    ? corr.ink_list.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  return {
    ...initialFormData,
    name: item.name ?? '',
    secondary_ident: item.secondary_ident ?? '',
    division: item.division,
    purch_desc: item.purch_desc ?? '',
    sell_desc: item.sell_desc ?? '',
    base_uom: item.base_uom ? String(item.base_uom) : '',
    customer: item.customer ? String(item.customer) : '',
    item_type: item.item_type,
    is_active: item.is_active,
    box_type: (item.box_type && item.box_type !== 'corrugated' && item.box_type !== 'packaging' && item.box_type !== 'base'
      ? item.box_type
      : '') as ItemType | '',
    test: (corr?.test ?? '') as TestType | '',
    flute: (corr?.flute ?? '') as FluteType | '',
    paper: (corr?.paper ?? '') as PaperType | '',
    print_method: printMethod,
    panels_printed: corr?.panels_printed != null ? String(corr.panels_printed) : '',
    colors_printed: corr?.colors_printed != null ? String(corr.colors_printed) : '',
    ink_colors: inkColors,
    length: dims?.length ?? pkg?.length ?? '',
    width: dims?.width ?? pkg?.width ?? '',
    height: dims?.height ?? pkg?.height ?? '',
    blank_length: dims?.blank_length ?? '',
    blank_width: dims?.blank_width ?? '',
    out_per_rotary: dims?.out_per_rotary != null ? String(dims.out_per_rotary) : '',
    units_per_bundle: item.units_per_layer != null ? String(item.units_per_layer) : '',
    units_per_pallet: item.units_per_pallet != null ? String(item.units_per_pallet) : '',
    unit_height: item.unit_height ?? '',
    pallet_height: item.pallet_height ?? '',
    pallet_footprint: item.pallet_footprint ?? '',
    extra_info: extras.map((e, idx) => ({
      id: e.id ?? idx + 1,
      type: e.type ?? '',
      value: e.value ?? '',
      qty: e.qty ?? '',
      hh_type: e.hh_type ?? '',
      location: e.location ?? '',
      label: e.label ?? '',
    })),
    special_instructions: '',
    pkg_sub_type: (pkg?.sub_type ?? '') as PackagingSubType | '',
    material_type: pkg?.material_type ?? '',
    color: pkg?.color ?? '',
    thickness: pkg?.thickness ?? '',
    thickness_unit: pkg?.thickness_unit ?? 'mil',
    diameter: pkg?.diameter ?? '',
    pieces_per_case: pkg?.pieces_per_case != null ? String(pkg.pieces_per_case) : '',
    weight_capacity_lbs: pkg?.weight_capacity_lbs ?? '',
    roll_length: pkg?.roll_length ?? '',
    roll_width: pkg?.roll_width ?? '',
    rolls_per_case: pkg?.rolls_per_case != null ? String(pkg.rolls_per_case) : '',
    core_diameter: pkg?.core_diameter ?? '',
    sheets_per_bundle: pkg?.sheets_per_bundle != null ? String(pkg.sheets_per_bundle) : '',
    bubble_size: pkg?.bubble_size ?? '',
    perforated: !!pkg?.perforated,
    perforation_interval: pkg?.perforation_interval ?? '',
    lip_style: pkg?.lip_style ?? '',
    density: pkg?.density ?? '',
    cells_x: pkg?.cells_x != null ? String(pkg.cells_x) : '',
    cells_y: pkg?.cells_y != null ? String(pkg.cells_y) : '',
    adhesive_type: pkg?.adhesive_type ?? '',
    tape_type: pkg?.tape_type ?? '',
    break_strength_lbs: pkg?.break_strength_lbs ?? '',
    stretch_pct: pkg?.stretch_pct != null ? String(pkg.stretch_pct) : '',
    inner_diameter: pkg?.inner_diameter ?? '',
    lid_included: !!pkg?.lid_included,
    label_type: pkg?.label_type ?? '',
    labels_per_roll: pkg?.labels_per_roll != null ? String(pkg.labels_per_roll) : '',
  }
}

export default function ItemFormShell({
  mode, initialItem, hideSections = [], primaryActionLabel,
  extraActions, onSuccess, onCancel, noPageChrome = false,
  pageTitle, pageDescription,
}: ItemFormShellProps) {
  const navigate = useNavigate()

  const isCreating = mode === 'create' || mode === 'request'
  const isUpdating = mode === 'setup' || mode === 'edit'
  const isRequest = mode === 'request'
  const sectionHidden = (key: ItemFormSectionKey) => hideSections.includes(key)

  const [formData, setFormData] = useState<FormData>(() =>
    initialItem ? itemToFormData(initialItem) : initialFormData
  )
  const [error, setError] = useState('')
  const [dimDisplay, setDimDisplay] = useState<'fraction' | 'decimal'>('fraction')
  const [autoCreatePlate, setAutoCreatePlate] = useState(false)
  const [autoCreateSteel, setAutoCreateSteel] = useState(false)

  const extraInfoIdRef = useRef(
    (initialItem?.extra_info_lines?.length ?? 0) + 1
  )
  const printAfterCreate = useRef(false)

  // Re-hydrate when a new item is loaded (setup/edit mode after async fetch)
  useEffect(() => {
    if (initialItem) {
      setFormData(itemToFormData(initialItem))
      extraInfoIdRef.current = (initialItem.extra_info_lines?.length ?? 0) + 1
    }
  }, [initialItem?.id])

  const { data: nextMspn } = useNextMspn()
  const { data: uomData } = useUnitsOfMeasure()
  const { data: customersData } = useParties({ party_type: 'CUSTOMER' })

  const createItem = useCreateItem()
  const updateItem = useUpdateItem()
  const createBoxItem = useCreateBoxItem(
    (formData.box_type || 'rsc') as 'dc' | 'rsc' | 'hsc' | 'fol' | 'tele'
  )
  const updateBoxItem = useUpdateBoxItem(
    (formData.box_type || 'rsc') as 'dc' | 'rsc' | 'hsc' | 'fol' | 'tele'
  )
  const createPkgItem = useCreatePackagingItem()
  const updatePkgItem = useUpdatePackagingItem()

  const isCorrugated = formData.division === 'corrugated'
  const isPackaging = formData.division === 'packaging'
  const isDC = formData.box_type === 'dc'
  const isPending =
    createItem.isPending || createBoxItem.isPending || createPkgItem.isPending ||
    updateItem.isPending || updateBoxItem.isPending || updatePkgItem.isPending

  const uomList = uomData?.results ?? []
  const customerList = customersData?.results ?? []
  const colorCount = formData.colors_printed ? parseInt(formData.colors_printed) || 0 : 0

  // Sync ink_colors array size when color count changes
  const inkColors = useMemo(() => {
    const current = formData.ink_colors
    if (formData.print_method === 'printed') {
      if (colorCount <= 0) return []
      const arr = [...current]
      while (arr.length < colorCount) arr.push('')
      return arr.slice(0, colorCount)
    }
    return current
  }, [colorCount, formData.ink_colors, formData.print_method])

  // Auto-generate purchase description from form fields (corrugated only)
  const autoPurchDesc = useMemo(() => {
    if (!isCorrugated) return ''
    const lines: string[] = []
    if (formData.name) lines.push(formData.name)
    if (formData.secondary_ident) lines.push(formData.secondary_ident)
    if (lines.length > 0) lines.push('')

    const boxLabel = BOX_TYPES.find((b) => b.value === formData.box_type)?.value.toUpperCase() || ''
    const testLabel = TEST_TYPES.find((t) => t.value === formData.test)?.label || ''
    const fluteLabel = FLUTE_TYPES.find((f) => f.value === formData.flute)?.label || ''
    const paperLabel = PAPER_TYPES.find((p) => p.value === formData.paper)?.label || ''
    const specParts = [boxLabel, testLabel, fluteLabel, paperLabel].filter(Boolean)
    if (specParts.length > 0) lines.push(specParts.join(' '))

    if (isDC) {
      const dims = [formData.length, formData.width].filter(Boolean).join(' x ')
      if (dims) lines.push(dims)
      const blanks = [formData.blank_length, formData.blank_width].filter(Boolean)
      if (blanks.length > 0) lines.push(`Blank: ${blanks.join(' x ')}`)
    } else {
      const dims = [formData.length, formData.width, formData.height].filter(Boolean).join(' x ')
      if (dims) lines.push(dims)
    }

    if (formData.print_method !== 'unprinted') {
      const printParts = [formData.print_method.toUpperCase()]
      if (formData.panels_printed) printParts.push(`${formData.panels_printed} PANEL${Number(formData.panels_printed) !== 1 ? 'S' : ''}`)
      if (formData.colors_printed) printParts.push(`${formData.colors_printed} COLOR${Number(formData.colors_printed) !== 1 ? 'S' : ''}`)
      lines.push(printParts.join(' '))
    } else {
      lines.push('PLAIN')
    }

    const inks = inkColors.filter(Boolean).join(', ')
    if (inks) lines.push(inks)

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

  const handleDimBlur = (field: keyof FormData) => {
    const raw = formData[field] as string
    if (!raw) return
    const dec = fractionToDecimal(raw)
    if (dec !== null) {
      const rounded = roundTo16th(dec)
      if (dimDisplay === 'fraction') set(field, decimalToFraction(rounded))
      else set(field, String(rounded))
    }
  }

  const toggleDimDisplay = () => {
    const next = dimDisplay === 'fraction' ? 'decimal' : 'fraction'
    setDimDisplay(next)
    setFormData((prev) => {
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

  const set = (field: keyof FormData, value: any) => setFormData((prev) => ({ ...prev, [field]: value }))

  const addExtraInfo = () => {
    setFormData((prev) => ({
      ...prev,
      extra_info: [...prev.extra_info, {
        id: extraInfoIdRef.current++,
        type: '', value: '', qty: '', hh_type: '', location: '', label: '',
      }],
    }))
  }

  const updateExtraInfo = (id: number, updates: Partial<ExtraInfoLine>) => {
    setFormData((prev) => ({
      ...prev,
      extra_info: prev.extra_info.map((line) => line.id === id ? { ...line, ...updates } : line),
    }))
  }

  const removeExtraInfo = (id: number) => {
    setFormData((prev) => ({
      ...prev,
      extra_info: prev.extra_info.filter((line) => line.id !== id),
    }))
  }

  // ─── Submission ────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const effectivePurchDesc = isCorrugated ? autoPurchDesc : formData.purch_desc

    const basePayload: Record<string, any> = {
      name: formData.name,
      secondary_ident: formData.secondary_ident || '',
      division: formData.division,
      purch_desc: effectivePurchDesc || undefined,
      sell_desc: formData.sell_desc || undefined,
      base_uom: formData.base_uom ? Number(formData.base_uom) : undefined,
      customer: formData.customer ? Number(formData.customer) : null,
      item_type: formData.item_type,
      is_active: formData.is_active,
      units_per_layer: formData.units_per_bundle ? Number(formData.units_per_bundle) : null,
      units_per_pallet: formData.units_per_pallet ? Number(formData.units_per_pallet) : null,
      unit_height: formData.unit_height || null,
      pallet_height: formData.pallet_height || null,
      pallet_footprint: formData.pallet_footprint || undefined,
      extra_info_lines: formData.extra_info,
    }

    if (isCreating) {
      basePayload.sku = ''
      basePayload.lifecycle_status = 'draft' as LifecycleStatus
    }

    try {
      let result: Item | undefined

      if (isCorrugated) {
        const corrugatedPayload = {
          ...basePayload,
          test: formData.test || undefined,
          flute: formData.flute || undefined,
          paper: formData.paper || undefined,
          is_printed: formData.print_method !== 'unprinted',
          panels_printed: formData.panels_printed ? Number(formData.panels_printed) : null,
          colors_printed: formData.colors_printed ? Number(formData.colors_printed) : null,
          ink_list: inkColors.filter(Boolean).join(', ') || undefined,
          length: formData.length,
          width: formData.width,
          ...(isDC
            ? {
                blank_length: formData.blank_length || null,
                blank_width: formData.blank_width || null,
                out_per_rotary: formData.out_per_rotary ? Number(formData.out_per_rotary) : null,
              }
            : { height: formData.height }),
        }
        if (isCreating) {
          result = (await createBoxItem.mutateAsync(corrugatedPayload as any)) as Item
        } else if (initialItem) {
          result = (await updateBoxItem.mutateAsync({ id: initialItem.id, ...corrugatedPayload } as any)) as Item
        }
      } else if (isPackaging) {
        const st = formData.pkg_sub_type as PackagingSubType
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
        if (isCreating) {
          result = (await createPkgItem.mutateAsync(pkgPayload)) as Item
        } else if (initialItem) {
          result = (await updatePkgItem.mutateAsync({ id: initialItem.id, ...pkgPayload })) as Item
        }
      } else {
        if (isCreating) {
          result = (await createItem.mutateAsync(basePayload as Partial<Item>)) as Item
        } else if (initialItem) {
          result = (await updateItem.mutateAsync({ id: initialItem.id, ...basePayload } as any)) as Item
        }
      }

      if (printAfterCreate.current && result?.id) {
        window.open(`/api/v1/items/${result.id}/spec_sheet/`, '_blank')
      }

      // Companion items (create modes only)
      if (isCreating) {
        const companionPromises: Promise<unknown>[] = []
        if (autoCreatePlate) {
          companionPromises.push(createItem.mutateAsync({
            sku: '', name: `${formData.name} - Print Plate`, division: 'tooling',
            item_type: 'non_stockable', is_active: true,
            base_uom: formData.base_uom ? Number(formData.base_uom) : undefined,
            purch_desc: `Print plate for ${formData.name}`,
            sell_desc: `Print plate for ${formData.name}`,
          } as Partial<Item>))
        }
        if (autoCreateSteel) {
          companionPromises.push(createItem.mutateAsync({
            sku: '', name: `${formData.name} - Steel`, division: 'tooling',
            item_type: 'non_stockable', is_active: true,
            base_uom: formData.base_uom ? Number(formData.base_uom) : undefined,
            purch_desc: `Steel die for ${formData.name}`,
            sell_desc: `Steel die for ${formData.name}`,
          } as Partial<Item>))
        }
        if (companionPromises.length > 0) await Promise.all(companionPromises)
      }

      if (onSuccess && result) onSuccess(result)
      else navigate('/items')
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object' && msg) {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to save item'))
      }
    }
  }

  const inputStyle: React.CSSProperties = { borderColor: 'var(--so-border)', background: 'var(--so-surface)' }
  const labelStyle: React.CSSProperties = { color: 'var(--so-text-secondary)', fontSize: '13px', fontWeight: 500 }
  const sectionStyle: React.CSSProperties = { borderTop: '1px solid var(--so-border-light)', paddingTop: '20px', marginTop: '20px' }

  const defaultPrimaryLabel =
    isPending ? 'Saving...'
    : mode === 'request' ? 'Submit Request'
    : mode === 'create' ? 'Create Item'
    : 'Save Changes'

  const skuLabel = isUpdating && initialItem ? initialItem.sku : (nextMspn ?? 'MSPN-000001')
  const handleCancelClick = onCancel ?? (() => navigate(-1))

  const formContent = (
    <form onSubmit={handleSubmit}>
          <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-4 md:px-6 py-5 space-y-5">

              {/* ── Row 1: MSPN, Customer, Ident, Secondary Ident ── */}
              {!sectionHidden('mspn') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label style={labelStyle}>
                      MSPN {isCreating && <span style={{ color: 'var(--so-text-tertiary)', fontWeight: 400 }}>(Auto)</span>}
                    </Label>
                    <Input value={skuLabel} disabled className="font-mono bg-muted" style={{ ...inputStyle, opacity: 0.7, cursor: 'not-allowed' }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label style={labelStyle}>Customer</Label>
                    <Select value={formData.customer || 'none'} onValueChange={(v) => set('customer', v === 'none' ? '' : v)}>
                      <SelectTrigger style={inputStyle}><SelectValue placeholder="None (stock)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (stock item)</SelectItem>
                        {customerList.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.code} - {c.display_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label style={labelStyle}>Ident *</Label>
                    <Input value={formData.name} onChange={(e) => set('name', e.target.value)} placeholder="Ident" required style={inputStyle} />
                  </div>
                  <div className="space-y-1.5">
                    <Label style={labelStyle}>Secondary Ident</Label>
                    <Input value={formData.secondary_ident} onChange={(e) => set('secondary_ident', e.target.value)} placeholder="Secondary ident" style={inputStyle} />
                  </div>
                </div>
              )}

              {/* ── Row 2: Item Type, Division, UoM, Active ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label style={labelStyle}>Item Type</Label>
                  <Select value={formData.item_type} onValueChange={(v) => set('item_type', v)}>
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
                  <Select value={formData.division} onValueChange={(v) => set('division', v)} disabled={isUpdating}>
                    <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                    <SelectContent>{DIVISIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label style={labelStyle}>UoM *</Label>
                  <Select value={formData.base_uom} onValueChange={(v) => set('base_uom', v)}>
                    <SelectTrigger style={inputStyle}><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>{uomList.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.code} - {u.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label style={labelStyle}>Active Status</Label>
                  <div className="flex items-center gap-2 h-9 px-1">
                    <Switch id="is_active" checked={formData.is_active} onCheckedChange={(v) => set('is_active', v)} />
                    <Label htmlFor="is_active" className="text-sm" style={{ color: formData.is_active ? 'var(--so-success, #4a905c)' : 'var(--so-text-tertiary)' }}>
                      {formData.is_active ? 'Active' : 'Inactive'}
                    </Label>
                  </div>
                </div>
              </div>

              {/* ── Board Specifications (Corrugated only) ── */}
              {isCorrugated && !sectionHidden('corrugated') && (
                <div style={sectionStyle}>
                  <h3 className="text-[13px] font-semibold tracking-wide uppercase mb-4" style={{ color: 'var(--so-text-tertiary)' }}>Board Specifications</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="space-y-1.5">
                      <Label style={labelStyle}>Box Type *</Label>
                      <Select value={formData.box_type || ''} onValueChange={(v) => set('box_type', v)} disabled={isUpdating}>
                        <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                        <SelectContent>{BOX_TYPES.map((bt) => <SelectItem key={bt.value} value={bt.value}>{bt.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label style={labelStyle}>Test (ECT)</Label>
                      <Select value={formData.test || 'none'} onValueChange={(v) => set('test', v === 'none' ? '' : v)}>
                        <SelectTrigger style={inputStyle}><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent><SelectItem value="none">None</SelectItem>{TEST_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label style={labelStyle}>Flute</Label>
                      <Select value={formData.flute || 'none'} onValueChange={(v) => set('flute', v === 'none' ? '' : v)}>
                        <SelectTrigger style={inputStyle}><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent><SelectItem value="none">None</SelectItem>{FLUTE_TYPES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label style={labelStyle}>Paper</Label>
                      <Select value={formData.paper || 'none'} onValueChange={(v) => set('paper', v === 'none' ? '' : v)}>
                        <SelectTrigger style={inputStyle}><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent><SelectItem value="none">None</SelectItem>{PAPER_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-1.5">
                    <Label style={{ ...labelStyle, marginBottom: 0 }}>Dimensions (inches)</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px]" style={{ color: dimDisplay === 'fraction' ? 'var(--so-primary)' : 'var(--so-text-tertiary)' }}>Fraction</span>
                      <Switch checked={dimDisplay === 'decimal'} onCheckedChange={() => toggleDimDisplay()} />
                      <span className="text-[11px]" style={{ color: dimDisplay === 'decimal' ? 'var(--so-primary)' : 'var(--so-text-tertiary)' }}>Decimal</span>
                    </div>
                  </div>
                  {isDC ? (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div><Input value={formData.length} onChange={(e) => set('length', e.target.value)} onBlur={() => handleDimBlur('length')} placeholder="L" required style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Length</span></div>
                      <div><Input value={formData.width} onChange={(e) => set('width', e.target.value)} onBlur={() => handleDimBlur('width')} placeholder="W" required style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Width</span></div>
                      <div><Input value={formData.blank_length} onChange={(e) => set('blank_length', e.target.value)} onBlur={() => handleDimBlur('blank_length')} placeholder="BL" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Blank L</span></div>
                      <div><Input value={formData.blank_width} onChange={(e) => set('blank_width', e.target.value)} onBlur={() => handleDimBlur('blank_width')} placeholder="BW" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Blank W</span></div>
                      <div><Input value={formData.out_per_rotary} onChange={(e) => set('out_per_rotary', e.target.value)} placeholder="#" type="number" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}># Out</span></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div><Input value={formData.length} onChange={(e) => set('length', e.target.value)} onBlur={() => handleDimBlur('length')} placeholder="L" required style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Length</span></div>
                      <div><Input value={formData.width} onChange={(e) => set('width', e.target.value)} onBlur={() => handleDimBlur('width')} placeholder="W" required style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Width</span></div>
                      <div><Input value={formData.height} onChange={(e) => set('height', e.target.value)} onBlur={() => handleDimBlur('height')} placeholder="H" required style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Height</span></div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Packaging Specifications ── */}
              {isPackaging && !sectionHidden('packaging') && (
                <div style={sectionStyle}>
                  <h3 className="text-[13px] font-semibold tracking-wide uppercase mb-4" style={{ color: 'var(--so-text-tertiary)' }}>Packaging Specifications</h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="space-y-1.5">
                      <Label style={labelStyle}>Type *</Label>
                      <Select value={formData.pkg_sub_type || ''} onValueChange={(v) => set('pkg_sub_type', v)} disabled={isUpdating}>
                        <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                        <SelectContent>{PKG_SUB_TYPES.map((st) => <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    {showPkgField('material_type', formData.pkg_sub_type as PackagingSubType) && (
                      <div className="space-y-1.5">
                        <Label style={labelStyle}>Material</Label>
                        <Input value={formData.material_type} onChange={(e) => set('material_type', e.target.value)} placeholder="e.g., Poly, Kraft" style={inputStyle} />
                      </div>
                    )}
                    {showPkgField('color', formData.pkg_sub_type as PackagingSubType) && (
                      <div className="space-y-1.5">
                        <Label style={labelStyle}>Color</Label>
                        <Input value={formData.color} onChange={(e) => set('color', e.target.value)} placeholder="Clear" style={inputStyle} />
                      </div>
                    )}
                    {showPkgField('thickness', formData.pkg_sub_type as PackagingSubType) && (
                      <div className="space-y-1.5">
                        <Label style={labelStyle}>Thickness</Label>
                        <div className="flex gap-1">
                          <Input value={formData.thickness} onChange={(e) => set('thickness', e.target.value)} placeholder="0" style={{ ...inputStyle, width: '80px' }} />
                          <Select value={formData.thickness_unit} onValueChange={(v) => set('thickness_unit', v)}>
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

                  {(showPkgField('length', formData.pkg_sub_type as PackagingSubType) || showPkgField('diameter', formData.pkg_sub_type as PackagingSubType)) && (
                    <>
                      <Label style={{ ...labelStyle, marginBottom: '6px', display: 'block' }}>Dimensions (inches)</Label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        {showPkgField('length', formData.pkg_sub_type as PackagingSubType) && (
                          <div><Input value={formData.length} onChange={(e) => set('length', e.target.value)} placeholder="L" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Length</span></div>
                        )}
                        {showPkgField('width', formData.pkg_sub_type as PackagingSubType) && (
                          <div><Input value={formData.width} onChange={(e) => set('width', e.target.value)} placeholder="W" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Width</span></div>
                        )}
                        {showPkgField('height', formData.pkg_sub_type as PackagingSubType) && (
                          <div><Input value={formData.height} onChange={(e) => set('height', e.target.value)} placeholder="H" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Height</span></div>
                        )}
                        {showPkgField('diameter', formData.pkg_sub_type as PackagingSubType) && (
                          <div><Input value={formData.diameter} onChange={(e) => set('diameter', e.target.value)} placeholder="Dia" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Diameter</span></div>
                        )}
                      </div>
                    </>
                  )}

                  {showPkgField('roll_length', formData.pkg_sub_type as PackagingSubType) && (
                    <>
                      <Label style={{ ...labelStyle, marginBottom: '6px', display: 'block' }}>Roll Specs</Label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div><Input value={formData.roll_width} onChange={(e) => set('roll_width', e.target.value)} placeholder="W" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Width (in)</span></div>
                        <div><Input value={formData.roll_length} onChange={(e) => set('roll_length', e.target.value)} placeholder="L" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Length (ft)</span></div>
                        {showPkgField('rolls_per_case', formData.pkg_sub_type as PackagingSubType) && (
                          <div><Input type="number" value={formData.rolls_per_case} onChange={(e) => set('rolls_per_case', e.target.value)} placeholder="#" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Rolls/Case</span></div>
                        )}
                        {showPkgField('core_diameter', formData.pkg_sub_type as PackagingSubType) && (
                          <div><Input value={formData.core_diameter} onChange={(e) => set('core_diameter', e.target.value)} placeholder="3" style={inputStyle} /><span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>Core (in)</span></div>
                        )}
                      </div>
                    </>
                  )}

                  {(showPkgField('pieces_per_case', formData.pkg_sub_type as PackagingSubType) || showPkgField('sheets_per_bundle', formData.pkg_sub_type as PackagingSubType)) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                      {showPkgField('pieces_per_case', formData.pkg_sub_type as PackagingSubType) && (
                        <div className="space-y-1.5"><Label style={labelStyle}>Pieces/Case</Label><Input type="number" value={formData.pieces_per_case} onChange={(e) => set('pieces_per_case', e.target.value)} placeholder="0" style={inputStyle} /></div>
                      )}
                      {showPkgField('sheets_per_bundle', formData.pkg_sub_type as PackagingSubType) && (
                        <div className="space-y-1.5"><Label style={labelStyle}>Sheets/Bundle</Label><Input type="number" value={formData.sheets_per_bundle} onChange={(e) => set('sheets_per_bundle', e.target.value)} placeholder="0" style={inputStyle} /></div>
                      )}
                      {showPkgField('weight_capacity_lbs', formData.pkg_sub_type as PackagingSubType) && (
                        <div className="space-y-1.5"><Label style={labelStyle}>Weight Cap (lbs)</Label><Input value={formData.weight_capacity_lbs} onChange={(e) => set('weight_capacity_lbs', e.target.value)} placeholder="0" style={inputStyle} /></div>
                      )}
                    </div>
                  )}

                  {showPkgField('bubble_size', formData.pkg_sub_type as PackagingSubType) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                      <div className="space-y-1.5">
                        <Label style={labelStyle}>Bubble Size</Label>
                        <Select value={formData.bubble_size || 'none'} onValueChange={(v) => set('bubble_size', v === 'none' ? '' : v)}>
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
                  {showPkgField('perforated', formData.pkg_sub_type as PackagingSubType) && (
                    <div className="flex items-center gap-3 mb-4">
                      <Switch id="pkg_perforated" checked={formData.perforated} onCheckedChange={(v) => set('perforated', v)} />
                      <Label htmlFor="pkg_perforated" style={labelStyle}>Perforated</Label>
                      {formData.perforated && (
                        <Input value={formData.perforation_interval} onChange={(e) => set('perforation_interval', e.target.value)} placeholder="e.g., every 12 inches" style={{ ...inputStyle, width: '200px' }} />
                      )}
                    </div>
                  )}
                  {showPkgField('lip_style', formData.pkg_sub_type as PackagingSubType) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                      <div className="space-y-1.5">
                        <Label style={labelStyle}>Lip Style</Label>
                        <Select value={formData.lip_style || 'none'} onValueChange={(v) => set('lip_style', v === 'none' ? '' : v)}>
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
                  {showPkgField('density', formData.pkg_sub_type as PackagingSubType) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                      <div className="space-y-1.5"><Label style={labelStyle}>Density (lb/ft3)</Label><Input value={formData.density} onChange={(e) => set('density', e.target.value)} placeholder="0" style={inputStyle} /></div>
                    </div>
                  )}
                  {showPkgField('cells_x', formData.pkg_sub_type as PackagingSubType) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                      <div className="space-y-1.5"><Label style={labelStyle}>Cells Across (X)</Label><Input type="number" value={formData.cells_x} onChange={(e) => set('cells_x', e.target.value)} placeholder="0" style={inputStyle} /></div>
                      <div className="space-y-1.5"><Label style={labelStyle}>Cells Down (Y)</Label><Input type="number" value={formData.cells_y} onChange={(e) => set('cells_y', e.target.value)} placeholder="0" style={inputStyle} /></div>
                    </div>
                  )}
                  {showPkgField('tape_type', formData.pkg_sub_type as PackagingSubType) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                      <div className="space-y-1.5">
                        <Label style={labelStyle}>Tape Type</Label>
                        <Select value={formData.tape_type || 'none'} onValueChange={(v) => set('tape_type', v === 'none' ? '' : v)}>
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
                  {showPkgField('adhesive_type', formData.pkg_sub_type as PackagingSubType) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                      <div className="space-y-1.5">
                        <Label style={labelStyle}>Adhesive Type</Label>
                        <Select value={formData.adhesive_type || 'none'} onValueChange={(v) => set('adhesive_type', v === 'none' ? '' : v)}>
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
                  {showPkgField('break_strength_lbs', formData.pkg_sub_type as PackagingSubType) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                      <div className="space-y-1.5"><Label style={labelStyle}>Break Strength (lbs)</Label><Input value={formData.break_strength_lbs} onChange={(e) => set('break_strength_lbs', e.target.value)} placeholder="0" style={inputStyle} /></div>
                    </div>
                  )}
                  {showPkgField('stretch_pct', formData.pkg_sub_type as PackagingSubType) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                      <div className="space-y-1.5"><Label style={labelStyle}>Pre-Stretch %</Label><Input type="number" value={formData.stretch_pct} onChange={(e) => set('stretch_pct', e.target.value)} placeholder="0" style={inputStyle} /></div>
                    </div>
                  )}
                  {showPkgField('inner_diameter', formData.pkg_sub_type as PackagingSubType) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                      <div className="space-y-1.5"><Label style={labelStyle}>Inner Diameter (in)</Label><Input value={formData.inner_diameter} onChange={(e) => set('inner_diameter', e.target.value)} placeholder="0" style={inputStyle} /></div>
                    </div>
                  )}
                  {showPkgField('lid_included', formData.pkg_sub_type as PackagingSubType) && (
                    <div className="flex items-center gap-2 mb-4">
                      <Switch id="pkg_lid" checked={formData.lid_included} onCheckedChange={(v) => set('lid_included', v)} />
                      <Label htmlFor="pkg_lid" style={labelStyle}>Lid Included</Label>
                    </div>
                  )}
                  {showPkgField('label_type', formData.pkg_sub_type as PackagingSubType) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                      <div className="space-y-1.5">
                        <Label style={labelStyle}>Label Type</Label>
                        <Select value={formData.label_type || 'none'} onValueChange={(v) => set('label_type', v === 'none' ? '' : v)}>
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
                      {showPkgField('labels_per_roll', formData.pkg_sub_type as PackagingSubType) && (
                        <div className="space-y-1.5"><Label style={labelStyle}>Labels/Roll</Label><Input type="number" value={formData.labels_per_roll} onChange={(e) => set('labels_per_roll', e.target.value)} placeholder="0" style={inputStyle} /></div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Print Method (Corrugated only) ── */}
              {isCorrugated && !sectionHidden('print') && (
                <div style={sectionStyle}>
                  <h3 className="text-[13px] font-semibold tracking-wide uppercase mb-4" style={{ color: 'var(--so-text-tertiary)' }}>Print Method</h3>
                  <div className="flex flex-wrap items-center gap-1 mb-4 rounded-lg p-1" style={{ background: 'var(--so-bg)', border: '1px solid var(--so-border-light)' }}>
                    {PRINT_METHODS.map((pm) => (
                      <button
                        key={pm.value} type="button"
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label style={labelStyle}>Panels Printed</Label>
                            <Input type="number" min="0" value={formData.panels_printed} onChange={(e) => set('panels_printed', e.target.value)} placeholder="0" style={inputStyle} />
                          </div>
                          <div className="space-y-1.5">
                            <Label style={labelStyle}># of Colors</Label>
                            <Input type="number" min="0" max="8" value={formData.colors_printed} onChange={(e) => set('colors_printed', e.target.value)} placeholder="0" style={inputStyle} />
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
                                  onChange={(e) => {
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
                                {formData.ink_colors.map((c, i) => (
                                  <div key={i} className="flex items-center gap-1">
                                    <Input
                                      value={c}
                                      onChange={(e) => {
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
              {isCorrugated && !sectionHidden('extra-info') && (
                <div style={sectionStyle}>
                  <h3 className="text-[13px] font-semibold tracking-wide uppercase mb-3" style={{ color: 'var(--so-text-tertiary)' }}>Extra Info</h3>
                  <button type="button" className={outlineBtnClass + ' !py-1 !px-2.5 text-[12px] mb-3'} style={outlineBtnStyle} onClick={addExtraInfo}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Info
                  </button>
                  <div className="space-y-3">
                    {formData.extra_info.map((line) => (
                      <div key={line.id} className="flex items-start gap-3 rounded-lg px-3 py-2.5" style={{ background: 'var(--so-bg)', border: '1px solid var(--so-border-light)' }}>
                        <div className="space-y-1.5 w-[160px] shrink-0">
                          <Select value={line.type || 'none'} onValueChange={(v) => updateExtraInfo(line.id, { type: (v === 'none' ? '' : v) as ExtraInfoType, value: '', qty: '', hh_type: '', location: '', label: '' })}>
                            <SelectTrigger style={inputStyle}><SelectValue placeholder="Select type..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Select type...</SelectItem>
                              {EXTRA_INFO_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1 flex items-center gap-3">
                          {(line.type === 'gap_top' || line.type === 'gap_bot' || line.type === 'score' || line.type === 'perforation') && (
                            <Input value={line.value} onChange={(e) => updateExtraInfo(line.id, { value: e.target.value })} placeholder={line.type === 'score' ? 'e.g. 12 x 8' : 'e.g. 1/8"'} style={inputStyle} />
                          )}
                          {line.type === 'handhole' && (
                            <>
                              <Input type="number" min="0" value={line.qty} onChange={(e) => updateExtraInfo(line.id, { qty: e.target.value })} placeholder="Qty" style={{ ...inputStyle, width: '80px' }} className="shrink-0" />
                              <Select value={line.hh_type || 'none'} onValueChange={(v) => updateExtraInfo(line.id, { hh_type: v === 'none' ? '' : v })}>
                                <SelectTrigger style={{ ...inputStyle, width: '160px' }} className="shrink-0"><SelectValue placeholder="Type..." /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Select type...</SelectItem>
                                  {HANDHOLE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Input value={line.location} onChange={(e) => updateExtraInfo(line.id, { location: e.target.value })} placeholder="Location" style={inputStyle} />
                            </>
                          )}
                          {line.type === 'wra' && (
                            <div className="flex items-center gap-2 h-9">
                              <Switch checked={line.value === 'yes'} onCheckedChange={(v) => updateExtraInfo(line.id, { value: v ? 'yes' : 'no' })} />
                              <span className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>{line.value === 'yes' ? 'Yes' : 'No'}</span>
                            </div>
                          )}
                          {line.type === 'user_defined' && (
                            <>
                              <Input value={line.label} onChange={(e) => updateExtraInfo(line.id, { label: e.target.value })} placeholder="Label" style={{ ...inputStyle, width: '140px' }} className="shrink-0" />
                              <Input value={line.value} onChange={(e) => updateExtraInfo(line.id, { value: e.target.value })} placeholder="Value" style={inputStyle} />
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
                  <div className="space-y-1.5 mt-4">
                    <Label style={labelStyle}>Special Instructions</Label>
                    <Textarea value={formData.special_instructions} onChange={(e) => set('special_instructions', e.target.value)} placeholder="Any additional manufacturing notes..." rows={2} style={inputStyle} />
                  </div>
                </div>
              )}

              {/* ── Companion Items ── */}
              {isCreating && !sectionHidden('companion') && (
                <div style={sectionStyle}>
                  <h3 className="text-[13px] font-semibold tracking-wide uppercase mb-4" style={{ color: 'var(--so-text-tertiary)' }}>Companion Items</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5">
                      <Checkbox id="auto_plate" checked={autoCreatePlate} onCheckedChange={(v) => setAutoCreatePlate(v === true)} />
                      <Label htmlFor="auto_plate" className="text-sm cursor-pointer" style={{ color: 'var(--so-text-primary)' }}>
                        Auto-create matching <span className="font-semibold">Print Plate</span> item
                      </Label>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Checkbox id="auto_steel" checked={autoCreateSteel} onCheckedChange={(v) => setAutoCreateSteel(v === true)} />
                      <Label htmlFor="auto_steel" className="text-sm cursor-pointer" style={{ color: 'var(--so-text-primary)' }}>
                        Auto-create matching <span className="font-semibold">Steel</span> item
                      </Label>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Descriptions ── */}
              {!sectionHidden('descriptions') && (
                <div style={sectionStyle}>
                  <h3 className="text-[13px] font-semibold tracking-wide uppercase mb-4" style={{ color: 'var(--so-text-tertiary)' }}>Descriptions</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label style={labelStyle}>Purchase Description {isCorrugated && <span style={{ color: 'var(--so-text-tertiary)', fontWeight: 400 }}>(Auto-generated)</span>}</Label>
                        {isCorrugated ? (
                          <Textarea value={autoPurchDesc} readOnly rows={Math.max(3, autoPurchDesc.split('\n').length)} className="font-mono text-[12px]" style={{ ...inputStyle, opacity: 0.85, cursor: 'default', resize: 'none' }} />
                        ) : (
                          <Textarea value={formData.purch_desc} onChange={(e) => set('purch_desc', e.target.value)} placeholder="Shows on POs..." rows={2} style={inputStyle} />
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label style={labelStyle}>Sales Description</Label>
                        <Textarea value={formData.sell_desc} onChange={(e) => set('sell_desc', e.target.value)} placeholder="Shows on invoices..." rows={2} style={inputStyle} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Unitizing / Pallet ── */}
              {!sectionHidden('unitizing') && (
                <div style={sectionStyle}>
                  <h3 className="text-[13px] font-semibold tracking-wide uppercase mb-4" style={{ color: 'var(--so-text-tertiary)' }}>Unitizing / Pallet</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <div className="space-y-1.5"><Label style={labelStyle}>Units/Bundle</Label><Input type="number" value={formData.units_per_bundle} onChange={(e) => set('units_per_bundle', e.target.value)} placeholder="0" style={inputStyle} /></div>
                    <div className="space-y-1.5"><Label style={labelStyle}>Units/Pallet</Label><Input type="number" value={formData.units_per_pallet} onChange={(e) => set('units_per_pallet', e.target.value)} placeholder="0" style={inputStyle} /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5"><Label style={labelStyle}>Unit Height</Label><Input value={formData.unit_height} onChange={(e) => set('unit_height', e.target.value)} placeholder='inches' style={inputStyle} /></div>
                    <div className="space-y-1.5"><Label style={labelStyle}>Pallet Height</Label><Input value={formData.pallet_height} onChange={(e) => set('pallet_height', e.target.value)} placeholder='inches' style={inputStyle} /></div>
                    <div className="space-y-1.5"><Label style={labelStyle}>Pallet Footprint</Label><Input value={formData.pallet_footprint} onChange={(e) => set('pallet_footprint', e.target.value)} placeholder="48x40" style={inputStyle} /></div>
                  </div>
                </div>
              )}

            </div>

            {/* ── Footer ── */}
            {error && (
              <div className="mx-6 mb-4 text-[13px] rounded-md px-3 py-2.5" style={{ background: 'var(--so-danger-bg)', color: 'var(--so-danger-text)' }}>{error}</div>
            )}
            <div className="flex flex-wrap justify-end gap-2 px-6 py-4" style={{ borderTop: '1px solid var(--so-border-light)' }}>
              <button type="button" className={outlineBtnClass} style={outlineBtnStyle} onClick={handleCancelClick}>Cancel</button>
              {extraActions}
              {isCreating && (
                <button
                  type="submit"
                  className={`${outlineBtnClass} ${isPending || !formData.base_uom ? 'opacity-50 pointer-events-none' : ''}`}
                  style={outlineBtnStyle}
                  disabled={isPending || !formData.base_uom}
                  onClick={() => { printAfterCreate.current = true }}
                >
                  <Printer className="h-3.5 w-3.5" />
                  {isRequest ? 'Submit & Print' : 'Create & Print'}
                </button>
              )}
              <button
                type="submit"
                className={`${primaryBtnClass} ${isPending || !formData.base_uom ? 'opacity-50 pointer-events-none' : ''}`}
                style={primaryBtnStyle}
                disabled={isPending || !formData.base_uom}
                onClick={() => { printAfterCreate.current = false }}
              >
                {primaryActionLabel ?? defaultPrimaryLabel}
              </button>
            </div>
          </div>
        </form>
  )

  if (noPageChrome) {
    return formContent
  }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[860px] mx-auto px-4 md:px-8 py-7 pb-16">
        {pageTitle && (
          <div className="flex items-center gap-4 mb-7 animate-in">
            <button type="button" className={outlineBtnClass + ' !px-2'} style={outlineBtnStyle} onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>{pageTitle}</h1>
              {pageDescription && (
                <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>{pageDescription}</p>
              )}
            </div>
          </div>
        )}
        {formContent}
      </div>
    </div>
  )
}
