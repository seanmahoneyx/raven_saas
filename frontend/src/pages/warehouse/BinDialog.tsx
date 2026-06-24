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
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateBin, useUpdateBin } from '@/api/warehouse'
import type { Bin } from '@/api/warehouse'

interface BinDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouseId: number
  bin?: Bin | null
}

interface BinFormData {
  code: string
  aisle: string
  rack: string
  level: string
  bin_type: string
  length: string
  width: string
  height: string
  max_capacity: string
  is_active: boolean
}

const BIN_TYPES = [
  { value: 'STORAGE', label: 'Storage' },
  { value: 'STAGING', label: 'Staging' },
  { value: 'RECEIVING', label: 'Receiving' },
  { value: 'SHIPPING', label: 'Shipping' },
  { value: 'DAMAGED', label: 'Damaged/Hold' },
]

const defaultValues: BinFormData = {
  code: '',
  aisle: '',
  rack: '',
  level: '',
  bin_type: 'STORAGE',
  length: '',
  width: '',
  height: '',
  max_capacity: '',
  is_active: true,
}

export function BinDialog({ open, onOpenChange, warehouseId, bin }: BinDialogProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<BinFormData>({ defaultValues })

  const createBin = useCreateBin()
  const updateBin = useUpdateBin()
  const isEditing = !!bin

  useEffect(() => {
    if (bin) {
      reset({
        code: bin.code ?? '',
        aisle: bin.aisle ?? '',
        rack: bin.rack ?? '',
        level: bin.level ?? '',
        bin_type: bin.bin_type ?? 'STORAGE',
        length: bin.length?.toString() ?? '',
        width: bin.width?.toString() ?? '',
        height: bin.height?.toString() ?? '',
        max_capacity: bin.max_capacity?.toString() ?? '',
        is_active: bin.is_active ?? true,
      })
    } else {
      reset(defaultValues)
    }
  }, [bin, open, reset])

  const onSubmit = async (formData: BinFormData) => {
    const payload: Partial<Bin> = {
      warehouse: warehouseId,
      code: formData.code,
      aisle: formData.aisle || '',
      rack: formData.rack || '',
      level: formData.level || '',
      bin_type: formData.bin_type,
      length: formData.length ? formData.length : null,
      width: formData.width ? formData.width : null,
      height: formData.height ? formData.height : null,
      max_capacity: formData.max_capacity ? Number(formData.max_capacity) : null,
      is_active: formData.is_active,
    }
    try {
      if (isEditing && bin) {
        await updateBin.mutateAsync({ id: bin.id, ...payload })
      } else {
        await createBin.mutateAsync(payload)
      }
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save bin:', error)
    }
  }

  const isPending = createBin.isPending || updateBin.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Bin' : 'Add Bin'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Code" required error={errors.code}>
                <Input
                  {...register('code', { required: 'Code is required' })}
                  placeholder="A-01-01"
                  className="font-mono"
                />
              </FormField>
              <FormField label="Bin Type" error={errors.bin_type}>
                <Controller
                  name="bin_type"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BIN_TYPES.map((bt) => (
                          <SelectItem key={bt.value} value={bt.value}>
                            {bt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField label="Aisle" error={errors.aisle}>
                <Input {...register('aisle')} placeholder="A" />
              </FormField>
              <FormField label="Rack" error={errors.rack}>
                <Input {...register('rack')} placeholder="01" />
              </FormField>
              <FormField label="Level" error={errors.level}>
                <Input {...register('level')} placeholder="01" />
              </FormField>
            </div>

            <div className="space-y-2">
              <Label>Dimensions (inches)</Label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Input {...register('length')} placeholder="L" type="number" step="any" />
                  <span className="text-xs text-muted-foreground">Length</span>
                </div>
                <div>
                  <Input {...register('width')} placeholder="W" type="number" step="any" />
                  <span className="text-xs text-muted-foreground">Width</span>
                </div>
                <div>
                  <Input {...register('height')} placeholder="H" type="number" step="any" />
                  <span className="text-xs text-muted-foreground">Height</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 items-end">
              <FormField label="Max Capacity (units)" error={errors.max_capacity}>
                <Input {...register('max_capacity')} type="number" placeholder="0" />
              </FormField>
              <div className="flex items-center space-x-2 pb-2">
                <Controller
                  name="is_active"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id="bin_is_active"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <Label htmlFor="bin_is_active">Active</Label>
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
