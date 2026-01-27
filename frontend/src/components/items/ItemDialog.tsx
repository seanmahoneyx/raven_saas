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
import { useCreateItem, useUpdateItem, useUnitsOfMeasure } from '@/api/items'
import type { Item } from '@/types/api'

interface ItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: Item | null
}

export function ItemDialog({ open, onOpenChange, item }: ItemDialogProps) {
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    description: '',
    base_uom: '',
    is_inventory: true,
    is_active: true,
  })

  const { data: uomData } = useUnitsOfMeasure()
  const createItem = useCreateItem()
  const updateItem = useUpdateItem()

  const isEditing = !!item

  useEffect(() => {
    if (item) {
      setFormData({
        sku: item.sku,
        name: item.name,
        description: item.description ?? '',
        base_uom: String(item.base_uom),
        is_inventory: item.is_inventory,
        is_active: item.is_active,
      })
    } else {
      setFormData({
        sku: '',
        name: '',
        description: '',
        base_uom: '',
        is_inventory: true,
        is_active: true,
      })
    }
  }, [item, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const payload = {
      ...formData,
      base_uom: Number(formData.base_uom),
    }

    try {
      if (isEditing && item) {
        await updateItem.mutateAsync({ id: item.id, ...payload })
      } else {
        await createItem.mutateAsync(payload)
      }
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save item:', error)
    }
  }

  const isPending = createItem.isPending || updateItem.isPending
  const uomList = uomData?.results ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Item' : 'Add Item'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
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
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Product description..."
                rows={3}
              />
            </div>

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
