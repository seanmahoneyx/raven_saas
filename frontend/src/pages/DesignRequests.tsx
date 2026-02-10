import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import {
  Plus, MoreHorizontal, Pencil, Trash2, Rocket,
  CheckCircle, XCircle, Clock, Loader2, Check, Palette,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useDesignRequests,
  useDeleteDesignRequest,
  useUpdateDesignRequest,
  usePromoteDesign,
} from '@/api/design'
import { useUnitsOfMeasure } from '@/api/items'
import { DesignRequestDialog } from '@/components/design/DesignRequestDialog'
import type { DesignRequest, DesignRequestStatus } from '@/types/api'

const statusColors: Record<DesignRequestStatus, 'default' | 'success' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  in_progress: 'default',
  approved: 'success',
  rejected: 'destructive',
  completed: 'outline',
}

const statusLabels: Record<DesignRequestStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  approved: 'Approved',
  rejected: 'Rejected',
  completed: 'Completed',
}

const statusIcons: Record<DesignRequestStatus, React.ElementType> = {
  pending: Clock,
  in_progress: Loader2,
  approved: Check,
  rejected: XCircle,
  completed: CheckCircle,
}

// Promote dialog sub-component
function PromoteDialog({
  open,
  onOpenChange,
  designRequest,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  designRequest: DesignRequest | null
}) {
  const [sku, setSku] = useState('')
  const [uom, setUom] = useState('')
  const promoteMutation = usePromoteDesign()
  const { data: uomsData } = useUnitsOfMeasure()
  const uoms = uomsData?.results ?? []

  useEffect(() => {
    if (open) {
      setSku('')
      setUom('')
    }
  }, [open])

  const handlePromote = async () => {
    if (!designRequest || !sku || !uom) return
    try {
      await promoteMutation.mutateAsync({
        id: designRequest.id,
        sku,
        base_uom: Number(uom),
      })
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to promote design:', err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Promote to Item</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Promote <strong>{designRequest?.file_number}</strong> ({designRequest?.ident || 'Untitled'}) to an item in the catalog.
        </p>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="promote-sku">MSPN (required)</Label>
            <Input id="promote-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Enter item MSPN" />
          </div>
          <div className="space-y-2">
            <Label>Base UOM (required)</Label>
            <Select value={uom} onValueChange={setUom}>
              <SelectTrigger><SelectValue placeholder="Select UOM" /></SelectTrigger>
              <SelectContent>
                {uoms.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.code} - {u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePromote} disabled={!sku || !uom || promoteMutation.isPending}>
            {promoteMutation.isPending ? 'Promoting...' : 'Promote'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function DesignRequests() {
  usePageTitle('Design Requests')
  const navigate = useNavigate()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRequest, setEditingRequest] = useState<DesignRequest | null>(null)
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false)
  const [promotingRequest, setPromotingRequest] = useState<DesignRequest | null>(null)

  const { data: requestsData, isLoading } = useDesignRequests()
  const deleteRequest = useDeleteDesignRequest()
  const updateRequest = useUpdateDesignRequest()

  const handleEditRequest = (dr: DesignRequest) => {
    setEditingRequest(dr)
    setDialogOpen(true)
  }

  const handleAddNew = () => {
    navigate('/design-requests/new')
  }

  const handlePromote = (dr: DesignRequest) => {
    setPromotingRequest(dr)
    setPromoteDialogOpen(true)
  }

  const columns: ColumnDef<DesignRequest>[] = useMemo(
    () => [
      {
        accessorKey: 'file_number',
        header: 'File #',
        cell: ({ row }) => (
          <span className="font-medium font-mono">{row.getValue('file_number')}</span>
        ),
      },
      {
        accessorKey: 'ident',
        header: 'Identifier',
        cell: ({ row }) => row.getValue('ident') || '-',
      },
      {
        accessorKey: 'style',
        header: 'Style',
        cell: ({ row }) => row.getValue('style') || '-',
      },
      {
        accessorKey: 'customer_name',
        header: 'Customer',
        cell: ({ row }) => row.getValue('customer_name') || '-',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const s = row.getValue('status') as DesignRequestStatus
          const Icon = statusIcons[s]
          return (
            <Badge variant={statusColors[s]} className="gap-1">
              <Icon className="h-3 w-3" />
              {statusLabels[s]}
            </Badge>
          )
        },
      },
      {
        id: 'dimensions',
        header: 'Dimensions',
        cell: ({ row }) => {
          const dr = row.original
          const parts = [dr.length, dr.width, dr.depth].filter(Boolean)
          return parts.length > 0 ? parts.join(' x ') : '-'
        },
      },
      {
        id: 'checklist',
        header: 'Checklist',
        cell: ({ row }) => {
          const dr = row.original
          const checks = [dr.has_ard, dr.has_pdf, dr.has_eps, dr.has_dxf, dr.has_samples, dr.pallet_configuration]
          const done = checks.filter(Boolean).length
          return (
            <span className="text-sm text-muted-foreground">{done}/{checks.length}</span>
          )
        },
      },
      {
        accessorKey: 'assigned_to_name',
        header: 'Assigned To',
        cell: ({ row }) => row.getValue('assigned_to_name') || '-',
      },
      {
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => {
          const date = row.getValue('created_at') as string
          return date ? new Date(date).toLocaleDateString() : '-'
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const dr = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEditRequest(dr)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                {dr.status === 'pending' && (
                  <DropdownMenuItem
                    onClick={() => updateRequest.mutate({ id: dr.id, status: 'in_progress' })}
                  >
                    <Loader2 className="mr-2 h-4 w-4" />
                    Start Work
                  </DropdownMenuItem>
                )}
                {dr.status === 'in_progress' && (
                  <>
                    <DropdownMenuItem
                      onClick={() => updateRequest.mutate({ id: dr.id, status: 'approved' })}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Approve
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => updateRequest.mutate({ id: dr.id, status: 'rejected' })}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </DropdownMenuItem>
                  </>
                )}
                {dr.status === 'approved' && !dr.generated_item && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handlePromote(dr)}>
                      <Rocket className="mr-2 h-4 w-4" />
                      Promote to Item
                    </DropdownMenuItem>
                  </>
                )}
                {dr.generated_item_sku && (
                  <DropdownMenuItem disabled>
                    <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                    Item: {dr.generated_item_sku}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this design request?')) {
                      deleteRequest.mutate(dr.id)
                    }
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [deleteRequest, updateRequest]
  )

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Design Requests</h1>
          <p className="text-muted-foreground">
            Track packaging design requests from concept to production item
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Design Request
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            All Design Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <DataTable
              columns={columns}
              data={requestsData?.results ?? []}
              searchColumn="ident"
              searchPlaceholder="Search by identifier..."
            />
          )}
        </CardContent>
      </Card>

      <DesignRequestDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingRequest(null)
        }}
        designRequest={editingRequest}
      />

      <PromoteDialog
        open={promoteDialogOpen}
        onOpenChange={(open) => {
          setPromoteDialogOpen(open)
          if (!open) setPromotingRequest(null)
        }}
        designRequest={promotingRequest}
      />
    </div>
  )
}
