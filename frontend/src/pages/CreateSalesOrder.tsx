import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { salesOrderSchema, type SalesOrderFormData } from '@/schemas'
import { FormField } from '@/components/ui/form-field'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useCreateSalesOrder } from '@/api/orders'
import { useCustomers, useLocations } from '@/api/parties'
import { useItems, useUnitsOfMeasure } from '@/api/items'
import { usePriceLookup } from '@/api/priceLists'
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
  { value: 'picking', label: 'Picking' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'complete', label: 'Complete' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function CreateSalesOrder() {
  usePageTitle('Create Sales Order')
  const navigate = useNavigate()
  const createOrder = useCreateSalesOrder()

  const { data: customersData } = useCustomers()
  const { data: locationsData } = useLocations()
  const { data: itemsData } = useItems()
  const { data: uomData } = useUnitsOfMeasure()

  const [error, setError] = useState('')
  const [priceLookupLine, setPriceLookupLine] = useState<number | null>(null)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SalesOrderFormData>({
    resolver: zodResolver(salesOrderSchema),
    defaultValues: {
      order_number: '',
      status: 'draft',
      priority: '5',
      customer: '',
      customer_po: '',
      order_date: new Date().toISOString().split('T')[0],
      scheduled_date: '',
      ship_to: '',
      bill_to: '',
      notes: '',
      lines: [],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })

  const customers = customersData?.results ?? []
  const locations = locationsData?.results ?? []
  const items = itemsData?.results ?? []
  const uoms = uomData?.results ?? []

  const customer = watch('customer')
  const watchedLines = watch('lines')

  const selectedCustomer = customers.find((c) => String(c.id) === customer)
  const customerLocations = selectedCustomer
    ? locations.filter((l) => l.party === selectedCustomer.party)
    : []

  const lookupLine = priceLookupLine !== null ? watchedLines[priceLookupLine] : null
  const { data: priceData } = usePriceLookup(
    customer ? Number(customer) : undefined,
    lookupLine?.item ? Number(lookupLine.item) : undefined,
    lookupLine?.quantity_ordered ? Number(lookupLine.quantity_ordered) : undefined,
  )

  // Auto-populate price from price list
  useEffect(() => {
    if (priceData?.unit_price && priceLookupLine !== null && priceLookupLine < watchedLines.length) {
      const currentLine = watchedLines[priceLookupLine]
      if (currentLine.unit_price === '0.00' || currentLine.unit_price === '') {
        setValue(`lines.${priceLookupLine}.unit_price`, priceData.unit_price)
      }
      setPriceLookupLine(null)
    }
  }, [priceData, priceLookupLine, watchedLines, setValue])

  const isPending = createOrder.isPending

  const handleAddLine = () => {
    append({ item: '', quantity_ordered: '1', uom: '', unit_price: '0.00' })
  }

  const handleLineItemChange = (index: number, value: string) => {
    setValue(`lines.${index}.item`, value)
    if (value) {
      const selectedItem = itemsData?.results.find((i) => String(i.id) === value)
      if (selectedItem) {
        setValue(`lines.${index}.uom`, String(selectedItem.base_uom))
      }
      if (customer) {
        setValue(`lines.${index}.unit_price`, '0.00')
        setPriceLookupLine(index)
      }
    }
  }

  const handleLineQtyChange = (index: number, value: string) => {
    setValue(`lines.${index}.quantity_ordered`, value)
    if (value && customer && watchedLines[index]?.item) {
      setValue(`lines.${index}.unit_price`, '0.00')
      setPriceLookupLine(index)
    }
  }

  const onSubmit = async (data: SalesOrderFormData) => {
    setError('')
    try {
      await createOrder.mutateAsync({
        order_number: data.order_number || undefined,
        status: data.status,
        customer: Number(data.customer),
        order_date: data.order_date,
        scheduled_date: data.scheduled_date || null,
        ship_to: data.ship_to ? Number(data.ship_to) : null,
        bill_to: data.bill_to ? Number(data.bill_to) : null,
        customer_po: data.customer_po || '',
        notes: data.notes || '',
        priority: Number(data.priority),
        lines: data.lines.map((line, idx) => ({
          line_number: idx + 1,
          item: Number(line.item),
          quantity_ordered: Number(line.quantity_ordered),
          uom: Number(line.uom),
          unit_price: line.unit_price,
        })),
      } as any)
      navigate('/orders?tab=sales')
    } catch (err: any) {
      const msg = err?.response?.data
      if (typeof msg === 'object') {
        const firstKey = Object.keys(msg)[0]
        setError(`${firstKey}: ${Array.isArray(msg[firstKey]) ? msg[firstKey][0] : msg[firstKey]}`)
      } else {
        setError(String(msg || 'Failed to create sales order'))
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
          <h1 className="text-2xl font-bold">Create New Sales Order</h1>
          <p className="text-sm text-muted-foreground">
            Create a new sales order for a customer
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Order Details */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Order Details</h2>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Order Number" error={errors.order_number}>
              <Input
                {...register('order_number')}
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

        {/* Customer */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Customer</h2>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Customer" required error={errors.customer}>
              <Controller
                name="customer"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v)
                      setValue('ship_to', '')
                      setValue('bill_to', '')
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.party_code} - {c.party_display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label="Customer PO" error={errors.customer_po}>
              <Input
                {...register('customer_po')}
                placeholder="Customer's PO reference"
              />
            </FormField>
          </div>
        </section>

        {/* Dates */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Dates</h2>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Order Date" required error={errors.order_date}>
              <Input
                {...register('order_date')}
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

        {/* Shipping */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Shipping & Billing</h2>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Ship To" error={errors.ship_to}>
              <Controller
                name="ship_to"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={!customer}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select location..." />
                    </SelectTrigger>
                    <SelectContent>
                      {customerLocations.map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>
                          {l.code} - {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label="Bill To" error={errors.bill_to}>
              <Controller
                name="bill_to"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={!customer}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Same as ship to" />
                    </SelectTrigger>
                    <SelectContent>
                      {customerLocations.map((l) => (
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
                        label="Price"
                        error={errors.lines?.[index]?.unit_price}
                        className="space-y-1"
                      >
                        <div className="relative">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            {...register(`lines.${index}.unit_price`)}
                            className="h-9"
                          />
                          {priceLookupLine === index && (
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
            {isPending ? 'Creating...' : 'Create Sales Order'}
          </Button>
        </div>
      </form>
    </div>
  )
}
