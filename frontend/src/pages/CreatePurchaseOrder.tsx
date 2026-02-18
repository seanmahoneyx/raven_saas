import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { purchaseOrderSchema, type PurchaseOrderFormData } from '@/schemas'
import { FormField } from '@/components/ui/form-field'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useCreatePurchaseOrder } from '@/api/orders'
import { useCostLookup } from '@/api/costLists'
import { useVendors, useLocations } from '@/api/parties'
import { useItems, useUnitsOfMeasure } from '@/api/items'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'

const ORDER_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'complete', label: 'Complete' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function CreatePurchaseOrder() {
  usePageTitle('Create Purchase Order')
  const navigate = useNavigate()
  const createOrder = useCreatePurchaseOrder()

  const { data: vendorsData } = useVendors()
  const { data: locationsData } = useLocations()
  const { data: itemsData } = useItems()
  const { data: uomData } = useUnitsOfMeasure()

  const [error, setError] = useState('')
  const [costLookupLine, setCostLookupLine] = useState<number | null>(null)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PurchaseOrderFormData>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      po_number: '',
      status: 'draft',
      priority: '5',
      vendor: '',
      ship_to: '',
      order_date: new Date().toISOString().split('T')[0],
      expected_date: '',
      scheduled_date: '',
      notes: '',
      lines: [],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })

  const vendors = vendorsData?.results ?? []
  const locations = locationsData?.results ?? []
  const items = itemsData?.results ?? []
  const uoms = uomData?.results ?? []

  const vendor = watch('vendor')
  const watchedLines = watch('lines')

  const warehouseLocations = locations.filter((l) => l.location_type === 'WAREHOUSE')

  const lookupLine = costLookupLine !== null ? watchedLines[costLookupLine] : null
  const { data: costData } = useCostLookup(
    vendor ? Number(vendor) : undefined,
    lookupLine?.item ? Number(lookupLine.item) : undefined,
    lookupLine?.quantity_ordered ? Number(lookupLine.quantity_ordered) : undefined,
  )

  // Auto-populate cost from cost list
  useEffect(() => {
    if (costData?.unit_cost && costLookupLine !== null && costLookupLine < watchedLines.length) {
      const currentLine = watchedLines[costLookupLine]
      if (currentLine.unit_cost === '0.00' || currentLine.unit_cost === '') {
        setValue(`lines.${costLookupLine}.unit_cost`, costData.unit_cost)
      }
      setCostLookupLine(null)
    }
  }, [costData, costLookupLine, watchedLines, setValue])

  const isPending = createOrder.isPending

  const handleAddLine = () => {
    append({ item: '', quantity_ordered: '1', uom: '', unit_cost: '0.00' })
  }

  const handleLineItemChange = (index: number, value: string) => {
    setValue(`lines.${index}.item`, value)
    if (value) {
      const selectedItem = itemsData?.results.find((i) => String(i.id) === value)
      if (selectedItem) {
        setValue(`lines.${index}.uom`, String(selectedItem.base_uom))
      }
      if (vendor) {
        setValue(`lines.${index}.unit_cost`, '0.00')
        setCostLookupLine(index)
      }
    }
  }

  const handleLineQtyChange = (index: number, value: string) => {
    setValue(`lines.${index}.quantity_ordered`, value)
    if (value && vendor && watchedLines[index]?.item) {
      setValue(`lines.${index}.unit_cost`, '0.00')
      setCostLookupLine(index)
    }
  }

  const onSubmit = async (data: PurchaseOrderFormData) => {
    setError('')
    try {
      await createOrder.mutateAsync({
        po_number: data.po_number || undefined,
        status: data.status,
        vendor: Number(data.vendor),
        order_date: data.order_date,
        expected_date: data.expected_date || null,
        scheduled_date: data.scheduled_date || null,
        ship_to: Number(data.ship_to),
        notes: data.notes || '',
        priority: Number(data.priority),
        lines: data.lines.map((line, idx) => ({
          line_number: idx + 1,
          item: Number(line.item),
          quantity_ordered: Number(line.quantity_ordered),
          uom: Number(line.uom),
          unit_cost: line.unit_cost,
        })),
      } as any)
      navigate('/orders?tab=purchase')
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object') {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to create purchase order'))
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
          <h1 className="text-2xl font-bold">Create New Purchase Order</h1>
          <p className="text-sm text-muted-foreground">
            Create a new purchase order for a vendor
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* PO Details */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Order Details</h2>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="PO Number" error={errors.po_number}>
              <Input
                {...register('po_number')}
                placeholder="Auto-generated"
                className="font-mono"
              />
            </FormField>
            <FormField label="Status" error={errors.status}>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDER_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label="Priority (1-10)" error={errors.priority}>
              <Input
                {...register('priority')}
                type="number"
                min="1"
                max="10"
              />
            </FormField>
          </div>
        </section>

        {/* Vendor & Ship To */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Vendor & Destination</h2>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Vendor" required error={errors.vendor}>
              <Controller
                name="vendor"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((v) => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.party_code} - {v.party_display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label="Ship To (Warehouse)" required error={errors.ship_to}>
              <Controller
                name="ship_to"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select warehouse..." />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouseLocations.map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>
                          {l.code} - {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
          </div>
        </section>

        {/* Dates */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Dates</h2>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Order Date" required error={errors.order_date}>
              <Input
                {...register('order_date')}
                type="date"
              />
            </FormField>
            <FormField label="Expected Date" error={errors.expected_date}>
              <Input
                {...register('expected_date')}
                type="date"
              />
            </FormField>
            <FormField label="Scheduled Date" error={errors.scheduled_date}>
              <Input
                {...register('scheduled_date')}
                type="date"
              />
            </FormField>
          </div>
        </section>

        {/* Notes */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Notes</h2>
          <Textarea
            {...register('notes')}
            placeholder="Order notes..."
            rows={3}
          />
        </section>

        {/* Line Items */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold border-b pb-2 flex-1">Order Lines</h2>
            <Button type="button" variant="outline" size="sm" onClick={handleAddLine}>
              <Plus className="h-4 w-4 mr-1" />
              Add Line
            </Button>
          </div>

          {errors.lines?.message && (
            <p className="text-xs text-destructive">{errors.lines.message}</p>
          )}

          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No lines added. Click "Add Line" to add items to this order.
            </p>
          ) : (
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="bg-muted/50 rounded-lg p-3">
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      <FormField
                        label="Item"
                        error={errors.lines?.[index]?.item}
                        className="space-y-1"
                      >
                        <Controller
                          name={`lines.${index}.item`}
                          control={control}
                          render={({ field: f }) => (
                            <Select
                              value={f.value}
                              onValueChange={(v) => handleLineItemChange(index, v)}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select item..." />
                              </SelectTrigger>
                              <SelectContent>
                                {items.map((item) => (
                                  <SelectItem key={item.id} value={String(item.id)}>
                                    {item.sku} - {item.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </FormField>
                    </div>
                    <div className="col-span-2">
                      <FormField
                        label="Qty"
                        error={errors.lines?.[index]?.quantity_ordered}
                        className="space-y-1"
                      >
                        <Input
                          type="number"
                          min="1"
                          {...register(`lines.${index}.quantity_ordered`)}
                          onChange={(e) => handleLineQtyChange(index, e.target.value)}
                          className="h-9"
                        />
                      </FormField>
                    </div>
                    <div className="col-span-2">
                      <FormField
                        label="UOM"
                        error={errors.lines?.[index]?.uom}
                        className="space-y-1"
                      >
                        <Controller
                          name={`lines.${index}.uom`}
                          control={control}
                          render={({ field: f }) => (
                            <Select value={f.value} onValueChange={f.onChange}>
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="UOM" />
                              </SelectTrigger>
                              <SelectContent>
                                {uoms.map((uom) => (
                                  <SelectItem key={uom.id} value={String(uom.id)}>
                                    {uom.code}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </FormField>
                    </div>
                    <div className="col-span-2">
                      <FormField
                        label="Cost"
                        error={errors.lines?.[index]?.unit_cost}
                        className="space-y-1"
                      >
                        <div className="relative">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            {...register(`lines.${index}.unit_cost`)}
                            className="h-9"
                          />
                          {costLookupLine === index && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">...</div>
                          )}
                        </div>
                      </FormField>
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Creating...' : 'Create Purchase Order'}
          </Button>
        </div>
      </form>
    </div>
  )
}
