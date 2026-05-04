import { useState, useEffect } from 'react'
import { useForm, Controller, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { itemSchema, type ItemFormData } from '@/schemas'
import { FormField } from '@/components/ui/form-field'
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
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  useCreateItem,
  useUpdateItem,
  useUnitsOfMeasure,
  useCreateBoxItem,
  useUpdateBoxItem,
  useBoxItem,
  useCorrugatedFeatures,
  useCreatePackagingItem,
  useUpdatePackagingItem,
  usePackagingItem,
} from '@/api/items'
import { useParties } from '@/api/parties'
import type { Item, CorrugatedFeature } from '@/types/api'
import {
  DIVISIONS, BOX_TYPES, PKG_SUB_TYPES,
  TEST_TYPES, FLUTE_TYPES, PAPER_TYPES,
  showPkgField,
} from '@/constants/items'

interface ItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: Item | null
}

const defaultValues: ItemFormData = {
  sku: '',
  name: '',
  division: 'misc',
  description: '',
  purch_desc: '',
  sell_desc: '',
  base_uom: '',
  customer: '',
  item_type: 'inventory',
  is_active: true,
  box_type: 'rsc',
  test: '',
  flute: '',
  paper: '',
  is_printed: false,
  panels_printed: '',
  colors_printed: '',
  ink_list: '',
  length: '',
  width: '',
  height: '',
  blank_length: '',
  blank_width: '',
  out_per_rotary: '',
  // Packaging
  pkg_sub_type: 'bags',
  material_type: '',
  color: '',
  thickness: '',
  thickness_unit: 'mil',
  diameter: '',
  pieces_per_case: '',
  weight_capacity_lbs: '',
  roll_length: '',
  roll_width: '',
  rolls_per_case: '',
  core_diameter: '',
  sheets_per_bundle: '',
  bubble_size: '',
  perforated: false,
  perforation_interval: '',
  lip_style: '',
  density: '',
  cells_x: '',
  cells_y: '',
  adhesive_type: '',
  tape_type: '',
  break_strength_lbs: '',
  stretch_pct: '',
  inner_diameter: '',
  lid_included: false,
  label_type: '',
  labels_per_roll: '',
  // Unitizing
  units_per_layer: '',
  layers_per_pallet: '',
  units_per_pallet: '',
  unit_height: '',
  pallet_height: '',
  pallet_footprint: '',
}

// Feature selection state for M2M editing
interface FeatureSelection {
  featureId: number
  selected: boolean
  details: string
}

