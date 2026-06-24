import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
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
import { useCreateWarehouse, useUpdateWarehouse } from '@/api/warehouse'
import type { Warehouse } from '@/api/warehouse'

interface WarehouseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouse?: Warehouse | null
}

interface WarehouseFormData {
  code: string
  name: string
  pallet_capacity: string
  is_default: boolean
  is_active: boolean
  notes: string
}

const defaultValues: WarehouseFormData = {
  code: '',
  name: '',
  pallet_capacity: '',
  is_default: false,
  is_active: true,
  notes: '',
}

export function WarehouseDialog({ open, onOpenChange, warehouse }: WarehouseDialogProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<WarehouseFormData>({ defaultValues })

  const createWarehouse = useCreateWarehouse()
  const updateWarehouse = useUpdateWarehouse()
  const isEditing = !!warehouse

  useEffect(() => {
    if (warehouse) {
      reset({
        code: warehouse.code ?? '',
        name: warehouse.name ?? '',
        pallet_capacity: warehouse.pallet_capacity?.toString() ?? '',
        is_default: warehouse.is_default ?? false,
        is_active: warehouse.is_active ?? true,
        notes: warehouse.notes ?? '',
      })
    } else {
      reset(defaultValues)
    }
  }, [warehouse, open, reset])

  const onSubmit = async (formData: WarehouseFormData) => {
    const payload: Partial<Warehouse> = {
      code: formData.code,
      name: formData.name,
      pallet_capacity: formData.pallet_capacity ? Number(formData.pallet_capacity) : null,
      is_default: formData.is_default,
      is_active: formData.is_active,
      notes: formData.notes || '',
    }
    try {
      if (isEditing && warehouse) {
        await updateWarehouse.mutateAsync({ id: warehouse.id, ...payload })
      } else {
        await createWarehouse.mutateAsync(payload)
      }
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save warehouse:', error)
    }
  }

  const isPending = createWarehouse.isPending || updateWarehouse.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Warehouse' : 'Add Warehouse'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Code" required error={errors.code}>
                <Input
                  {...register('code', { required: 'Code is required' })}
                  placeholder="MAIN"
                  className="font-mono"
                />
              </FormField>
              <FormField label="Pallet Capacity" error={errors.pallet_capacity}>
                <Input
                  {...register('pallet_capacity')}
                  type="number"
                  placeholder="0"
                />
              </FormField>
            </div>

            <FormField label="Name" required error={errors.name}>
              <Input
                {...register('name', { required: 'Name is required' })}
                placeholder="Main Warehouse"
              />
            </FormField>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                {...register('notes')}
                placeholder="Notes about this warehouse..."
                rows={2}
              />
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center space-x-2">
                <Controller
                  name="is_default"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id="is_default"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <Label htmlFor="is_default">Default</Label>
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
