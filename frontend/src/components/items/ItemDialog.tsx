import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
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
} from '@/api/items'
import { useParties } from '@/api/parties'
import type { Item, DivisionType, TestType, FluteType, PaperType, ItemType, CorrugatedFeature } from '@/types/api'

// Choice options
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
  is_inventory: true,
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
    resolver: zodResolver(itemSchema),
    defaultValues,
  })

  const { data: uomData } = useUnitsOfMeasure()
  const { data: customersData } = useParties({ party_type: 'CUSTOMER' })
  const { data: featuresData } = useCorrugatedFeatures()

  // Determine if we need to fetch corrugated item data
  const boxTypes = ['dc', 'rsc', 'hsc', 'fol', 'tele'] as const
  const itemBoxType = item?.item_type && boxTypes.includes(item.item_type as typeof boxTypes[number])
    ? (item.item_type as 'dc' | 'rsc' | 'hsc' | 'fol' | 'tele')
    : null

  // Fetch full corrugated item data when editing a corrugated item
  const { data: fullBoxItem } = useBoxItem(itemBoxType, item?.id ?? null)

  const division = watch('division')
  const boxType = watch('box_type')
  const isPrinted = watch('is_printed')

  const createItem = useCreateItem()
  const updateItem = useUpdateItem()
  const createBoxItem = useCreateBoxItem(boxType as 'dc' | 'rsc' | 'hsc' | 'fol' | 'tele')
  const updateBoxItem = useUpdateBoxItem(boxType as 'dc' | 'rsc' | 'hsc' | 'fol' | 'tele')

  const isEditing = !!item
  const isCorrugated = division === 'corrugated'
  const isDC = boxType === 'dc'

  useEffect(() => {
    if (item) {
      // Use fullBoxItem data if available (for corrugated items), otherwise use item
      const sourceData = fullBoxItem ?? item
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
        is_inventory: sourceData.is_inventory,
        is_active: sourceData.is_active,
        box_type: item.item_type && item.item_type !== 'base' && item.item_type !== 'corrugated'
          ? item.item_type
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
  }, [item, fullBoxItem, open, reset, featuresData])

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
      is_inventory: formData.is_inventory,
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
        // Build features array from selections
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
          // TODO: Backend needs to accept item_features in create/update endpoint
          // for full M2M save integration. For now, features are sent but may be ignored.
          item_features: selectedFeatures,
        }

        if (isEditing && item) {
          await updateBoxItem.mutateAsync({ id: item.id, ...corrugatedPayload })
        } else {
          await createBoxItem.mutateAsync(corrugatedPayload)
        }
      } else {
        // Base item
        if (isEditing && item) {
          await updateItem.mutateAsync({ id: item.id, ...basePayload })
        } else {
          await createItem.mutateAsync(basePayload)
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
    updateBoxItem.isPending

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
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            {/* Division & Box Type */}
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
                      <Input
                        {...register('length')}
                        placeholder="L"
                      />
                      <span className="text-xs text-muted-foreground">Length</span>
                    </div>
                    <div>
                      <Input
                        {...register('width')}
                        placeholder="W"
                      />
                      <span className="text-xs text-muted-foreground">Width</span>
                    </div>
                    <div>
                      <Input
                        {...register('blank_length')}
                        placeholder="BL"
                      />
                      <span className="text-xs text-muted-foreground">Blank L</span>
                    </div>
                    <div>
                      <Input
                        {...register('blank_width')}
                        placeholder="BW"
                      />
                      <span className="text-xs text-muted-foreground">Blank W</span>
                    </div>
                    <div>
                      <Input
                        {...register('out_per_rotary')}
                        placeholder="#"
                        type="number"
                      />
                      <span className="text-xs text-muted-foreground"># Out</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Input
                        {...register('length')}
                        placeholder="L"
                      />
                      <span className="text-xs text-muted-foreground">Length</span>
                    </div>
                    <div>
                      <Input
                        {...register('width')}
                        placeholder="W"
                      />
                      <span className="text-xs text-muted-foreground">Width</span>
                    </div>
                    <div>
                      <Input
                        {...register('height')}
                        placeholder="H"
                      />
                      <span className="text-xs text-muted-foreground">Height</span>
                    </div>
                  </div>
                )}
              </div>
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
              <div className="flex items-center space-x-2">
                <Controller
                  name="is_inventory"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id="is_inventory"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <Label htmlFor="is_inventory">Track Inventory</Label>
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
