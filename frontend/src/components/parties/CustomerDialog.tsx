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
import { useCreateCustomer, useParties } from '@/api/parties'

interface CustomerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PAYMENT_TERMS = [
  { value: 'NET15', label: 'Net 15' },
  { value: 'NET30', label: 'Net 30' },
  { value: 'NET45', label: 'Net 45' },
  { value: 'NET60', label: 'Net 60' },
  { value: 'COD', label: 'COD' },
  { value: 'PREPAID', label: 'Prepaid' },
]

export function CustomerDialog({ open, onOpenChange }: CustomerDialogProps) {
  const [formData, setFormData] = useState({
    party: '',
    payment_terms: 'NET30',
  })

  const { data: partiesData } = useParties({ party_type: 'CUSTOMER' })
  const createCustomer = useCreateCustomer()

  useEffect(() => {
    if (open) {
      setFormData({
        party: '',
        payment_terms: 'NET30',
      })
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      await createCustomer.mutateAsync({
        party: Number(formData.party),
        payment_terms: formData.payment_terms,
      })
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to create customer:', error)
    }
  }

  // Filter parties that could be customers
  const availableParties = partiesData?.results?.filter(
    (p) => p.party_type === 'CUSTOMER' || p.party_type === 'BOTH'
  ) ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Customer</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="party">Party *</Label>
              <Select
                value={formData.party}
                onValueChange={(value) => setFormData({ ...formData, party: value })}
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
              <p className="text-sm text-muted-foreground">
                Select an existing party or create a new party first.
              </p>
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
            <Button type="submit" disabled={createCustomer.isPending || !formData.party}>
              {createCustomer.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
