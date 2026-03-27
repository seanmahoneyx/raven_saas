import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, MoreHorizontal, Pencil, Trash2, Eye, FileText, CheckCircle, XCircle, Play, Printer, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  useContracts,
  useDeleteContract,
  useActivateContract,
  useCancelContract,
  useCompleteContract,
} from '@/api/contracts'
import { ContractDialog } from '@/components/contracts/ContractDialog'
import type { Contract, ContractStatus } from '@/types/api'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { useSettings } from '@/api/settings'
import { ReportFilterModal, type ReportFilterConfig, type ReportFilterResult } from '@/components/common/ReportFilterModal'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { FolderTabs } from '@/components/ui/folder-tabs'

const statusLabels: Record<ContractStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  complete: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired',
}

export default function Contracts() {
  usePageTitle('Contracts')

  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingContract, setEditingContract] = useState<Contract | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const [pendingCancelId, setPendingCancelId] = useState<number | null>(null)

  // Handle URL params for action=new
  useEffect(() => {
    const action = searchParams.get('action')
    if (action === 'new') {
      setEditingContract(null)
      setDialogOpen(true)
      searchParams.delete('action')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const { data: settingsData } = useSettings()
  const [printFilterOpen, setPrintFilterOpen] = useState(false)
  const [exportFilterOpen, setExportFilterOpen] = useState(false)
  const [printFilters, setPrintFilters] = useState<ReportFilterResult | null>(null)

  const { data: contractsData, isLoading } = useContracts()
  const deleteContract = useDeleteContract()
  const activateContract = useActivateContract()
  const cancelContract = useCancelContract()
  const completeContract = useCompleteContract()

  const handleViewContract = (contract: Contract) => {
    navigate(`/contracts/${contract.id}`)
  }

  const handleEditContract = (contract: Contract) => {
    setEditingContract(contract)
    setDialogOpen(true)
  }

  const handleAddNew = () => {
    setEditingContract(null)
    setDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return
    try {
      await deleteContract.mutateAsync(pendingDeleteId)
      toast.success('Contract deleted successfully')
      setDeleteDialogOpen(false)
      setPendingDeleteId(null)
    } catch (error) {
      toast.error('Failed to delete contract')
    }
  }

  const handleConfirmCancel = async () => {
    if (!pendingCancelId) return
    try {
      await cancelContract.mutateAsync(pendingCancelId)
      toast.success('Contract cancelled successfully')
      setCancelDialogOpen(false)
      setPendingCancelId(null)
    } catch (error) {
      toast.error('Failed to cancel contract')
    }
  }

  const [activeTab, setActiveTab] = useState<'all' | 'blanket' | 'direct'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // KPI stats
  const contracts = contractsData?.results ?? []
  const tabContracts = activeTab === 'all' ? contracts : contracts.filter(c => c.contract_type === activeTab)

  const customerOptions = useMemo(() => {
    const names = new Set(tabContracts.map(c => c.customer_name).filter(Boolean))
    return Array.from(names).sort()
  }, [tabContracts])

  const filteredContracts = useMemo(() => {
    return tabContracts.filter(c => {
      if (searchTerm && !c.contract_number.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !(c.blanket_po || '').toLowerCase().includes(searchTerm.toLowerCase())) {
        return false
      }
      if (selectedCustomer !== 'all' && c.customer_name !== selectedCustomer) return false
      if (selectedStatus !== 'all' && c.status !== selectedStatus) return false
      if (dateFrom && c.issue_date < dateFrom) return false
      if (dateTo && c.issue_date > dateTo) return false
      return true
    })
  }, [tabContracts, searchTerm, selectedCustomer, selectedStatus, dateFrom, dateTo])

  const activeCount = filteredContracts.filter((c) => c.status === 'active').length
  const draftCount = filteredContracts.filter((c) => c.status === 'draft').length
  const totalCommitted = filteredContracts.reduce((sum, c) => sum + (c.total_committed_qty ?? 0), 0)

  const columns: ColumnDef<Contract>[] = useMemo(
    () => [
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => getStatusBadge(row.getValue('status') as string),
      },
      {
        accessorKey: 'issue_date',
        header: 'Issue Date',
        cell: ({ row }) => {
          const date = row.getValue('issue_date') as string
          return (
            <span className="whitespace-nowrap" style={{ color: 'var(--so-text-secondary)' }}>
              {date ? new Date(date).toLocaleDateString() : '-'}
            </span>
          )
        },
      },
      {
        accessorKey: 'contract_number',
        header: 'Contract #',
        cell: ({ row }) => (
          <button
            className="font-medium hover:underline whitespace-nowrap"
            style={{ color: 'var(--so-accent)' }}
            onClick={() => handleViewContract(row.original)}
          >
            {String(row.getValue('contract_number')).startsWith('CTR-') ? row.getValue('contract_number') : `CTR-${row.getValue('contract_number')}`}
          </button>
        ),
      },
      {
        accessorKey: 'customer_name',
        header: 'Customer',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-primary)' }}>{row.getValue('customer_name')}</span>
        ),
      },
      {
        accessorKey: 'blanket_po',
        header: 'Blanket PO',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-tertiary)' }}>{row.getValue('blanket_po') || '-'}</span>
        ),
      },
      {
        accessorKey: 'total_committed_qty',
        header: 'Committed',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-secondary)' }}>
            {row.getValue('total_committed_qty')?.toLocaleString() || 0}
          </span>
        ),
      },
      {
        accessorKey: 'total_released_qty',
        header: 'Released',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-secondary)' }}>
            {row.getValue('total_released_qty')?.toLocaleString() || 0}
          </span>
        ),
      },
      {
        accessorKey: 'completion_percentage',
        header: 'Progress',
        cell: ({ row }) => {
          const pct = row.getValue('completion_percentage') as number
          return (
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--so-border)' }}>
                <div
                  className="h-full transition-all"
                  style={{ width: `${Math.min(pct, 100)}%`, background: 'var(--so-accent)' }}
                />
              </div>
              <span className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>{pct}%</span>
            </div>
          )
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const contract = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleViewContract(contract)}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </DropdownMenuItem>
                {contract.status === 'draft' && (
                  <DropdownMenuItem onClick={() => handleEditContract(contract)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {contract.status === 'draft' && (
                  <DropdownMenuItem
                    onClick={() => {
                      activateContract.mutate(contract.id)
                      toast.success('Contract activated')
                    }}
                    disabled={contract.num_lines === 0}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Activate
                  </DropdownMenuItem>
                )}
                {contract.status === 'active' && (
                  <>
                    <DropdownMenuItem
                      onClick={() => {
                        completeContract.mutate(contract.id)
                        toast.success('Contract completed')
                      }}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Mark Complete
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => {
                        setPendingCancelId(contract.id)
                        setCancelDialogOpen(true)
                      }}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Cancel
                    </DropdownMenuItem>
                  </>
                )}
                {contract.status === 'draft' && (
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => {
                      setPendingDeleteId(contract.id)
                      setDeleteDialogOpen(true)
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [deleteContract, activateContract, cancelContract, completeContract, navigate]
  )

  const reportFilterConfig: ReportFilterConfig = {
    title: 'Contracts',
    columns: [
      { key: 'contract_number', header: 'Contract #' },
      { key: 'customer_name', header: 'Customer' },
      { key: 'issue_date', header: 'Start' },
      { key: 'expiration_date', header: 'End' },
      { key: 'status', header: 'Status' },
      { key: 'total_committed_qty', header: 'Value' },
    ],
    rowFilters: [
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'expired', label: 'Expired' },
          { value: 'draft', label: 'Draft' },
          { value: 'cancelled', label: 'Cancelled' },
        ],
      },
    ],
  }

  const handleFilteredPrint = (filters: ReportFilterResult) => {
    setPrintFilters(filters)
    setTimeout(() => window.print(), 100)
  }

  const handleFilteredExport = (filters: ReportFilterResult) => {
    let rows = contracts
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
    const csv = [cols.map(c => esc(c.header)).join(','), ...rows.map(r => cols.map(c => esc((r as Record<string, unknown>)[c.key])).join(','))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `contracts-${new Date().toISOString().split('T')[0]}.csv`; a.style.display = 'none'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const printFilteredData = useMemo(() => {
    let rows = contracts
    if (printFilters) {
      if (printFilters.rowFilters.status && printFilters.rowFilters.status !== 'all') {
        rows = rows.filter(r => r.status === printFilters.rowFilters.status)
      }
    }
    return rows
  }, [contracts, printFilters])

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16" data-print-hide>

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>Contracts</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>
              Manage contracts and customer commitments
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className={primaryBtnClass} style={primaryBtnStyle} onClick={handleAddNew}>
              <Plus className="h-4 w-4" />
              New Contract
            </button>
            <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setExportFilterOpen(true)} title="Export CSV">
              <Download className="h-4 w-4" />
            </button>
            <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setPrintFilterOpen(true)} title="Print">
              <Printer className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="mb-6 animate-in">
          <FolderTabs
            tabs={[
              { id: 'all', label: 'All Contracts' },
              { id: 'blanket', label: 'Blanket' },
              { id: 'direct', label: 'Direct' },
            ]}
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as 'all' | 'blanket' | 'direct')}
          />
        </div>

        {/* KPI Summary Cards */}
        <div className="rounded-[14px] mb-6 overflow-hidden animate-in delay-1"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
          <div className="grid grid-cols-4 divide-x" style={{ borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-5">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Total Contracts
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>
                {filteredContracts.length}
              </div>
            </div>
            <div className="px-6 py-5" style={{ borderColor: 'var(--so-border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Active
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--so-success-text)' }}>
                {activeCount}
              </div>
            </div>
            <div className="px-6 py-5" style={{ borderColor: 'var(--so-border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Draft
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--so-warning-text)' }}>
                {draftCount}
              </div>
            </div>
            <div className="px-6 py-5" style={{ borderColor: 'var(--so-border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Total Committed Qty
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>
                {totalCommitted.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-5 animate-in delay-2">
          <div className="py-3">
            <div className="grid gap-4 md:grid-cols-5">
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Search</label>
                <Input
                  placeholder="Contract # or PO..."
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
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
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

        {/* DataTable Card */}
        <div className="rounded-[14px] overflow-hidden animate-in delay-3"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
          <div className="px-6 py-4 flex items-center gap-2"
            style={{ borderBottom: '1px solid var(--so-border-light)', background: 'var(--so-surface-raised)' }}>
            <FileText className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
              {activeTab === 'all' ? 'All Contracts' : activeTab === 'blanket' ? 'Blanket Contracts' : 'Direct Contracts'}
            </span>
          </div>
          <div className="p-4">
            {isLoading ? (
              <div className="text-center py-8 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
            ) : (
              <DataTable
                storageKey="contracts"
                columns={columns}
                data={filteredContracts}
                onRowClick={(contract) => navigate(`/contracts/${contract.id}`)}
              />
            )}
          </div>
        </div>

      </div>

      <ContractDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingContract(null)
        }}
        contract={editingContract}
        onSuccess={(contract) => {
          if (!editingContract) {
            navigate(`/contracts/${contract.id}`)
          }
        }}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Contract"
        description="Are you sure you want to delete this contract? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        loading={deleteContract.isPending}
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
            <div style={{ fontSize: '18pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px' }}>Contracts</div>
            <div style={{ fontSize: '10pt', color: '#555', marginTop: '4px' }}>{printFilters?.dateRangeLabel || ''}</div>
            <div style={{ fontSize: '9pt', color: '#555', marginTop: '4px', padding: '2px 10px', border: '1px solid #999', display: 'inline-block' }}>{printFilteredData.length} contracts</div>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
          <thead>
            <tr>
              {[
                { key: 'contract_number', label: 'Contract #' },
                { key: 'customer_name', label: 'Customer' },
                { key: 'issue_date', label: 'Start' },
                { key: 'expiration_date', label: 'End' },
                { key: 'status', label: 'Status' },
                { key: 'total_committed_qty', label: 'Value' },
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
                  {showCol('contract_number') && <td style={{ padding: '4px 6px', border: '1px solid #ccc', fontFamily: 'monospace' }}>CTR-{row.contract_number}</td>}
                  {showCol('customer_name') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.customer_name}</td>}
                  {showCol('issue_date') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.issue_date ? new Date(row.issue_date).toLocaleDateString() : '\u2014'}</td>}
                  {showCol('expiration_date') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.expiration_date ? new Date(row.expiration_date).toLocaleDateString() : '\u2014'}</td>}
                  {showCol('status') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.status}</td>}
                  {showCol('total_committed_qty') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{row.total_committed_qty?.toLocaleString() || 0}</td>}
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
