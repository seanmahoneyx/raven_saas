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
import { useCreateUnitOfMeasure, useUpdateUnitOfMeasure } from '@/api/items'
import type { UnitOfMeasure } from '@/types/api'

interface UOMDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  uom?: UnitOfMeasure | null
}

export function UOMDialog({ open, onOpenChange, uom }: UOMDialogProps) {
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    is_active: true,
  })

  const createUOM = useCreateUnitOfMeasure()
  const updateUOM = useUpdateUnitOfMeasure()

  const isEditing = !!uom

  useEffect(() => {
    if (uom) {
      setFormData({
        code: uom.code,
        name: uom.name,
        description: uom.description,
        is_active: uom.is_active,
      })
    } else {
      setFormData({
        code: '',
        name: '',
        description: '',
        is_active: true,
      })
    }
  }, [uom, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (isEditing && uom) {
        await updateUOM.mutateAsync({ id: uom.id, ...formData })
      } else {
        await createUOM.mutateAsync(formData)
      }
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save UOM:', error)
    }
  }

  const isPending = createUOM.isPending || updateUOM.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Unit of Measure' : 'Add Unit of Measure'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="EA"
                  required
                  className="font-mono"
                  maxLength={10}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Each"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Unit description..."
                rows={2}
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
