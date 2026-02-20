import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import {
  Plus, MoreHorizontal, Pencil, Trash2, Rocket,
  CheckCircle, XCircle, Clock, Loader2, Check, Palette,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import React from 'react'

const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    draft:       { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    active:      { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    inactive:    { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    pending:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    in_progress: { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    approved:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    rejected:    { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    completed:   { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    posted:      { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    confirmed:   { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    scheduled:   { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    picking:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    shipped:     { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    complete:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    cancelled:   { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    crossdock:   { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    received:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    sent:        { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    converted:   { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    expired:     { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
  }
  const c = configs[status] || { bg: 'var(--so-warning-bg)', border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ background: c.text }} />
      {status.replace('_', ' ')}
    </span>
  )
}

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

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
        <p className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>
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
          <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => onOpenChange(false)}>Cancel</button>
          <button
            className={primaryBtnClass}
            style={{ ...primaryBtnStyle, opacity: (!sku || !uom || promoteMutation.isPending) ? 0.6 : 1 }}
            onClick={handlePromote}
            disabled={!sku || !uom || promoteMutation.isPending}
          >
            {promoteMutation.isPending ? 'Promoting...' : 'Promote'}
          </button>
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

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

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return
    try {
      await deleteRequest.mutateAsync(pendingDeleteId)
      toast.success('Design request deleted successfully')
      setDeleteDialogOpen(false)
      setPendingDeleteId(null)
    } catch (error) {
      toast.error('Failed to delete design request')
    }
  }

  const columns: ColumnDef<DesignRequest>[] = useMemo(
    () => [
      {
        accessorKey: 'file_number',
        header: 'File #',
        cell: ({ row }) => (
          <span className="font-medium font-mono" style={{ color: 'var(--so-text-primary)' }}>{row.getValue('file_number')}</span>
        ),
      },
      {
        accessorKey: 'ident',
        header: 'Identifier',
        cell: ({ row }) => <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('ident') || '-'}</span>,
      },
      {
        accessorKey: 'style',
        header: 'Style',
        cell: ({ row }) => <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('style') || '-'}</span>,
      },
      {
        accessorKey: 'customer_name',
        header: 'Customer',
        cell: ({ row }) => <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('customer_name') || '-'}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const s = row.getValue('status') as DesignRequestStatus
          return getStatusBadge(s)
        },
      },
      {
        id: 'dimensions',
        header: 'Dimensions',
        cell: ({ row }) => {
          const dr = row.original
          const parts = [dr.length, dr.width, dr.depth].filter(Boolean)
          return <span style={{ color: 'var(--so-text-secondary)' }}>{parts.length > 0 ? parts.join(' x ') : '-'}</span>
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
            <span className="text-sm" style={{ color: 'var(--so-text-muted)' }}>{done}/{checks.length}</span>
          )
        },
      },
      {
        accessorKey: 'assigned_to_name',
        header: 'Assigned To',
        cell: ({ row }) => <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('assigned_to_name') || '-'}</span>,
      },
      {
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => {
          const date = row.getValue('created_at') as string
          return <span style={{ color: 'var(--so-text-muted)' }}>{date ? new Date(date).toLocaleDateString() : '-'}</span>
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
                    onClick={() => {
                      updateRequest.mutate({ id: dr.id, status: 'in_progress' })
                      toast.success('Status updated to In Progress')
                    }}
                  >
                    <Loader2 className="mr-2 h-4 w-4" />
                    Start Work
                  </DropdownMenuItem>
                )}
                {dr.status === 'in_progress' && (
                  <>
                    <DropdownMenuItem
                      onClick={() => {
                        updateRequest.mutate({ id: dr.id, status: 'approved' })
                        toast.success('Design request approved')
                      }}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Approve
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        updateRequest.mutate({ id: dr.id, status: 'rejected' })
                        toast.success('Design request rejected')
                      }}
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
                    setPendingDeleteId(dr.id)
                    setDeleteDialogOpen(true)
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
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-start justify-between mb-8 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>Design Requests</h1>
            <p className="mt-1 text-[13.5px]" style={{ color: 'var(--so-text-muted)' }}>
              Track packaging design requests from concept to production item
            </p>
          </div>
          <button className={primaryBtnClass} style={primaryBtnStyle} onClick={handleAddNew}>
            <Plus className="h-4 w-4" />
            New Design Request
          </button>
        </div>

        {/* Table Card */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4" style={{ color: 'var(--so-text-muted)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>All Design Requests</span>
            </div>
          </div>
          {isLoading ? (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--so-text-muted)' }}>Loading...</div>
          ) : (
            <DataTable
              storageKey="design-requests"
              columns={columns}
              data={requestsData?.results ?? []}
              searchColumn="ident"
              searchPlaceholder="Search by identifier..."
              onRowClick={(row) => navigate(`/design-requests/${row.id}`)}
            />
          )}
        </div>

      </div>

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

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Design Request"
        description="Are you sure you want to delete this design request? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        loading={deleteRequest.isPending}
      />
    </div>
  )
}
