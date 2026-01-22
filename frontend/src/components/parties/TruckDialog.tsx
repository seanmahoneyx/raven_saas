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
import { useCreateTruck, useUpdateTruck } from '@/api/parties'
import type { Truck } from '@/types/api'

interface TruckDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  truck?: Truck | null
}

export function TruckDialog({ open, onOpenChange, truck }: TruckDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    license_plate: '',
    capacity_pallets: '' as string | number,
    is_active: true,
    notes: '',
  })

  const createTruck = useCreateTruck()
  const updateTruck = useUpdateTruck()

  const isEditing = !!truck

  useEffect(() => {
    if (truck) {
      setFormData({
        name: truck.name,
        license_plate: truck.license_plate,
        capacity_pallets: truck.capacity_pallets ?? '',
        is_active: truck.is_active,
        notes: truck.notes,
      })
    } else {
      setFormData({
        name: '',
        license_plate: '',
        capacity_pallets: '',
        is_active: true,
        notes: '',
      })
    }
  }, [truck, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const payload = {
      ...formData,
      capacity_pallets: formData.capacity_pallets ? Number(formData.capacity_pallets) : null,
    }

    try {
      if (isEditing && truck) {
        await updateTruck.mutateAsync({ id: truck.id, ...payload })
      } else {
        await createTruck.mutateAsync(payload)
      }
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save truck:', error)
    }
  }

  const isPending = createTruck.isPending || updateTruck.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Truck' : 'Add Truck'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Truck 1"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="license_plate">License Plate</Label>
                <Input
                  id="license_plate"
                  value={formData.license_plate}
                  onChange={(e) => setFormData({ ...formData, license_plate: e.target.value })}
                  placeholder="ABC-1234"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="capacity_pallets">Capacity (Pallets)</Label>
                <Input
                  id="capacity_pallets"
                  type="number"
                  value={formData.capacity_pallets}
                  onChange={(e) => setFormData({ ...formData, capacity_pallets: e.target.value })}
                  placeholder="20"
                  min="0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={3}
              />
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
