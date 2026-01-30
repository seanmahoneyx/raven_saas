import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateVendor, useUpdateVendor, useParties } from '@/api/parties'
import type { Vendor } from '@/types/api'

interface VendorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vendor?: Vendor | null
}

const PAYMENT_TERMS = [
  { value: 'NET15', label: 'Net 15' },
  { value: 'NET30', label: 'Net 30' },
  { value: 'NET45', label: 'Net 45' },
  { value: 'NET60', label: 'Net 60' },
  { value: 'COD', label: 'COD' },
  { value: 'PREPAID', label: 'Prepaid' },
]

export function VendorDialog({ open, onOpenChange, vendor }: VendorDialogProps) {
  const isEditing = !!vendor

  const [formData, setFormData] = useState({
    party: '',
    payment_terms: 'NET30',
  })

  const { data: partiesData } = useParties({ party_type: 'VENDOR' })
  const createVendor = useCreateVendor()
  const updateVendor = useUpdateVendor()

  useEffect(() => {
    if (open) {
      if (vendor) {
        setFormData({
          party: String(vendor.party),
          payment_terms: vendor.payment_terms || 'NET30',
        })
      } else {
        setFormData({
          party: '',
          payment_terms: 'NET30',
        })
      }
    }
  }, [open, vendor])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (isEditing) {
        await updateVendor.mutateAsync({
          id: vendor.id,
          payment_terms: formData.payment_terms,
        })
      } else {
        await createVendor.mutateAsync({
          party: Number(formData.party),
          payment_terms: formData.payment_terms,
        })
      }
      onOpenChange(false)
    } catch (error) {
      console.error(`Failed to ${isEditing ? 'update' : 'create'} vendor:`, error)
    }
  }

  // Filter parties that could be vendors
  const availableParties = partiesData?.results?.filter(
    (p) => p.party_type === 'VENDOR' || p.party_type === 'BOTH'
  ) ?? []

  const isPending = createVendor.isPending || updateVendor.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="party">Party *</Label>
              <Select
                value={formData.party}
                onValueChange={(value) => setFormData({ ...formData, party: value })}
                disabled={isEditing}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a party..." />
                </SelectTrigger>
                <SelectContent>
                  {availableParties.map((party) => (
                    <SelectItem key={party.id} value={String(party.id)}>
                      {party.code} - {party.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isEditing && (
                <p className="text-sm text-muted-foreground">
                  Select an existing party or create a new party first.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_terms">Payment Terms</Label>
              <Select
                value={formData.payment_terms}
                onValueChange={(value) => setFormData({ ...formData, payment_terms: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map((term) => (
                    <SelectItem key={term.value} value={term.value}>
                      {term.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !formData.party}>
              {isPending ? (isEditing ? 'Updating...' : 'Creating...') : (isEditing ? 'Update' : 'Create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