export function ItemDialog({ open, onOpenChange, item }: ItemDialogProps) {
  const [openSections, setOpenSections] = useState({
    descriptions: false,
    printing: false,
    unitizing: false,
    features: false,
    packagingSpecs: false,
  })
  const [featureSelections, setFeatureSelections] = useState<FeatureSelection[]>([])

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema) as Resolver<ItemFormData>,
    defaultValues,
  })

  const { data: uomData } = useUnitsOfMeasure()
  const { data: customersData } = useParties({ party_type: 'CUSTOMER' })
  const { data: featuresData } = useCorrugatedFeatures()

  // Determine if we need to fetch corrugated item data
  const boxTypes = ['dc', 'rsc', 'hsc', 'fol', 'tele'] as const
  const itemBoxType = item?.box_type && boxTypes.includes(item.box_type as typeof boxTypes[number])
    ? (item.box_type as 'dc' | 'rsc' | 'hsc' | 'fol' | 'tele')
    : null

  // Fetch full corrugated item data when editing a corrugated item
  const { data: fullBoxItem } = useBoxItem(itemBoxType, item?.id ?? null)

  // Fetch full packaging item data when editing a packaging item
  const isEditingPackaging = item?.box_type === 'packaging' || item?.division === 'packaging'
  const { data: fullPkgItem } = usePackagingItem(isEditingPackaging ? item?.id ?? null : null)

  const division = watch('division')
  const boxType = watch('box_type')
  const pkgSubType = watch('pkg_sub_type')
  const isPrinted = watch('is_printed')

  const createItem = useCreateItem()
  const updateItem = useUpdateItem()
  const createBoxItem = useCreateBoxItem(boxType as 'dc' | 'rsc' | 'hsc' | 'fol' | 'tele')
  const updateBoxItem = useUpdateBoxItem(boxType as 'dc' | 'rsc' | 'hsc' | 'fol' | 'tele')
  const createPkgItem = useCreatePackagingItem()
  const updatePkgItem = useUpdatePackagingItem()

  const isEditing = !!item
  const isCorrugated = division === 'corrugated'
  const isPackaging = division === 'packaging'
  const isDC = boxType === 'dc'

  useEffect(() => {
    if (item) {
      // Use fullBoxItem or fullPkgItem data if available, otherwise use item
      const sourceData = fullPkgItem ?? fullBoxItem ?? item
      const itemAny = sourceData as any
      reset({
        sku: sourceData.sku,
        name: sourceData.name,
        division: sourceData.division || 'misc',
        description: sourceData.description ?? '',
        purch_desc: sourceData.purch_desc ?? '',
        sell_desc: sourceData.sell_desc ?? '',
        base_uom: String(sourceData.base_uom),
        customer: sourceData.customer ? String(sourceData.customer) : '',
        item_type: sourceData.item_type || 'inventory',
        is_active: sourceData.is_active,
        box_type: item.box_type && boxTypes.includes(item.box_type as typeof boxTypes[number])
          ? item.box_type
          : 'rsc',
        test: itemAny.test ?? '',
        flute: itemAny.flute ?? '',
        paper: itemAny.paper ?? '',
        is_printed: itemAny.is_printed ?? false,
        panels_printed: itemAny.panels_printed?.toString() ?? '',
        colors_printed: itemAny.colors_printed?.toString() ?? '',
        ink_list: itemAny.ink_list ?? '',
        length: itemAny.length?.toString() ?? '',
        width: itemAny.width?.toString() ?? '',
        height: itemAny.height?.toString() ?? '',
        blank_length: itemAny.blank_length?.toString() ?? '',
        blank_width: itemAny.blank_width?.toString() ?? '',
        out_per_rotary: itemAny.out_per_rotary?.toString() ?? '',
        // Packaging fields
        pkg_sub_type: itemAny.sub_type ?? 'bags',
        material_type: itemAny.material_type ?? '',
        color: itemAny.color ?? '',
        thickness: itemAny.thickness?.toString() ?? '',
        thickness_unit: itemAny.thickness_unit ?? 'mil',
        diameter: itemAny.diameter?.toString() ?? '',
        pieces_per_case: itemAny.pieces_per_case?.toString() ?? '',
        weight_capacity_lbs: itemAny.weight_capacity_lbs?.toString() ?? '',
        roll_length: itemAny.roll_length?.toString() ?? '',
        roll_width: itemAny.roll_width?.toString() ?? '',
        rolls_per_case: itemAny.rolls_per_case?.toString() ?? '',
        core_diameter: itemAny.core_diameter?.toString() ?? '',
        sheets_per_bundle: itemAny.sheets_per_bundle?.toString() ?? '',
        bubble_size: itemAny.bubble_size ?? '',
        perforated: itemAny.perforated ?? false,
        perforation_interval: itemAny.perforation_interval ?? '',
        lip_style: itemAny.lip_style ?? '',
        density: itemAny.density?.toString() ?? '',
        cells_x: itemAny.cells_x?.toString() ?? '',
        cells_y: itemAny.cells_y?.toString() ?? '',
        adhesive_type: itemAny.adhesive_type ?? '',
        tape_type: itemAny.tape_type ?? '',
        break_strength_lbs: itemAny.break_strength_lbs?.toString() ?? '',
        stretch_pct: itemAny.stretch_pct?.toString() ?? '',
        inner_diameter: itemAny.inner_diameter?.toString() ?? '',
        lid_included: itemAny.lid_included ?? false,
        label_type: itemAny.label_type ?? '',
        labels_per_roll: itemAny.labels_per_roll?.toString() ?? '',
        // Unitizing
        units_per_layer: sourceData.units_per_layer?.toString() ?? '',
        layers_per_pallet: sourceData.layers_per_pallet?.toString() ?? '',
        units_per_pallet: sourceData.units_per_pallet?.toString() ?? '',
        unit_height: sourceData.unit_height ?? '',
        pallet_height: sourceData.pallet_height ?? '',
        pallet_footprint: sourceData.pallet_footprint ?? '',
      })
      // Initialize feature selections from existing item features
      const itemAnyFeatures = (fullBoxItem ?? item) as any
      const existingFeatures: { feature: number; details: string }[] = itemAnyFeatures?.item_features ?? []
      if (featuresData?.results) {
        setFeatureSelections(
          featuresData.results.map((f: CorrugatedFeature) => {
            const existing = existingFeatures.find((ef) => ef.feature === f.id)
            return {
              featureId: f.id,
              selected: !!existing,
              details: existing?.details ?? '',
            }
          })
        )
      }
    } else {
      reset(defaultValues)
      // Reset feature selections for new items
      if (featuresData?.results) {
        setFeatureSelections(
          featuresData.results.map((f: CorrugatedFeature) => ({
            featureId: f.id,
            selected: false,
            details: '',
          }))
        )
      }
    }
  }, [item, fullBoxItem, fullPkgItem, open, reset, featuresData])

  const onSubmit = async (formData: ItemFormData) => {
    // Build payload based on division and box type
    const basePayload = {
      sku: formData.sku,
      name: formData.name,
      division: formData.division,
      description: formData.description || undefined,
      purch_desc: formData.purch_desc || undefined,
      sell_desc: formData.sell_desc || undefined,
      base_uom: Number(formData.base_uom),
      customer: formData.customer ? Number(formData.customer) : null,
      item_type: formData.item_type,
      is_active: formData.is_active,
      units_per_layer: formData.units_per_layer ? Number(formData.units_per_layer) : null,
      layers_per_pallet: formData.layers_per_pallet ? Number(formData.layers_per_pallet) : null,
      units_per_pallet: formData.units_per_pallet ? Number(formData.units_per_pallet) : null,
      unit_height: formData.unit_height || null,
      pallet_height: formData.pallet_height || null,
      pallet_footprint: formData.pallet_footprint || undefined,
    }

    try {
      if (isCorrugated) {
        // Corrugated item payload
        const selectedFeatures = featureSelections
          .filter((f) => f.selected)
          .map((f) => ({ feature: f.featureId, details: f.details }))

        const corrugatedPayload = {
          ...basePayload,
          test: formData.test || undefined,
          flute: formData.flute || undefined,
          paper: formData.paper || undefined,
          is_printed: formData.is_printed,
          panels_printed: formData.panels_printed ? Number(formData.panels_printed) : null,
          colors_printed: formData.colors_printed ? Number(formData.colors_printed) : null,
          ink_list: formData.ink_list || undefined,
          length: formData.length,
          width: formData.width,
          ...(isDC
            ? {
                blank_length: formData.blank_length || null,
                blank_width: formData.blank_width || null,
                out_per_rotary: formData.out_per_rotary ? Number(formData.out_per_rotary) : null,
              }
            : {
                height: formData.height,
              }),
          item_features: selectedFeatures,
        }

        if (isEditing && item) {
          await updateBoxItem.mutateAsync({ id: item.id, ...corrugatedPayload } as any)
        } else {
          await createBoxItem.mutateAsync(corrugatedPayload as any)
        }
      } else if (isPackaging) {
        // Packaging item payload — only send fields relevant to the sub-type
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

        if (isEditing && item) {
          await updatePkgItem.mutateAsync({ id: item.id, ...pkgPayload })
        } else {
          await createPkgItem.mutateAsync(pkgPayload)
        }
      } else {
        // Base item
        if (isEditing && item) {
          await updateItem.mutateAsync({ id: item.id, ...basePayload } as any)
        } else {
          await createItem.mutateAsync(basePayload as any)
        }
      }
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save item:', error)
    }
  }

  const isPending =
    createItem.isPending ||
    updateItem.isPending ||
    createBoxItem.isPending ||
    updateBoxItem.isPending ||
    createPkgItem.isPending ||
    updatePkgItem.isPending

  const uomList = uomData?.results ?? []
  const customerList = customersData?.results ?? []

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Item' : 'Add Item'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit as any)}>
          <div className="grid gap-4 py-4">
            {/* Division & Box Type / Pkg Sub-Type */}
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Division" required error={errors.division}>
                <Controller
                  name="division"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIVISIONS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              {isCorrugated && (
                <FormField label="Box Type" required error={errors.box_type}>
                  <Controller
                    name="box_type"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BOX_TYPES.map((bt) => (
                            <SelectItem key={bt.value} value={bt.value}>
                              {bt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
              )}
              {isPackaging && (
                <FormField label="Type" required error={errors.pkg_sub_type}>
                  <Controller
                    name="pkg_sub_type"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PKG_SUB_TYPES.map((st) => (
                            <SelectItem key={st.value} value={st.value}>
                              {st.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
              )}
            </div>

            {/* MSPN & UOM */}
            <div className="grid grid-cols-2 gap-4">
              <FormField label="MSPN" required error={errors.sku}>
                <Input
                  {...register('sku')}
                  placeholder="ITEM-001"
                  className="font-mono"
                />
              </FormField>
              <FormField label="Unit of Measure" required error={errors.base_uom}>
                <Controller
                  name="base_uom"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select UOM..." />
                      </SelectTrigger>
                      <SelectContent>
                        {uomList.map((uom) => (
                          <SelectItem key={uom.id} value={String(uom.id)}>
                            {uom.code} - {uom.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            </div>

            {/* Name & Customer */}
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Name" required error={errors.name}>
                <Input
                  {...register('name')}
                  placeholder="Product name"
                />
              </FormField>
              <FormField label="Customer" error={errors.customer}>
                <Controller
                  name="customer"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value || 'none'}
                      onValueChange={(value) => field.onChange(value === 'none' ? '' : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="None (stock item)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (stock item)</SelectItem>
                        {customerList.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.code} - {c.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            </div>

            {/* Corrugated: Board Specs */}
            {isCorrugated && (
              <div className="grid grid-cols-3 gap-4">
                <FormField label="Test (ECT)" error={errors.test}>
                  <Controller
                    name="test"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value || 'none'}
                        onValueChange={(value) => field.onChange(value === 'none' ? '' : value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {TEST_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
                <FormField label="Flute" error={errors.flute}>
                  <Controller
                    name="flute"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value || 'none'}
                        onValueChange={(value) => field.onChange(value === 'none' ? '' : value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {FLUTE_TYPES.map((f) => (
                            <SelectItem key={f.value} value={f.value}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
                <FormField label="Paper" error={errors.paper}>
                  <Controller
                    name="paper"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value || 'none'}
                        onValueChange={(value) => field.onChange(value === 'none' ? '' : value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {PAPER_TYPES.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
              </div>
            )}

            {/* Corrugated: Dimensions */}
            {isCorrugated && (
              <div className="space-y-2">
                <Label>Dimensions (inches)</Label>
                {isDC ? (
                  <div className="grid grid-cols-5 gap-2">
                    <div>
                      <Input {...register('length')} placeholder="L" />
                      <span className="text-xs text-muted-foreground">Length</span>
                    </div>
                    <div>
                      <Input {...register('width')} placeholder="W" />
                      <span className="text-xs text-muted-foreground">Width</span>
                    </div>
                    <div>
                      <Input {...register('blank_length')} placeholder="BL" />
                      <span className="text-xs text-muted-foreground">Blank L</span>
                    </div>
                    <div>
                      <Input {...register('blank_width')} placeholder="BW" />
                      <span className="text-xs text-muted-foreground">Blank W</span>
                    </div>
                    <div>
                      <Input {...register('out_per_rotary')} placeholder="#" type="number" />
                      <span className="text-xs text-muted-foreground"># Out</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Input {...register('length')} placeholder="L" />
                      <span className="text-xs text-muted-foreground">Length</span>
                    </div>
                    <div>
                      <Input {...register('width')} placeholder="W" />
                      <span className="text-xs text-muted-foreground">Width</span>
                    </div>
                    <div>
                      <Input {...register('height')} placeholder="H" />
                      <span className="text-xs text-muted-foreground">Height</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── Packaging: Dynamic Fields ─────────────────────────── */}
            {isPackaging && (
              <>
                {/* Material & Thickness row */}
                <div className="grid grid-cols-4 gap-2">
                  {showPkgField('material_type', pkgSubType) && (
                    <div className="col-span-2">
                      <Label className="text-xs">Material</Label>
                      <Input {...register('material_type')} placeholder="e.g., Poly, Kraft" />
                    </div>
                  )}
                  {showPkgField('color', pkgSubType) && (
                    <div>
                      <Label className="text-xs">Color</Label>
                      <Input {...register('color')} placeholder="Clear" />
                    </div>
                  )}
                  {showPkgField('thickness', pkgSubType) && (
                    <div>
                      <Label className="text-xs">Thickness</Label>
                      <div className="flex gap-1">
                        <Input {...register('thickness')} placeholder="0" className="w-16" />
                        <Controller
                          name="thickness_unit"
                          control={control}
                          render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger className="w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="mil">Mil</SelectItem>
                                <SelectItem value="gauge">Gauge</SelectItem>
                                <SelectItem value="mm">mm</SelectItem>
                                <SelectItem value="inches">in</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Dimensions row */}
                {(showPkgField('length', pkgSubType) || showPkgField('diameter', pkgSubType)) && (
                  <div className="space-y-2">
                    <Label>Dimensions (inches)</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {showPkgField('length', pkgSubType) && (
                        <div>
                          <Input {...register('length')} placeholder="L" />
                          <span className="text-xs text-muted-foreground">Length</span>
                        </div>
                      )}
                      {showPkgField('width', pkgSubType) && (
                        <div>
                          <Input {...register('width')} placeholder="W" />
                          <span className="text-xs text-muted-foreground">Width</span>
                        </div>
                      )}
                      {showPkgField('height', pkgSubType) && (
                        <div>
                          <Input {...register('height')} placeholder="H" />
                          <span className="text-xs text-muted-foreground">Height</span>
                        </div>
                      )}
                      {showPkgField('diameter', pkgSubType) && (
                        <div>
                          <Input {...register('diameter')} placeholder="Dia" />
                          <span className="text-xs text-muted-foreground">Diameter</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Roll specs row */}
                {showPkgField('roll_length', pkgSubType) && (
                  <div className="space-y-2">
                    <Label>Roll Specs</Label>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <Input {...register('roll_width')} placeholder="W" />
                        <span className="text-xs text-muted-foreground">Width (in)</span>
                      </div>
                      <div>
                        <Input {...register('roll_length')} placeholder="L" />
                        <span className="text-xs text-muted-foreground">Length (ft)</span>
                      </div>
                      {showPkgField('rolls_per_case', pkgSubType) && (
                        <div>
                          <Input {...register('rolls_per_case')} placeholder="#" type="number" />
                          <span className="text-xs text-muted-foreground">Rolls/Case</span>
                        </div>
                      )}
                      {showPkgField('core_diameter', pkgSubType) && (
                        <div>
                          <Input {...register('core_diameter')} placeholder="3" />
                          <span className="text-xs text-muted-foreground">Core (in)</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Count fields row */}
                {(showPkgField('pieces_per_case', pkgSubType) || showPkgField('sheets_per_bundle', pkgSubType)) && (
                  <div className="grid grid-cols-3 gap-2">
                    {showPkgField('pieces_per_case', pkgSubType) && (
                      <div>
                        <Label className="text-xs">Pieces/Case</Label>
                        <Input {...register('pieces_per_case')} type="number" placeholder="0" />
                      </div>
                    )}
                    {showPkgField('sheets_per_bundle', pkgSubType) && (
                      <div>
                        <Label className="text-xs">Sheets/Bundle</Label>
                        <Input {...register('sheets_per_bundle')} type="number" placeholder="0" />
                      </div>
                    )}
                    {showPkgField('weight_capacity_lbs', pkgSubType) && (
                      <div>
                        <Label className="text-xs">Weight Cap (lbs)</Label>
                        <Input {...register('weight_capacity_lbs')} placeholder="0" />
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-type specific fields (collapsible) */}
                {(showPkgField('bubble_size', pkgSubType) ||
                  showPkgField('lip_style', pkgSubType) ||
                  showPkgField('density', pkgSubType) ||
                  showPkgField('cells_x', pkgSubType) ||
                  showPkgField('adhesive_type', pkgSubType) ||
                  showPkgField('tape_type', pkgSubType) ||
                  showPkgField('break_strength_lbs', pkgSubType) ||
                  showPkgField('stretch_pct', pkgSubType) ||
                  showPkgField('inner_diameter', pkgSubType) ||
                  showPkgField('lid_included', pkgSubType) ||
                  showPkgField('label_type', pkgSubType) ||
                  showPkgField('perforated', pkgSubType)
                ) && (
                  <Collapsible open={openSections.packagingSpecs} onOpenChange={() => toggleSection('packagingSpecs')}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-start p-2 h-auto">
                        {openSections.packagingSpecs ? (
                          <ChevronDown className="h-4 w-4 mr-2" />
                        ) : (
                          <ChevronRight className="h-4 w-4 mr-2" />
                        )}
                        <span className="text-sm font-medium">Additional Specs</span>
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 pt-2">
                      <div className="grid grid-cols-2 gap-4">
                        {/* Bubble */}
                        {showPkgField('bubble_size', pkgSubType) && (
                          <FormField label="Bubble Size">
                            <Controller
                              name="bubble_size"
                              control={control}
                              render={({ field }) => (
                                <Select value={field.value || 'none'} onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}>
                                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    <SelectItem value="3/16">3/16" (Small)</SelectItem>
                                    <SelectItem value="5/16">5/16" (Medium)</SelectItem>
                                    <SelectItem value="1/2">1/2" (Large)</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </FormField>
                        )}
                        {/* Perforated */}
                        {showPkgField('perforated', pkgSubType) && (
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <Controller
                                name="perforated"
                                control={control}
                                render={({ field }) => (
                                  <Switch id="perforated" checked={field.value} onCheckedChange={field.onChange} />
                                )}
                              />
                              <Label htmlFor="perforated">Perforated</Label>
                            </div>
                            {watch('perforated') && (
                              <Input {...register('perforation_interval')} placeholder="e.g., every 12 inches" />
                            )}
                          </div>
                        )}
                        {/* Bags - Lip Style */}
                        {showPkgField('lip_style', pkgSubType) && (
                          <FormField label="Lip Style">
                            <Controller
                              name="lip_style"
                              control={control}
                              render={({ field }) => (
                                <Select value={field.value || 'none'} onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}>
                                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    <SelectItem value="open">Open</SelectItem>
                                    <SelectItem value="resealable">Resealable</SelectItem>
                                    <SelectItem value="ziplock">Zip-Lock</SelectItem>
                                    <SelectItem value="flap">Flap</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </FormField>
                        )}
                        {/* Foam - Density */}
                        {showPkgField('density', pkgSubType) && (
                          <div>
                            <Label className="text-xs">Density (lb/ft3)</Label>
                            <Input {...register('density')} placeholder="0" />
                          </div>
                        )}
                        {/* Partitions - Grid */}
                        {showPkgField('cells_x', pkgSubType) && (
                          <>
                            <div>
                              <Label className="text-xs">Cells Across (X)</Label>
                              <Input {...register('cells_x')} type="number" placeholder="0" />
                            </div>
                            <div>
                              <Label className="text-xs">Cells Down (Y)</Label>
                              <Input {...register('cells_y')} type="number" placeholder="0" />
                            </div>
                          </>
                        )}
                        {/* Tape - Type & Adhesive */}
                        {showPkgField('tape_type', pkgSubType) && (
                          <FormField label="Tape Type">
                            <Controller
                              name="tape_type"
                              control={control}
                              render={({ field }) => (
                                <Select value={field.value || 'none'} onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}>
                                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
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
                              )}
                            />
                          </FormField>
                        )}
                        {showPkgField('adhesive_type', pkgSubType) && (
                          <FormField label="Adhesive Type">
                            <Controller
                              name="adhesive_type"
                              control={control}
                              render={({ field }) => (
                                <Select value={field.value || 'none'} onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}>
                                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    <SelectItem value="acrylic">Acrylic</SelectItem>
                                    <SelectItem value="rubber">Rubber</SelectItem>
                                    <SelectItem value="hot_melt">Hot Melt</SelectItem>
                                    <SelectItem value="silicone">Silicone</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </FormField>
                        )}
                        {/* Strapping */}
                        {showPkgField('break_strength_lbs', pkgSubType) && (
                          <div>
                            <Label className="text-xs">Break Strength (lbs)</Label>
                            <Input {...register('break_strength_lbs')} placeholder="0" />
                          </div>
                        )}
                        {/* Stretch */}
                        {showPkgField('stretch_pct', pkgSubType) && (
                          <div>
                            <Label className="text-xs">Pre-Stretch %</Label>
                            <Input {...register('stretch_pct')} type="number" placeholder="0" />
                          </div>
                        )}
                        {/* Tube */}
                        {showPkgField('inner_diameter', pkgSubType) && (
                          <div>
                            <Label className="text-xs">Inner Diameter (in)</Label>
                            <Input {...register('inner_diameter')} placeholder="0" />
                          </div>
                        )}
                        {/* Plastic Containers */}
                        {showPkgField('lid_included', pkgSubType) && (
                          <div className="flex items-center space-x-2">
                            <Controller
                              name="lid_included"
                              control={control}
                              render={({ field }) => (
                                <Switch id="lid_included" checked={field.value} onCheckedChange={field.onChange} />
                              )}
                            />
                            <Label htmlFor="lid_included">Lid Included</Label>
                          </div>
                        )}
                        {/* Labels */}
                        {showPkgField('label_type', pkgSubType) && (
                          <FormField label="Label Type">
                            <Controller
                              name="label_type"
                              control={control}
                              render={({ field }) => (
                                <Select value={field.value || 'none'} onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}>
                                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    <SelectItem value="thermal">Thermal Transfer</SelectItem>
                                    <SelectItem value="direct_thermal">Direct Thermal</SelectItem>
                                    <SelectItem value="laser">Laser</SelectItem>
                                    <SelectItem value="inkjet">Inkjet</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </FormField>
                        )}
                        {showPkgField('labels_per_roll', pkgSubType) && (
                          <div>
                            <Label className="text-xs">Labels/Roll</Label>
                            <Input {...register('labels_per_roll')} type="number" placeholder="0" />
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </>
            )}

            {/* Descriptions (collapsible) */}
            <Collapsible open={openSections.descriptions} onOpenChange={() => toggleSection('descriptions')}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-start p-2 h-auto">
                  {openSections.descriptions ? (
                    <ChevronDown className="h-4 w-4 mr-2" />
                  ) : (
                    <ChevronRight className="h-4 w-4 mr-2" />
                  )}
                  <span className="text-sm font-medium">Descriptions</span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="description">General Description</Label>
                  <Textarea
                    {...register('description')}
                    placeholder="General description..."
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="purch_desc">Purchase Description</Label>
                    <Textarea
                      {...register('purch_desc')}
                      placeholder="Shows on POs..."
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sell_desc">Sales Description</Label>
                    <Textarea
                      {...register('sell_desc')}
                      placeholder="Shows on invoices..."
                      rows={2}
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Printing (collapsible, corrugated only) */}
            {isCorrugated && (
              <Collapsible open={openSections.printing} onOpenChange={() => toggleSection('printing')}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-start p-2 h-auto">
                    {openSections.printing ? (
                      <ChevronDown className="h-4 w-4 mr-2" />
                    ) : (
                      <ChevronRight className="h-4 w-4 mr-2" />
                    )}
                    <span className="text-sm font-medium">Printing</span>
                    {isPrinted && (
                      <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                        Printed
                      </span>
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-2">
                  <div className="flex items-center space-x-2">
                    <Controller
                      name="is_printed"
                      control={control}
                      render={({ field }) => (
                        <Switch
                          id="is_printed"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      )}
                    />
                    <Label htmlFor="is_printed">Printed Item</Label>
                  </div>
                  {isPrinted && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="panels_printed">Panels Printed</Label>
                          <Input
                            {...register('panels_printed')}
                            type="number"
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="colors_printed">Colors</Label>
                          <Input
                            {...register('colors_printed')}
                            type="number"
                            placeholder="0"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ink_list">Ink Colors</Label>
                        <Input
                          {...register('ink_list')}
                          placeholder="e.g., PMS 286, Black, Red"
                        />
                      </div>
                    </>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Features (collapsible, corrugated only) */}
            {isCorrugated && featuresData?.results && featuresData.results.length > 0 && (
              <Collapsible open={openSections.features} onOpenChange={() => toggleSection('features')}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-start p-2 h-auto">
                    {openSections.features ? (
                      <ChevronDown className="h-4 w-4 mr-2" />
                    ) : (
                      <ChevronRight className="h-4 w-4 mr-2" />
                    )}
                    <span className="text-sm font-medium">Features</span>
                    {featureSelections.some((f) => f.selected) && (
                      <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                        {featureSelections.filter((f) => f.selected).length} selected
                      </span>
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
                  {featuresData.results.map((feature: CorrugatedFeature) => {
                    const sel = featureSelections.find((f) => f.featureId === feature.id)
                    return (
                      <div key={feature.id} className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`feature-${feature.id}`}
                            checked={sel?.selected ?? false}
                            onCheckedChange={(checked) => {
                              setFeatureSelections((prev) =>
                                prev.map((f) =>
                                  f.featureId === feature.id
                                    ? { ...f, selected: !!checked }
                                    : f
                                )
                              )
                            }}
                          />
                          <Label htmlFor={`feature-${feature.id}`} className="text-sm font-normal cursor-pointer">
                            {feature.name}
                            {feature.requires_details && (
                              <span className="text-xs text-muted-foreground ml-1">(details required)</span>
                            )}
                          </Label>
                        </div>
                        {sel?.selected && (
                          <div className="ml-6">
                            <Input
                              placeholder={feature.requires_details ? 'Details required...' : 'Optional details...'}
                              value={sel.details}
                              onChange={(e) => {
                                setFeatureSelections((prev) =>
                                  prev.map((f) =>
                                    f.featureId === feature.id
                                      ? { ...f, details: e.target.value }
                                      : f
                                  )
                                )
                              }}
                              className="text-sm"
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Unitizing (collapsible) */}
            <Collapsible open={openSections.unitizing} onOpenChange={() => toggleSection('unitizing')}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-start p-2 h-auto">
                  {openSections.unitizing ? (
                    <ChevronDown className="h-4 w-4 mr-2" />
                  ) : (
                    <ChevronRight className="h-4 w-4 mr-2" />
                  )}
                  <span className="text-sm font-medium">Unitizing / Pallet Info</span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="units_per_layer">Units/Layer</Label>
                    <Input
                      {...register('units_per_layer')}
                      type="number"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="layers_per_pallet">Layers/Pallet</Label>
                    <Input
                      {...register('layers_per_pallet')}
                      type="number"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="units_per_pallet">Units/Pallet</Label>
                    <Input
                      {...register('units_per_pallet')}
                      type="number"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="unit_height">Unit Height</Label>
                    <Input
                      {...register('unit_height')}
                      placeholder="inches"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pallet_height">Pallet Height</Label>
                    <Input
                      {...register('pallet_height')}
                      placeholder="inches"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pallet_footprint">Pallet Footprint</Label>
                    <Input
                      {...register('pallet_footprint')}
                      placeholder="48x40"
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Flags */}
            <div className="flex items-center gap-6">
              <div className="space-y-2">
                <Label>Item Type</Label>
                <Controller
                  name="item_type"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inventory">Inventory</SelectItem>
                        <SelectItem value="crossdock">Crossdock</SelectItem>
                        <SelectItem value="non_stockable">Non-Stockable</SelectItem>
                        <SelectItem value="other_charge">Other Charge</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Controller
                  name="is_active"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id="is_active"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : isEditing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
