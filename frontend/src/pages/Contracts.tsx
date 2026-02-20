import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, MoreHorizontal, Pencil, Trash2, Eye, FileText, CheckCircle, XCircle, Play } from 'lucide-react'
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

const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    draft:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    active:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    inactive:  { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    sent:      { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    partial:   { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    paid:      { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    overdue:   { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    void:      { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    complete:  { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    cancelled: { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    expired:   { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    confirmed: { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    applied:   { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    pending:   { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
  }
  const c = configs[status] || { bg: 'var(--so-warning-bg)', border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ background: c.text }} />
      {status}
    </span>
  )
}

const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

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

  // KPI stats
  const contracts = contractsData?.results ?? []
  const activeCount = contracts.filter((c) => c.status === 'active').length
  const draftCount = contracts.filter((c) => c.status === 'draft').length
  const totalCommitted = contracts.reduce((sum, c) => sum + (c.total_committed_qty ?? 0), 0)

  const columns: ColumnDef<Contract>[] = useMemo(
    () => [
      {
        accessorKey: 'contract_number',
        header: 'Contract #',
        cell: ({ row }) => (
          <button
            className="font-medium hover:underline"
            style={{ color: 'var(--so-accent)' }}
            onClick={() => handleViewContract(row.original)}
          >
            CTR-{row.getValue('contract_number')}
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
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => getStatusBadge(row.getValue('status') as string),
      },
      {
        accessorKey: 'num_lines',
        header: 'Lines',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('num_lines') || 0}</span>
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
        accessorKey: 'issue_date',
        header: 'Issue Date',
        cell: ({ row }) => {
          const date = row.getValue('issue_date') as string
          return (
            <span style={{ color: 'var(--so-text-secondary)' }}>
              {date ? new Date(date).toLocaleDateString() : '-'}
            </span>
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

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>Contracts</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>
              Manage blanket orders and customer commitments
            </p>
          </div>
          <button className={primaryBtnClass} style={primaryBtnStyle} onClick={handleAddNew}>
            <Plus className="h-3.5 w-3.5" />
            New Contract
          </button>
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
                {contracts.length}
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

        {/* DataTable Card */}
        <div className="rounded-[14px] overflow-hidden animate-in delay-2"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
          <div className="px-6 py-4 flex items-center gap-2"
            style={{ borderBottom: '1px solid var(--so-border-light)', background: 'var(--so-surface-raised)' }}>
            <FileText className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>All Contracts</span>
          </div>
          <div className="p-4">
            {isLoading ? (
              <div className="text-center py-8 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
            ) : (
              <DataTable
                storageKey="contracts"
                columns={columns}
                data={contractsData?.results ?? []}
                searchColumn="customer_name"
                searchPlaceholder="Search by customer..."
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
    </div>
  )
}
