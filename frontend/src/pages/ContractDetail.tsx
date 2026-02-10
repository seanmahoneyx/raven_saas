import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft,
  Plus,
  Play,
  CheckCircle,
  XCircle,
  Package,
  Calendar,
  Building2,
  FileText,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  useContract,
  useActivateContract,
  useCompleteContract,
  useCancelContract,
} from '@/api/contracts'
import { ReleaseDialog } from '@/components/contracts/ReleaseDialog'
import type { ContractStatus, ContractLine } from '@/types/api'

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
  const activateContract = useActivateContract()
  const completeContract = useCompleteContract()
  const cancelContract = useCancelContract()

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
          <p className="text-muted-foreground">
            {contract.customer_name}
            {contract.blanket_po && ` • PO: ${contract.blanket_po}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {contract.status === 'draft' && (
            <Button
              onClick={() => activateContract.mutate(contract.id)}
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
                onClick={() => completeContract.mutate(contract.id)}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Complete
              </Button>
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => {
                  if (confirm('Are you sure you want to cancel this contract?')) {
                    cancelContract.mutate(contract.id)
                  }
                }}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Cancel
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

      {/* Contract Info */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Customer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{contract.customer_name}</p>
            {contract.ship_to_name && (
              <p className="text-sm text-muted-foreground mt-1">
                Ship to: {contract.ship_to_name}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Dates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Issue:</span>{' '}
                {new Date(contract.issue_date).toLocaleDateString()}
              </p>
              {contract.start_date && (
                <p>
                  <span className="text-muted-foreground">Start:</span>{' '}
                  {new Date(contract.start_date).toLocaleDateString()}
                </p>
              )}
              {contract.end_date && (
                <p>
                  <span className="text-muted-foreground">End:</span>{' '}
                  {new Date(contract.end_date).toLocaleDateString()}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {contract.notes || 'No notes'}
            </p>
          </CardContent>
        </Card>
      </div>

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
    </div>
  )
}
