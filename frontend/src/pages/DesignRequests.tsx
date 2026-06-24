import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef, type SortingState } from '@tanstack/react-table'
import {
  Plus, MoreHorizontal, Pencil, Trash2, Rocket,
  CheckCircle, XCircle, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExportButton } from '@/components/ui/export-button'
import { DataTable } from '@/components/ui/data-table'
import { TableSkeleton } from '@/components/ui/table-skeleton'
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
  useDesignRequestsInfinite,
  useDeleteDesignRequest,
  useUpdateDesignRequest,
  usePromoteDesign,
  useCheckoutDesign,
  useReleaseDesign,
} from '@/api/design'
import { useUnitsOfMeasure } from '@/api/items'
import api from '@/api/client'
import { fetchAllPages } from '@/lib/paginate'
import { DesignRequestDialog } from '@/components/design/DesignRequestDialog'
import type { DesignRequest, DesignRequestStatus } from '@/types/api'
import { toast } from 'sonner'
import { toastApiError } from '@/lib/errors'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader, TabStrip } from '@/components/page'

import { getStatusBadge } from '@/components/ui/StatusBadge'
import { useCommentCounts } from '@/api/collaboration'
import { CommentCountBadge } from '@/components/collaboration/CommentCountBadge'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'

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
      toastApiError(err, 'Failed to promote design')
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
  usePageTitle('Design Center')
  const navigate = useNavigate()
  const { user } = useAuth()

  const [activeTab, setActiveTab] = useState<string>('pending')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRequest, setEditingRequest] = useState<DesignRequest | null>(null)
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false)
  const [promotingRequest, setPromotingRequest] = useState<DesignRequest | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  // --- Server-side list (search + sort + "Load more") ---
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [chunkSize, setChunkSize] = useState(50)

  // Debounce the search box so we hit the server ~300ms after the user stops typing.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Map TanStack sort state → DRF `?ordering=` (single column; `-` prefix = descending).
  // Backend ordering_fields = ['file_number', 'created_at', 'status'] only.
  const ordering = useMemo(() => {
    if (!sorting.length) return undefined
    const s = sorting[0]
    return s.desc ? `-${s.id}` : s.id
  }, [sorting])

  const listFilters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      status: activeTab === 'all' || activeTab === 'my-work' ? undefined : activeTab,
      mine: activeTab === 'my-work' ? true : undefined,
      ordering,
      page_size: chunkSize,
    }),
    [debouncedSearch, activeTab, ordering, chunkSize],
  )

  const query = useDesignRequestsInfinite(listFilters)
  const designRequests = useMemo(
    () => query.data?.pages.flatMap((p) => p.results) ?? [],
    [query.data],
  )
  const totalCount = query.data?.pages[0]?.count ?? 0

  // Lightweight server-side count queries to drive the Pending + My Work tab badges
  // (reflect the full server total, not just the loaded chunk).
  const { data: pendingCountData } = useDesignRequests({ status: 'pending' })
  const { data: mineCountData } = useDesignRequests({ mine: true })
  const pendingCount = pendingCountData?.count ?? 0
  const mineCount = mineCountData?.count ?? 0

  // Bulk comment counts for the visible design-request rows (single query).
  const designIds = useMemo(() => designRequests.map(dr => dr.id), [designRequests])
  const { data: designCommentCounts } = useCommentCounts('designrequest', designIds)

  const deleteRequest = useDeleteDesignRequest()
  const updateRequest = useUpdateDesignRequest()
  const checkoutDesign = useCheckoutDesign()
  const releaseDesign = useReleaseDesign()

  const handleEditRequest = (dr: DesignRequest) => {
    setEditingRequest(dr)
    setDialogOpen(true)
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
        id: 'checkout_actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const dr = row.original
          const isCheckedOutByMe = user?.id != null && dr.checked_out_by === user.id
          if (dr.status === 'pending' && !dr.checked_out_by) {
            return (
              <button
                className={primaryBtnClass}
                style={checkoutDesign.isPending ? { ...primaryBtnStyle, opacity: 0.6 } : primaryBtnStyle}
                onClick={(e) => { e.stopPropagation(); checkoutDesign.mutate(dr.id) }}
                disabled={checkoutDesign.isPending}
              >
                Check Out
              </button>
            )
          }
          if (isCheckedOutByMe) {
            return (
              <button
                className={outlineBtnClass}
                style={releaseDesign.isPending ? { ...outlineBtnStyle, opacity: 0.6 } : outlineBtnStyle}
                onClick={(e) => { e.stopPropagation(); releaseDesign.mutate(dr.id) }}
                disabled={releaseDesign.isPending}
              >
                Release
              </button>
            )
          }
          return null
        },
      },
      {
        accessorKey: 'ident',
        header: 'Identifier',
        enableSorting: false,
        cell: ({ row }) => <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('ident') || '-'}</span>,
      },
      {
        accessorKey: 'style',
        header: 'Style',
        enableSorting: false,
        cell: ({ row }) => <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('style') || '-'}</span>,
      },
      {
        accessorKey: 'customer_name',
        header: 'Customer',
        enableSorting: false,
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
        enableSorting: false,
        cell: ({ row }) => {
          const dr = row.original
          const parts = [dr.length, dr.width, dr.depth].filter(Boolean)
          return <span style={{ color: 'var(--so-text-secondary)' }}>{parts.length > 0 ? parts.join(' x ') : '-'}</span>
        },
      },
      {
        id: 'checklist',
        header: 'Checklist',
        enableSorting: false,
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
        enableSorting: false,
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
        id: 'comments',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <CommentCountBadge
            count={designCommentCounts?.[String(row.original.id)] ?? 0}
            onClick={() => navigate(`/design-requests/${row.original.id}`)}
          />
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
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
    [deleteRequest, updateRequest, checkoutDesign, releaseDesign, user, designCommentCounts, navigate]
  )

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16">

        <PageHeader
          title="Design Center"
          description="Track packaging design requests from concept to production item"
          primary={{ label: 'New Design Request', icon: Plus, onClick: () => navigate('/design-requests/new') }}
          trailing={
            <ExportButton
              // Fetch ALL matching rows at click time (respecting the active tab +
              // search) rather than only the chunks already loaded into the list.
              fetchData={async () => {
                const all = await fetchAllPages<DesignRequest>(api, '/design-requests/', {
                  ...(activeTab === 'all' || activeTab === 'my-work' ? {} : { status: activeTab }),
                  ...(activeTab === 'my-work' ? { mine: true } : {}),
                  ...(debouncedSearch ? { search: debouncedSearch } : {}),
                })
                return all as unknown as Record<string, unknown>[]
              }}
              filename="design-requests"
              columns={[
                { key: 'file_number', header: 'Request #' },
                { key: 'customer_name', header: 'Customer' },
                { key: 'ident', header: 'Title' },
                { key: 'style', header: 'Style' },
                { key: 'status', header: 'Status' },
                { key: 'created_at', header: 'Created' },
              ]}
              iconOnly
            />
          }
        />

        <div className="mb-4 animate-in delay-1">
          <TabStrip
            tabs={[
              { id: 'pending', label: 'Pending', count: pendingCount },
              { id: 'in_progress', label: 'In Progress' },
              { id: 'approved', label: 'Approved' },
              { id: 'my-work', label: 'My Work', count: mineCount },
              { id: 'all', label: 'All' },
            ]}
            active={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {/* Table Card */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-2"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
              Design Center
            </span>
            <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
              {totalCount} total
            </span>
          </div>
          {query.isLoading ? (
            <div className="p-6"><TableSkeleton columns={11} rows={8} /></div>
          ) : (
            <DataTable
              storageKey="design-requests"
              columns={columns}
              data={designRequests}
              searchPlaceholder="Search file #, identifier, style, customer…"
              onRowClick={(row) => navigate(`/design-requests/${row.id}`)}
              server={{
                searchValue: search,
                onSearchChange: setSearch,
                sorting,
                onSortingChange: setSorting,
                totalCount,
                hasMore: !!query.hasNextPage,
                onLoadMore: () => query.fetchNextPage(),
                isFetchingMore: query.isFetchingNextPage,
                pageSize: chunkSize,
                onPageSizeChange: setChunkSize,
              }}
              // Drop the widest, least-essential columns on a narrow card; they stay
              // reachable via the column picker.
              responsiveColumns={{
                customer_name: 640,
                status: 720,
                dimensions: 820,
                checklist: 920,
                assigned_to_name: 1020,
                created_at: 1120,
              }}
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
