import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import {
  Plus, MoreHorizontal, Pencil, Trash2, Rocket,
  CheckCircle, XCircle, Loader2, Palette, Printer, Download,
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
import { useSettings } from '@/api/settings'
import { ReportFilterModal, type ReportFilterConfig, type ReportFilterResult } from '@/components/common/ReportFilterModal'

import { getStatusBadge } from '@/components/ui/StatusBadge'
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

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: requestsData, isLoading } = useDesignRequests()
  const deleteRequest = useDeleteDesignRequest()
  const updateRequest = useUpdateDesignRequest()
  const { data: settingsData } = useSettings()
  const [printFilterOpen, setPrintFilterOpen] = useState(false)
  const [exportFilterOpen, setExportFilterOpen] = useState(false)
  const [printFilters, setPrintFilters] = useState<ReportFilterResult | null>(null)

  const designRequests = requestsData?.results ?? []

  const customerOptions = useMemo(() => {
    const names = new Set(designRequests.map(dr => dr.customer_name).filter((n): n is string => Boolean(n)))
    return Array.from(names).sort()
  }, [designRequests])

  const filteredDesignRequests = useMemo(() => {
    return designRequests.filter(dr => {
      if (searchTerm && !(dr.ident || '').toLowerCase().includes(searchTerm.toLowerCase()) &&
          !(dr.file_number || '').toLowerCase().includes(searchTerm.toLowerCase())) {
        return false
      }
      if (selectedCustomer !== 'all' && dr.customer_name !== selectedCustomer) {
        return false
      }
      if (selectedStatus !== 'all' && dr.status !== selectedStatus) {
        return false
      }
      if (dateFrom && dr.created_at && dr.created_at < dateFrom) {
        return false
      }
      if (dateTo && dr.created_at && dr.created_at > dateTo + 'T23:59:59') {
        return false
      }
      return true
    })
  }, [designRequests, searchTerm, selectedCustomer, selectedStatus, dateFrom, dateTo])

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

  const reportFilterConfig: ReportFilterConfig = {
    title: 'Design Requests',
    columns: [
      { key: 'file_number', header: 'Request #' },
      { key: 'customer_name', header: 'Customer' },
      { key: 'ident', header: 'Title' },
      { key: 'status', header: 'Status' },
      { key: 'created_at', header: 'Created' },
    ],
    rowFilters: [
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'pending', label: 'Pending' },
          { value: 'in_progress', label: 'In Progress' },
          { value: 'completed', label: 'Completed' },
          { value: 'rejected', label: 'Cancelled' },
        ],
      },
    ],
  }

  const handleFilteredPrint = (filters: ReportFilterResult) => {
    setPrintFilters(filters)
    setTimeout(() => window.print(), 100)
  }

  const handleFilteredExport = (filters: ReportFilterResult) => {
    let rows = designRequests
    if (filters.rowFilters.status && filters.rowFilters.status !== 'all') {
      rows = rows.filter(r => r.status === filters.rowFilters.status)
    }
    if (rows.length === 0) return

    const allCols = reportFilterConfig.columns
    const cols = allCols.filter(c => filters.visibleColumns.includes(c.key))
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[,"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const csv = [cols.map(c => esc(c.header)).join(','), ...rows.map(r => cols.map(c => {
      const key = c.key
      if (key === 'created_at') return esc(r.created_at ? new Date(r.created_at).toLocaleDateString() : '')
      return esc((r as unknown as Record<string, unknown>)[key])
    }).join(','))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `design-requests-${new Date().toISOString().split('T')[0]}.csv`; a.style.display = 'none'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const printFilteredData = useMemo(() => {
    let rows = designRequests
    if (printFilters) {
      if (printFilters.rowFilters.status && printFilters.rowFilters.status !== 'all') {
        rows = rows.filter(r => r.status === printFilters.rowFilters.status)
      }
    }
    return rows
  }, [designRequests, printFilters])

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16" data-print-hide>

        {/* Header */}
        <div className="flex items-start justify-between mb-8 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>Design Requests</h1>
            <p className="mt-1 text-[13.5px]" style={{ color: 'var(--so-text-muted)' }}>
              Track packaging design requests from concept to production item
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className={primaryBtnClass} style={primaryBtnStyle} onClick={handleAddNew}>
              <Plus className="h-4 w-4" />
              New Design Request
            </button>
            <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setExportFilterOpen(true)} title="Export CSV">
              <Download className="h-4 w-4" />
            </button>
            <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setPrintFilterOpen(true)} title="Print">
              <Printer className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-5 animate-in delay-2">
          <div className="py-3">
            <div className="grid gap-4 md:grid-cols-5">
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Search</label>
                <Input
                  placeholder="Search by identifier..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Customer</label>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                  <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                    <SelectValue placeholder="All customers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All customers</SelectItem>
                    {customerOptions.map(customer => (
                      <SelectItem key={customer} value={customer}>
                        {customer}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Status</label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {['pending', 'in_progress', 'approved', 'rejected', 'completed'].map(status => (
                      <SelectItem key={status} value={status}>
                        {status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>From Date</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>To Date</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Table Card */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4" style={{ color: 'var(--so-text-muted)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>All Design Requests</span>
            </div>
            <span className="text-[12px]" style={{ color: 'var(--so-text-muted)' }}>
              {filteredDesignRequests.length} of {designRequests.length}
            </span>
          </div>
          {isLoading ? (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--so-text-muted)' }}>Loading...</div>
          ) : (
            <DataTable
              storageKey="design-requests"
              columns={columns}
              data={filteredDesignRequests}
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

      {/* Print-only section */}
      <div className="print-only" style={{ color: 'black' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', paddingBottom: '16px', borderBottom: '3px solid #333' }}>
          <div>
            <div style={{ fontSize: '22pt', fontWeight: 700, letterSpacing: '-0.5px' }}>{settingsData?.company_name || 'Company'}</div>
            {settingsData?.company_address && <div style={{ fontSize: '9pt', color: '#555', whiteSpace: 'pre-line', marginTop: '4px' }}>{settingsData.company_address}</div>}
            {(settingsData?.company_phone || settingsData?.company_email) && (
              <div style={{ fontSize: '9pt', color: '#555', marginTop: '2px' }}>{[settingsData?.company_phone, settingsData?.company_email].filter(Boolean).join(' | ')}</div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px' }}>Design Requests</div>
            <div style={{ fontSize: '10pt', color: '#555', marginTop: '4px' }}>{printFilters?.dateRangeLabel || ''}</div>
            <div style={{ fontSize: '9pt', color: '#555', marginTop: '4px', padding: '2px 10px', border: '1px solid #999', display: 'inline-block' }}>{printFilteredData.length} requests</div>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
          <thead>
            <tr>
              {[
                { key: 'file_number', label: 'Request #' },
                { key: 'customer_name', label: 'Customer' },
                { key: 'ident', label: 'Title' },
                { key: 'status', label: 'Status' },
                { key: 'created_at', label: 'Created' },
              ].filter(h => !printFilters || printFilters.visibleColumns.includes(h.key)).map(h => (
                <th key={h.key} style={{ padding: '5px 6px', border: '1px solid #ccc', background: '#f5f5f5', fontWeight: 600, textAlign: 'left' }}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {printFilteredData.map(row => {
              const showCol = (key: string) => !printFilters || printFilters.visibleColumns.includes(key)
              return (
                <tr key={row.id}>
                  {showCol('file_number') && <td style={{ padding: '4px 6px', border: '1px solid #ccc', fontFamily: 'monospace' }}>{row.file_number}</td>}
                  {showCol('customer_name') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.customer_name || '\u2014'}</td>}
                  {showCol('ident') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.ident || '\u2014'}</td>}
                  {showCol('status') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.status.replace('_', ' ')}</td>}
                  {showCol('created_at') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.created_at ? new Date(row.created_at).toLocaleDateString() : '\u2014'}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ marginTop: '40px', paddingTop: '12px', borderTop: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', fontSize: '8pt', color: '#999' }}>
          <span>Printed {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</span>
          <span>{settingsData?.company_name || ''}</span>
        </div>
      </div>

      <ReportFilterModal open={printFilterOpen} onOpenChange={setPrintFilterOpen} config={reportFilterConfig} mode="print" onConfirm={handleFilteredPrint} />
      <ReportFilterModal open={exportFilterOpen} onOpenChange={setExportFilterOpen} config={reportFilterConfig} mode="export" onConfirm={handleFilteredExport} />
    </div>
  )
}
