import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateRelease } from '@/api/contracts'
import { useLocations } from '@/api/parties'
import type { ContractLine } from '@/types/api'

interface ReleaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contractId: number
  contractLine: ContractLine
  contractShipTo?: number | null
  contractShipToName?: string | null
}

export function ReleaseDialog({
  open,
  onOpenChange,
  contractId,
  contractLine,
  contractShipTo,
  contractShipToName,
}: ReleaseDialogProps) {
  const [formData, setFormData] = useState({
    quantity: '',
    unit_price: '',
    scheduled_date: '',
    notes: '',
    ship_to_id: '',
  })

  const createRelease = useCreateRelease()
  const { data: locationsData } = useLocations()

  // Filter to only SHIP_TO type locations
  const shipToLocations = locationsData?.results?.filter(
    (loc) => loc.location_type === 'SHIP_TO'
  ) || []

  useEffect(() => {
    if (open) {
      setFormData({
        quantity: '',
        unit_price: contractLine.unit_price || '',
        scheduled_date: '',
        notes: '',
        ship_to_id: contractShipTo?.toString() || '',
      })
    }
  }, [open, contractLine, contractShipTo])

  const quantity = parseInt(formData.quantity) || 0
  const isOverRelease = quantity > contractLine.remaining_qty
  const newBalance = Math.max(0, contractLine.remaining_qty - quantity)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const result = await createRelease.mutateAsync({
        contractId,
        contract_line_id: contractLine.id,
        quantity,
        ship_to_id: formData.ship_to_id ? parseInt(formData.ship_to_id) : null,
        unit_price: formData.unit_price || null,
        scheduled_date: formData.scheduled_date || null,
        notes: formData.notes,
      })

      // Show warning if over-release
      if (result.warning) {
        alert(result.warning)
      }

      onOpenChange(false)
    } catch (error) {
      console.error('Failed to create release:', error)
    }
  }

  const isPending = createRelease.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Release</DialogTitle>
          <DialogDescription>
            Create a sales order release against this contract line
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Line Info */}
            <div className="bg-muted rounded-md p-3 space-y-1 text-sm">
              <p>
                <span className="font-medium">{contractLine.item_sku}</span>
                {' - '}
                {contractLine.item_name}
              </p>
              <div className="flex justify-between text-muted-foreground">
                <span>Blanket Qty: {contractLine.blanket_qty.toLocaleString()}</span>
                <span>Remaining: {contractLine.remaining_qty.toLocaleString()}</span>
              </div>
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity to Release *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                placeholder="Enter quantity"
              />
              {isOverRelease && quantity > 0 && (
                <div className="flex items-center gap-2 text-sm text-orange-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span>
                    This exceeds the remaining balance ({contractLine.remaining_qty}).
                    You can still proceed if needed.
                  </span>
                </div>
              )}
              {quantity > 0 && (
                <p className="text-sm text-muted-foreground">
                  New balance after release: {newBalance.toLocaleString()}
                </p>
              )}
            </div>

            {/* Ship To */}
            <div className="space-y-2">
              <Label htmlFor="ship_to_id">
                Ship To Location *
                {contractShipToName && (
                  <span className="font-normal text-muted-foreground ml-2">
                    (Contract: {contractShipToName})
                  </span>
                )}
              </Label>
              <Select
                value={formData.ship_to_id}
                onValueChange={(value) => setFormData({ ...formData, ship_to_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select ship-to location..." />
                </SelectTrigger>
                <SelectContent>
                  {shipToLocations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id.toString()}>
                      {loc.name} - {loc.city}, {loc.state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!formData.ship_to_id && (
                <p className="text-xs text-destructive">
                  Ship-to location is required for creating sales orders
                </p>
              )}
            </div>

            {/* Unit Price */}
            <div className="space-y-2">
              <Label htmlFor="unit_price">
                Unit Price
                {contractLine.unit_price && (
                  <span className="font-normal text-muted-foreground ml-2">
                    (Contract: ${parseFloat(contractLine.unit_price).toFixed(2)})
                  </span>
                )}
              </Label>
              <Input
                id="unit_price"
                type="number"
                step="0.01"
                value={formData.unit_price}
                onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
                placeholder="Leave blank to use contract price"
              />
            </div>

            {/* Scheduled Date */}
            <div className="space-y-2">
              <Label htmlFor="scheduled_date">Scheduled Date (Optional)</Label>
              <Input
                id="scheduled_date"
                type="date"
                value={formData.scheduled_date}
                onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                If set, the sales order will appear on the scheduler for this date
              </p>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Release notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !quantity || !formData.ship_to_id}>
              {isPending ? 'Creating...' : 'Create Release'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
