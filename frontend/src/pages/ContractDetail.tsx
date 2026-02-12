import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft, Pencil, Plus, Play, CheckCircle, XCircle, Package, Calendar,
  Building2, FileText, ChevronDown, ChevronRight, Printer, Save, X, RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  useContract, useUpdateContract, useActivateContract, useDeactivateContract,
  useCompleteContract, useCancelContract,
} from '@/api/contracts'
import { useLocations } from '@/api/parties'
import { ReleaseDialog } from '@/components/contracts/ReleaseDialog'
import type { ContractStatus, ContractLine } from '@/types/api'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'

const statusColors: Record<ContractStatus, 'default' | 'success' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  active: 'success',
  complete: 'default',
  cancelled: 'destructive',
  expired: 'outline',
}

const statusLabels: Record<ContractStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  complete: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired',
}

function ContractLineRow({
  line,
  contractId,
  contractStatus,
  contractShipTo,
  contractShipToName,
}: {
  line: ContractLine
  contractId: number
  contractStatus: ContractStatus
  contractShipTo?: number | null
  contractShipToName?: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false)

  const progressPct = line.blanket_qty > 0
    ? Math.round((line.released_qty / line.blanket_qty) * 100)
    : 0

  return (
    <>
      <tr className="border-b hover:bg-muted/50">
        <td className="p-3">
          <button
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="p-3 font-medium">{line.item_sku}</td>
        <td className="p-3">{line.item_name}</td>
        <td className="p-3 text-right">{line.blanket_qty.toLocaleString()}</td>
        <td className="p-3 text-right">{line.released_qty.toLocaleString()}</td>
        <td className="p-3 text-right">
          <span className={line.remaining_qty <= 0 ? 'text-muted-foreground' : ''}>
            {line.remaining_qty.toLocaleString()}
          </span>
        </td>
        <td className="p-3">
          <div className="flex items-center gap-2">
            <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  progressPct >= 100 ? 'bg-green-500' : 'bg-primary'
                }`}
                style={{ width: `${Math.min(progressPct, 100)}%` }}
              />
            </div>
            <span className="text-sm text-muted-foreground w-12">{progressPct}%</span>
          </div>
        </td>
        <td className="p-3">
          {line.unit_price ? `$${parseFloat(line.unit_price).toFixed(2)}` : '-'}
        </td>
        <td className="p-3">
          {contractStatus === 'active' && !line.is_fully_released && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReleaseDialogOpen(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Release
            </Button>
          )}
          {line.is_fully_released && (
            <Badge variant="success">Complete</Badge>
          )}
        </td>
      </tr>
      {expanded && line.releases && line.releases.length > 0 && (
        <tr>
          <td colSpan={9} className="p-0 bg-muted/30">
            <div className="p-4">
              <h4 className="text-sm font-medium mb-2">Release History</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Order #</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-right p-2">Qty</th>
                    <th className="text-right p-2">Balance Before</th>
                    <th className="text-right p-2">Balance After</th>
                  </tr>
                </thead>
                <tbody>
                  {line.releases.map((release) => (
                    <tr key={release.id} className="border-t border-muted">
                      <td className="p-2">
                        {new Date(release.release_date).toLocaleDateString()}
                      </td>
                      <td className="p-2">
                        <span className="font-medium text-primary">
                          SO-{release.sales_order_number}
                        </span>
                      </td>
                      <td className="p-2">
                        <Badge variant="outline" className="text-xs">
                          {release.sales_order_status}
                        </Badge>
                      </td>
                      <td className="p-2 text-right">{release.quantity_ordered.toLocaleString()}</td>
                      <td className="p-2 text-right text-muted-foreground">
                        {release.balance_before.toLocaleString()}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">
                        {release.balance_after.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
      {expanded && (!line.releases || line.releases.length === 0) && (
        <tr>
          <td colSpan={9} className="p-4 bg-muted/30 text-center text-muted-foreground">
            No releases yet
          </td>
        </tr>
      )}
      <ReleaseDialog
        open={releaseDialogOpen}
        onOpenChange={setReleaseDialogOpen}
        contractId={contractId}
        contractLine={line}
        contractShipTo={contractShipTo}
        contractShipToName={contractShipToName}
      />
    </>
  )
}

export default function ContractDetail() {
  usePageTitle('Contract Details')

  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const contractId = parseInt(id || '0', 10)

  const { data: contract, isLoading } = useContract(contractId)
  const updateContract = useUpdateContract()
  const activateContract = useActivateContract()
  const deactivateContract = useDeactivateContract()
  const completeContract = useCompleteContract()
  const cancelContract = useCancelContract()

  const [isEditing, setIsEditing] = useState(false)
  const [activateDialogOpen, setActivateDialogOpen] = useState(false)
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false)
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    blanket_po: '',
    issue_date: '',
    start_date: '',
    end_date: '',
    ship_to: '',
    notes: '',
  })

  const { data: locationsData } = useLocations()
  const locations = locationsData?.results ?? []

  useEffect(() => {
    if (isEditing && contract) {
      setFormData({
        blanket_po: contract.blanket_po || '',
        issue_date: contract.issue_date,
        start_date: contract.start_date || '',
        end_date: contract.end_date || '',
        ship_to: contract.ship_to ? String(contract.ship_to) : '',
        notes: contract.notes || '',
      })
    }
  }, [isEditing, contract])

  const customerLocations = contract
    ? locations.filter((l) => l.party === contract.customer)
    : []

  const handleSave = async () => {
    if (!contract) return
    const payload = {
      id: contract.id,
      blanket_po: formData.blanket_po,
      issue_date: formData.issue_date,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
      ship_to: formData.ship_to ? Number(formData.ship_to) : null,
      notes: formData.notes,
    }
    try {
      await updateContract.mutateAsync(payload as any)
      setIsEditing(false)
      toast.success('Contract updated successfully')
    } catch (error) {
      console.error('Failed to save contract:', error)
      toast.error('Failed to save contract')
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
  }

  const handleConfirmActivate = async () => {
    if (!contract) return
    try {
      await activateContract.mutateAsync(contract.id)
      toast.success('Contract activated successfully')
      setActivateDialogOpen(false)
    } catch (error) {
      toast.error('Failed to activate contract')
    }
  }

  const handleConfirmDeactivate = async () => {
    if (!contract) return
    try {
      await deactivateContract.mutateAsync(contract.id)
      toast.success('Contract deactivated successfully')
      setDeactivateDialogOpen(false)
    } catch (error) {
      toast.error('Failed to deactivate contract')
    }
  }

  const handleConfirmComplete = async () => {
    if (!contract) return
    try {
      await completeContract.mutateAsync(contract.id)
      toast.success('Contract completed successfully')
      setCompleteDialogOpen(false)
    } catch (error) {
      toast.error('Failed to complete contract')
    }
  }

  const handleConfirmCancel = async () => {
    if (!contract) return
    try {
      await cancelContract.mutateAsync(contract.id)
      toast.success('Contract cancelled successfully')
      setCancelDialogOpen(false)
    } catch (error) {
      toast.error('Failed to cancel contract')
    }
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!contract) {
    return (
      <div className="p-8">
        <div className="text-center py-8 text-muted-foreground">Contract not found</div>
      </div>
    )
  }

  const canEdit = contract.status === 'draft' || contract.status === 'active'
  const isTerminal = contract.status === 'complete' || contract.status === 'cancelled' || contract.status === 'expired'

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/contracts')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">CTR-{contract.contract_number}</h1>
            <Badge variant={statusColors[contract.status]} className="text-sm">
              {statusLabels[contract.status]}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/customers/${contract.customer}`)}
              className="text-muted-foreground hover:text-foreground hover:underline transition-colors"
            >
              {contract.customer_name}
            </button>
            {contract.blanket_po && (
              <span className="text-muted-foreground">• PO: {contract.blanket_po}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2" data-print-hide>
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancel}>
                <X className="h-4 w-4 mr-2" /> Cancel
              </Button>
              <Button onClick={handleSave} disabled={updateContract.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateContract.isPending ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <>
              {contract.status === 'draft' && (
                <Button
                  onClick={() => setActivateDialogOpen(true)}
                  disabled={contract.num_lines === 0}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Activate
                </Button>
              )}
              {contract.status === 'active' && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setDeactivateDialogOpen(true)}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Deactivate
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setCompleteDialogOpen(true)}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Complete
                  </Button>
                  <Button
                    variant="outline"
                    className="text-destructive"
                    onClick={() => setCancelDialogOpen(true)}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </>
              )}
              {canEdit && (
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </Button>
              )}
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-2" /> Print
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Committed</p>
                <p className="text-2xl font-bold">
                  {contract.total_committed_qty.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Released</p>
                <p className="text-2xl font-bold">
                  {contract.total_released_qty.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <FileText className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Remaining</p>
                <p className="text-2xl font-bold">
                  {contract.total_remaining_qty.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Completion</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      contract.completion_percentage >= 100 ? 'bg-green-500' : 'bg-primary'
                    }`}
                    style={{ width: `${Math.min(contract.completion_percentage, 100)}%` }}
                  />
                </div>
                <span className="text-xl font-bold">{contract.completion_percentage}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contract Details */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Contract Details</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Blanket PO</Label>
                <Input
                  value={formData.blanket_po}
                  onChange={(e) => setFormData({ ...formData, blanket_po: e.target.value })}
                  placeholder="Customer's blanket PO reference"
                />
              </div>
              <div className="space-y-2">
                <Label>Issue Date</Label>
                <Input
                  type="date"
                  value={formData.issue_date}
                  onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Ship To</Label>
                <Select
                  value={formData.ship_to}
                  onValueChange={(value) => setFormData({ ...formData, ship_to: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select location..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customerLocations.map((location) => (
                      <SelectItem key={location.id} value={String(location.id)}>
                        {location.code} - {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Contract notes..."
                  rows={3}
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Customer</p>
                <button
                  onClick={() => navigate(`/customers/${contract.customer}`)}
                  className="font-medium hover:underline"
                >
                  {contract.customer_name}
                </button>
              </div>
              {contract.blanket_po && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Blanket PO</p>
                  <p className="font-medium">{contract.blanket_po}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground mb-1">Issue Date</p>
                <p className="font-medium">
                  {new Date(contract.issue_date).toLocaleDateString()}
                </p>
              </div>
              {contract.start_date && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Start Date</p>
                  <p className="font-medium">
                    {new Date(contract.start_date).toLocaleDateString()}
                  </p>
                </div>
              )}
              {contract.end_date && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">End Date</p>
                  <p className="font-medium">
                    {new Date(contract.end_date).toLocaleDateString()}
                  </p>
                </div>
              )}
              {contract.ship_to_name && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Ship To</p>
                  <p className="font-medium">{contract.ship_to_name}</p>
                </div>
              )}
              {contract.notes && (
                <div className="md:col-span-2 lg:col-span-4">
                  <p className="text-sm text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{contract.notes}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lines Table */}
      <Card>
        <CardHeader>
          <CardTitle>Contract Lines</CardTitle>
          <CardDescription>
            {contract.num_lines} item{contract.num_lines !== 1 ? 's' : ''} on this contract
          </CardDescription>
        </CardHeader>
        <CardContent>
          {contract.lines && contract.lines.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-muted-foreground text-sm">
                    <th className="p-3 w-8"></th>
                    <th className="p-3 text-left">MSPN</th>
                    <th className="p-3 text-left">Item Name</th>
                    <th className="p-3 text-right">Blanket Qty</th>
                    <th className="p-3 text-right">Released</th>
                    <th className="p-3 text-right">Remaining</th>
                    <th className="p-3 text-left">Progress</th>
                    <th className="p-3 text-left">Unit Price</th>
                    <th className="p-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contract.lines.map((line) => (
                    <ContractLineRow
                      key={line.id}
                      line={line}
                      contractId={contract.id}
                      contractStatus={contract.status}
                      contractShipTo={contract.ship_to}
                      contractShipToName={contract.ship_to_name}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No lines on this contract yet
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={activateDialogOpen}
        onOpenChange={setActivateDialogOpen}
        title="Activate Contract"
        description="Activate this contract? It will become available for releases."
        confirmLabel="Activate"
        variant="default"
        onConfirm={handleConfirmActivate}
        loading={activateContract.isPending}
      />

      <ConfirmDialog
        open={deactivateDialogOpen}
        onOpenChange={setDeactivateDialogOpen}
        title="Deactivate Contract"
        description="Revert this contract to draft? It will no longer be available for releases."
        confirmLabel="Deactivate"
        variant="destructive"
        onConfirm={handleConfirmDeactivate}
        loading={deactivateContract.isPending}
      />

      <ConfirmDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        title="Complete Contract"
        description="Mark this contract as complete? This cannot be undone."
        confirmLabel="Complete"
        variant="default"
        onConfirm={handleConfirmComplete}
        loading={completeContract.isPending}
      />

      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title="Cancel Contract"
        description="Are you sure you want to cancel this contract? This action cannot be undone."
        confirmLabel="Cancel Contract"
        variant="destructive"
        onConfirm={handleConfirmCancel}
        loading={cancelContract.isPending}
      />
    </div>
  )
}
