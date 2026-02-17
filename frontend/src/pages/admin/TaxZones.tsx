import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/api/client'

interface TaxRule {
  id: number
  tax_zone: number
  tax_zone_name: string
  postal_code: string
}

interface TaxZone {
  id: number
  name: string
  rate: string
  rate_display: string
  gl_account: number | null
  gl_account_code: string | null
  is_active: boolean
  rules: TaxRule[]
  created_at: string
  updated_at: string
}

function useTaxZones() {
  return useQuery({
    queryKey: ['tax-zones'],
    queryFn: async () => {
      const { data } = await api.get<{ results: TaxZone[] }>('/tax-zones/')
      return data.results ?? data
    },
  })
}

export default function TaxZones() {
  usePageTitle('Tax Zones')
  const queryClient = useQueryClient()
  const { data: zones, isLoading } = useTaxZones()

  const [zoneDialogOpen, setZoneDialogOpen] = useState(false)
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [editingZone, setEditingZone] = useState<TaxZone | null>(null)
  const [selectedZone, setSelectedZone] = useState<TaxZone | null>(null)

  const [zoneForm, setZoneForm] = useState({ name: '', rate: '', is_active: true })
  const [ruleForm, setRuleForm] = useState({ postal_code: '' })

  const saveZone = useMutation({
    mutationFn: async (data: { id?: number; name: string; rate: string; is_active: boolean }) => {
      if (data.id) {
        const { data: result } = await api.patch(`/tax-zones/${data.id}/`, data)
        return result
      }
      const { data: result } = await api.post('/tax-zones/', data)
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-zones'] })
      setZoneDialogOpen(false)
      toast.success(editingZone ? 'Tax zone updated' : 'Tax zone created')
    },
    onError: () => toast.error('Failed to save tax zone'),
  })

  const deleteZone = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/tax-zones/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-zones'] })
      toast.success('Tax zone deleted')
    },
    onError: () => toast.error('Failed to delete tax zone'),
  })

  const addRule = useMutation({
    mutationFn: async ({ zoneId, postal_code }: { zoneId: number; postal_code: string }) => {
      const { data } = await api.post(`/tax-zones/${zoneId}/rules/`, { postal_code })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-zones'] })
      setRuleDialogOpen(false)
      setRuleForm({ postal_code: '' })
      toast.success('Postal code rule added')
    },
    onError: () => toast.error('Failed to add rule'),
  })

  const deleteRule = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/tax-rules/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-zones'] })
      toast.success('Rule deleted')
    },
    onError: () => toast.error('Failed to delete rule'),
  })

  const openCreateZone = () => {
    setEditingZone(null)
    setZoneForm({ name: '', rate: '', is_active: true })
    setZoneDialogOpen(true)
  }

  const openEditZone = (zone: TaxZone) => {
    setEditingZone(zone)
    setZoneForm({ name: zone.name, rate: (parseFloat(zone.rate) * 100).toFixed(2), is_active: zone.is_active })
    setZoneDialogOpen(true)
  }

  const openAddRule = (zone: TaxZone) => {
    setSelectedZone(zone)
    setRuleForm({ postal_code: '' })
    setRuleDialogOpen(true)
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading tax zones...</p>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tax Zones</h1>
          <p className="text-muted-foreground mt-1">
            Manage tax zones and postal code mappings
          </p>
        </div>
        <Button onClick={openCreateZone}>
          <Plus className="h-4 w-4 mr-2" />
          New Tax Zone
        </Button>
      </div>

      {(!zones || zones.length === 0) ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No tax zones configured. Create one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {(zones as TaxZone[]).map((zone) => (
            <Card key={zone.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-lg">{zone.name}</CardTitle>
                    <Badge variant={zone.is_active ? 'success' : 'secondary'}>
                      {zone.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <Badge variant="outline">{zone.rate_display}</Badge>
                    {zone.gl_account_code && (
                      <Badge variant="outline">GL: {zone.gl_account_code}</Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditZone(zone)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm('Delete this tax zone?')) deleteZone.mutate(zone.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    Postal Code Rules ({zone.rules.length})
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => openAddRule(zone)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Rule
                  </Button>
                </div>
                {zone.rules.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    No postal code rules. This zone will only apply as a customer default.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {zone.rules.map((rule) => (
                      <Badge
                        key={rule.id}
                        variant="outline"
                        className="gap-1 cursor-pointer hover:bg-destructive/10"
                        onClick={() => {
                          if (confirm(`Remove postal code ${rule.postal_code}?`))
                            deleteRule.mutate(rule.id)
                        }}
                      >
                        <MapPin className="h-3 w-3" />
                        {rule.postal_code}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Zone Dialog */}
      <Dialog open={zoneDialogOpen} onOpenChange={setZoneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingZone ? 'Edit Tax Zone' : 'New Tax Zone'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="zone-name">Name</Label>
              <Input
                id="zone-name"
                value={zoneForm.name}
                onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
                placeholder="e.g. Pennsylvania State Tax"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zone-rate">Rate (%)</Label>
              <Input
                id="zone-rate"
                type="number"
                step="0.01"
                value={zoneForm.rate}
                onChange={(e) => setZoneForm({ ...zoneForm, rate: e.target.value })}
                placeholder="e.g. 6.00"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={zoneForm.is_active}
                onCheckedChange={(checked) => setZoneForm({ ...zoneForm, is_active: checked })}
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setZoneDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                saveZone.mutate({
                  id: editingZone?.id,
                  name: zoneForm.name,
                  rate: (parseFloat(zoneForm.rate) / 100).toString(),
                  is_active: zoneForm.is_active,
                })
              }
              disabled={saveZone.isPending || !zoneForm.name || !zoneForm.rate}
            >
              {saveZone.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Rule Dialog */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Postal Code Rule to {selectedZone?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="postal-code">Postal Code (or prefix)</Label>
              <Input
                id="postal-code"
                value={ruleForm.postal_code}
                onChange={(e) => setRuleForm({ postal_code: e.target.value })}
                placeholder="e.g. 19101 or 191"
              />
              <p className="text-xs text-muted-foreground">
                Enter a full zip code for exact match, or a prefix (e.g. "191") to match all zips starting with it.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                selectedZone &&
                addRule.mutate({ zoneId: selectedZone.id, postal_code: ruleForm.postal_code })
              }
              disabled={addRule.isPending || !ruleForm.postal_code}
            >
              {addRule.isPending ? 'Adding...' : 'Add Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
