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
import { useCreateParty, useUpdateParty } from '@/api/parties'
import type { Party } from '@/types/api'

interface PartyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  party?: Party | null
}

const PARTY_TYPES = [
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'VENDOR', label: 'Vendor' },
  { value: 'BOTH', label: 'Both' },
  { value: 'OTHER', label: 'Other' },
]

export function PartyDialog({ open, onOpenChange, party }: PartyDialogProps) {
  const [formData, setFormData] = useState({
    code: '',
    display_name: '',
    legal_name: '',
    party_type: 'CUSTOMER' as Party['party_type'],
    is_active: true,
    notes: '',
  })

  const createParty = useCreateParty()
  const updateParty = useUpdateParty()

  const isEditing = !!party

  useEffect(() => {
    if (party) {
      setFormData({
        code: party.code,
        display_name: party.display_name,
        legal_name: party.legal_name,
        party_type: party.party_type,
        is_active: party.is_active,
        notes: party.notes,
      })
    } else {
      setFormData({
        code: '',
        display_name: '',
        legal_name: '',
        party_type: 'CUSTOMER',
        is_active: true,
        notes: '',
      })
    }
  }, [party, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (isEditing && party) {
        await updateParty.mutateAsync({ id: party.id, ...formData })
      } else {
        await createParty.mutateAsync(formData)
      }
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save party:', error)
    }
  }

  const isPending = createParty.isPending || updateParty.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Party' : 'Create Party'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g., ACME"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="party_type">Type *</Label>
                <Select
                  value={formData.party_type}
                  onValueChange={(value) => setFormData({ ...formData, party_type: value as Party['party_type'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTY_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name *</Label>
              <Input
                id="display_name"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                placeholder="Company display name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="legal_name">Legal Name</Label>
              <Input
                id="legal_name"
                value={formData.legal_name}
                onChange={(e) => setFormData({ ...formData, legal_name: e.target.value })}
                placeholder="Legal entity name"
              />
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
