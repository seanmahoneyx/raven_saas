import { useState } from 'react'
import { format } from 'date-fns'
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
import { useCreateDeliveryRun } from '@/api/scheduling'
import type { Truck } from '@/types/api'

interface DeliveryRunDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  truck: Truck
  date: string
  existingRunCount: number
}

export default function DeliveryRunDialog({
  open,
  onOpenChange,
  truck,
  date,
  existingRunCount,
}: DeliveryRunDialogProps) {
  const [name, setName] = useState(`Run ${existingRunCount + 1}`)
  const [departureTime, setDepartureTime] = useState('')
  const [notes, setNotes] = useState('')

  const createRun = useCreateDeliveryRun()

  const handleCreate = () => {
    createRun.mutate(
      {
        name,
        truckId: truck.id,
        scheduledDate: date,
        sequence: existingRunCount + 1,
        departureTime: departureTime || null,
        notes,
      },
      {
        onSuccess: () => {
          onOpenChange(false)
          setName(`Run ${existingRunCount + 2}`)
          setDepartureTime('')
          setNotes('')
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Create Delivery Run</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="text-sm text-gray-500">
            <span className="font-medium">{truck.name}</span>
            <span className="mx-2">-</span>
            <span>{format(new Date(date), 'EEE, MMM d, yyyy')}</span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="run-name">Run Name</Label>
            <Input
              id="run-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Morning Route, Route A"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="departure-time">Departure Time (optional)</Label>
            <Input
              id="departure-time"
              type="time"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Route instructions, special notes..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || createRun.isPending}
          >
            {createRun.isPending ? 'Creating...' : 'Create Run'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
