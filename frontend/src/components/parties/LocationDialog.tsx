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
import { useCreateLocation, useUpdateLocation, useParties } from '@/api/parties'
import type { Location } from '@/types/api'

interface LocationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  location?: Location | null
  /** Pre-fill party and hide the party selector */
  partyId?: number
}

const LOCATION_TYPES = [
  { value: 'SHIP_TO', label: 'Ship To' },
  { value: 'BILL_TO', label: 'Bill To' },
  { value: 'WAREHOUSE', label: 'Warehouse' },
  { value: 'OFFICE', label: 'Office' },
]

export function LocationDialog({ open, onOpenChange, location, partyId }: LocationDialogProps) {
  const [formData, setFormData] = useState({
    party: partyId ? String(partyId) : '',
    location_type: 'SHIP_TO' as Location['location_type'],
    name: '',
    code: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'USA',
    phone: '',
    email: '',
    loading_dock_hours: '',
    special_instructions: '',
    is_default: false,
    is_active: true,
  })

  const { data: partiesData } = useParties()
  const createLocation = useCreateLocation()
  const updateLocation = useUpdateLocation()

  const isEditing = !!location

  useEffect(() => {
    if (location) {
      setFormData({
        party: String(location.party),
        location_type: location.location_type,
        name: location.name,
        code: location.code,
        address_line1: location.address_line1,
        address_line2: location.address_line2,
        city: location.city,
        state: location.state,
        postal_code: location.postal_code,
        country: location.country,
        phone: location.phone,
        email: location.email,
        loading_dock_hours: location.loading_dock_hours,
        special_instructions: location.special_instructions,
        is_default: location.is_default,
        is_active: location.is_active,
      })
    } else {
      setFormData({
        party: partyId ? String(partyId) : '',
        location_type: 'SHIP_TO',
        name: '',
        code: '',
        address_line1: '',
        address_line2: '',
        city: '',
        state: '',
        postal_code: '',
        country: 'USA',
        phone: '',
        email: '',
        loading_dock_hours: '',
        special_instructions: '',
        is_default: false,
        is_active: true,
      })
    }
  }, [location, open, partyId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const payload = {
      ...formData,
      party: Number(formData.party),
    }

    try {
      if (isEditing && location) {
        await updateLocation.mutateAsync({ id: location.id, ...payload })
      } else {
        await createLocation.mutateAsync(payload)
      }
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save location:', error)
    }
  }

  const isPending = createLocation.isPending || updateLocation.isPending
  const parties = partiesData?.results ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Location' : 'Add Location'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className={partyId ? '' : 'grid grid-cols-2 gap-4'}>
              {!partyId && (
                <div className="space-y-2">
                  <Label htmlFor="party">Party *</Label>
                  <Select
                    value={formData.party}
                    onValueChange={(value) => setFormData({ ...formData, party: value })}
                    disabled={isEditing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select party..." />
                    </SelectTrigger>
                    <SelectContent>
                      {parties.map((party) => (
                        <SelectItem key={party.id} value={String(party.id)}>
                          {party.code} - {party.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="location_type">Type *</Label>
                <Select
                  value={formData.location_type}
                  onValueChange={(value) => setFormData({ ...formData, location_type: value as Location['location_type'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATION_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="LOC001"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Main Warehouse"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address_line1">Address Line 1 *</Label>
              <Input
                id="address_line1"
                value={formData.address_line1}
                onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                placeholder="123 Main St"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address_line2">Address Line 2</Label>
              <Input
                id="address_line2"
                value={formData.address_line2}
                onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
                placeholder="Suite 100"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State *</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="postal_code">Postal Code *</Label>
                <Input
                  id="postal_code"
                  value={formData.postal_code}
                  onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="receiving@example.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="loading_dock_hours">Loading Dock Hours</Label>
              <Input
                id="loading_dock_hours"
                value={formData.loading_dock_hours}
                onChange={(e) => setFormData({ ...formData, loading_dock_hours: e.target.value })}
                placeholder="Mon-Fri 7AM-4PM"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="special_instructions">Special Instructions</Label>
              <Textarea
                id="special_instructions"
                value={formData.special_instructions}
                onChange={(e) => setFormData({ ...formData, special_instructions: e.target.value })}
                placeholder="Delivery notes..."
                rows={2}
              />
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_default"
                  checked={formData.is_default}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
                />
                <Label htmlFor="is_default">Default Location</Label>
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
            <Button type="submit" disabled={isPending || (!partyId && !formData.party)}>
              {isPending ? 'Saving...' : isEditing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
