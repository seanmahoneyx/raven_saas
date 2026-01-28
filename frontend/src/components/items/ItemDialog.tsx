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
import {
  useCreateItem,
  useUpdateItem,
  useUnitsOfMeasure,
  useCreateBoxItem,
  useUpdateBoxItem,
  useBoxItem,
} from '@/api/items'
import { useParties } from '@/api/parties'
import type { Item, DivisionType, TestType, FluteType, PaperType, ItemType } from '@/types/api'
// Features will be used for M2M editing in future
// import { cn } from '@/lib/utils'

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

interface FormData {
  // Base item fields
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
  // Corrugated fields
  box_type: ItemType
  test: TestType | ''
  flute: FluteType | ''
  paper: PaperType | ''
  is_printed: boolean
  panels_printed: string
  colors_printed: string
  ink_list: string
  // Dimensions
  length: string
  width: string
  height: string
  blank_length: string
  blank_width: string
  out_per_rotary: string
  // Unitizing
  units_per_layer: string
  layers_per_pallet: string
  units_per_pallet: string
  unit_height: string
  pallet_height: string
  pallet_footprint: string
}

const initialFormData: FormData = {
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

export function ItemDialog({ open, onOpenChange, item }: ItemDialogProps) {
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [openSections, setOpenSections] = useState({
    descriptions: false,
    printing: false,
    unitizing: false,
  })

  const { data: uomData } = useUnitsOfMeasure()
  const { data: customersData } = useParties({ party_type: 'CUSTOMER' })
  // TODO: Add features M2M editing in future

  // Determine if we need to fetch corrugated item data
  const boxTypes = ['dc', 'rsc', 'hsc', 'fol', 'tele'] as const
  const itemBoxType = item?.item_type && boxTypes.includes(item.item_type as typeof boxTypes[number])
    ? (item.item_type as 'dc' | 'rsc' | 'hsc' | 'fol' | 'tele')
    : null

  // Fetch full corrugated item data when editing a corrugated item
  const { data: fullBoxItem } = useBoxItem(itemBoxType, item?.id ?? null)

  const createItem = useCreateItem()
  const updateItem = useUpdateItem()
  const createBoxItem = useCreateBoxItem(formData.box_type as 'dc' | 'rsc' | 'hsc' | 'fol' | 'tele')
  const updateBoxItem = useUpdateBoxItem(formData.box_type as 'dc' | 'rsc' | 'hsc' | 'fol' | 'tele')

  const isEditing = !!item
  const isCorrugated = formData.division === 'corrugated'
  const isDC = formData.box_type === 'dc'

  useEffect(() => {
    if (item) {
      // Use fullBoxItem data if available (for corrugated items), otherwise use item
      const sourceData = fullBoxItem ?? item
      const itemAny = sourceData as any
      setFormData({
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
    } else {
      setFormData(initialFormData)
    }
  }, [item, fullBoxItem, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

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
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Division & Box Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="division">Division *</Label>
                <Select
                  value={formData.division}
                  onValueChange={(value) =>
                    setFormData({ ...formData, division: value as DivisionType })
                  }
                >
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
              </div>
              {isCorrugated && (
                <div className="space-y-2">
                  <Label htmlFor="box_type">Box Type *</Label>
                  <Select
                    value={formData.box_type}
                    onValueChange={(value) =>
                      setFormData({ ...formData, box_type: value as ItemType })
                    }
                  >
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
                </div>
              )}
            </div>

            {/* SKU & UOM */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sku">SKU *</Label>
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="ITEM-001"
                  required
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="base_uom">Unit of Measure *</Label>
                <Select
                  value={formData.base_uom}
                  onValueChange={(value) => setFormData({ ...formData, base_uom: value })}
                >
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
              </div>
            </div>

            {/* Name & Customer */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Product name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer">Customer</Label>
                <Select
                  value={formData.customer || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, customer: value === 'none' ? '' : value })}
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
              </div>
            </div>

            {/* Corrugated: Board Specs */}
            {isCorrugated && (
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="test">Test (ECT)</Label>
                  <Select
                    value={formData.test || 'none'}
                    onValueChange={(value) =>
                      setFormData({ ...formData, test: (value === 'none' ? '' : value) as TestType | '' })
                    }
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
                </div>
                <div className="space-y-2">
                  <Label htmlFor="flute">Flute</Label>
                  <Select
                    value={formData.flute || 'none'}
                    onValueChange={(value) =>
                      setFormData({ ...formData, flute: (value === 'none' ? '' : value) as FluteType | '' })
                    }
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
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paper">Paper</Label>
                  <Select
                    value={formData.paper || 'none'}
                    onValueChange={(value) =>
                      setFormData({ ...formData, paper: (value === 'none' ? '' : value) as PaperType | '' })
                    }
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
                </div>
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
                        value={formData.length}
                        onChange={(e) => setFormData({ ...formData, length: e.target.value })}
                        placeholder="L"
                        required
                      />
                      <span className="text-xs text-muted-foreground">Length</span>
                    </div>
                    <div>
                      <Input
                        value={formData.width}
                        onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                        placeholder="W"
                        required
                      />
                      <span className="text-xs text-muted-foreground">Width</span>
                    </div>
                    <div>
                      <Input
                        value={formData.blank_length}
                        onChange={(e) => setFormData({ ...formData, blank_length: e.target.value })}
                        placeholder="BL"
                      />
                      <span className="text-xs text-muted-foreground">Blank L</span>
                    </div>
                    <div>
                      <Input
                        value={formData.blank_width}
                        onChange={(e) => setFormData({ ...formData, blank_width: e.target.value })}
                        placeholder="BW"
                      />
                      <span className="text-xs text-muted-foreground">Blank W</span>
                    </div>
                    <div>
                      <Input
                        value={formData.out_per_rotary}
                        onChange={(e) => setFormData({ ...formData, out_per_rotary: e.target.value })}
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
                        value={formData.length}
                        onChange={(e) => setFormData({ ...formData, length: e.target.value })}
                        placeholder="L"
                        required
                      />
                      <span className="text-xs text-muted-foreground">Length</span>
                    </div>
                    <div>
                      <Input
                        value={formData.width}
                        onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                        placeholder="W"
                        required
                      />
                      <span className="text-xs text-muted-foreground">Width</span>
                    </div>
                    <div>
                      <Input
                        value={formData.height}
                        onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                        placeholder="H"
                        required
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
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="General description..."
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="purch_desc">Purchase Description</Label>
                    <Textarea
                      id="purch_desc"
                      value={formData.purch_desc}
                      onChange={(e) => setFormData({ ...formData, purch_desc: e.target.value })}
                      placeholder="Shows on POs..."
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sell_desc">Sales Description</Label>
                    <Textarea
                      id="sell_desc"
                      value={formData.sell_desc}
                      onChange={(e) => setFormData({ ...formData, sell_desc: e.target.value })}
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
                    {formData.is_printed && (
                      <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                        Printed
                      </span>
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is_printed"
                      checked={formData.is_printed}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_printed: checked })}
                    />
                    <Label htmlFor="is_printed">Printed Item</Label>
                  </div>
                  {formData.is_printed && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="panels_printed">Panels Printed</Label>
                          <Input
                            id="panels_printed"
                            type="number"
                            value={formData.panels_printed}
                            onChange={(e) =>
                              setFormData({ ...formData, panels_printed: e.target.value })
                            }
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="colors_printed">Colors</Label>
                          <Input
                            id="colors_printed"
                            type="number"
                            value={formData.colors_printed}
                            onChange={(e) =>
                              setFormData({ ...formData, colors_printed: e.target.value })
                            }
                            placeholder="0"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ink_list">Ink Colors</Label>
                        <Input
                          id="ink_list"
                          value={formData.ink_list}
                          onChange={(e) => setFormData({ ...formData, ink_list: e.target.value })}
                          placeholder="e.g., PMS 286, Black, Red"
                        />
                      </div>
                    </>
                  )}
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
                      id="units_per_layer"
                      type="number"
                      value={formData.units_per_layer}
                      onChange={(e) => setFormData({ ...formData, units_per_layer: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="layers_per_pallet">Layers/Pallet</Label>
                    <Input
                      id="layers_per_pallet"
                      type="number"
                      value={formData.layers_per_pallet}
                      onChange={(e) =>
                        setFormData({ ...formData, layers_per_pallet: e.target.value })
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="units_per_pallet">Units/Pallet</Label>
                    <Input
                      id="units_per_pallet"
                      type="number"
                      value={formData.units_per_pallet}
                      onChange={(e) => setFormData({ ...formData, units_per_pallet: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="unit_height">Unit Height</Label>
                    <Input
                      id="unit_height"
                      value={formData.unit_height}
                      onChange={(e) => setFormData({ ...formData, unit_height: e.target.value })}
                      placeholder="inches"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pallet_height">Pallet Height</Label>
                    <Input
                      id="pallet_height"
                      value={formData.pallet_height}
                      onChange={(e) => setFormData({ ...formData, pallet_height: e.target.value })}
                      placeholder="inches"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pallet_footprint">Pallet Footprint</Label>
                    <Input
                      id="pallet_footprint"
                      value={formData.pallet_footprint}
                      onChange={(e) => setFormData({ ...formData, pallet_footprint: e.target.value })}
                      placeholder="48x40"
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Flags */}
            <div className="flex items-center gap-6">
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_inventory"
                  checked={formData.is_inventory}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_inventory: checked })}
                />
                <Label htmlFor="is_inventory">Track Inventory</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !formData.base_uom}>
              {isPending ? 'Saving...' : isEditing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
