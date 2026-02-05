import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, MoreHorizontal, Pencil, Trash2, Eye, FileText, CheckCircle, XCircle, Play } from 'lucide-react'
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
  useContracts,
  useDeleteContract,
  useActivateContract,
  useCancelContract,
  useCompleteContract,
} from '@/api/contracts'
import { ContractDialog } from '@/components/contracts/ContractDialog'
import type { Contract, ContractStatus } from '@/types/api'

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

export default function Contracts() {
  usePageTitle('Contracts')

  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingContract, setEditingContract] = useState<Contract | null>(null)

  // Handle URL params for action=new
  useEffect(() => {
    const action = searchParams.get('action')
    if (action === 'new') {
      setEditingContract(null)
      setDialogOpen(true)
      // Clear the action param after opening dialog
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

  const columns: ColumnDef<Contract>[] = useMemo(
    () => [
      {
        accessorKey: 'contract_number',
        header: 'Contract #',
        cell: ({ row }) => (
          <button
            className="font-medium text-primary hover:underline"
            onClick={() => handleViewContract(row.original)}
          >
            CTR-{row.getValue('contract_number')}
          </button>
        ),
      },
      {
        accessorKey: 'customer_name',
        header: 'Customer',
      },
      {
        accessorKey: 'blanket_po',
        header: 'Blanket PO',
        cell: ({ row }) => row.getValue('blanket_po') || '-',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.getValue('status') as ContractStatus
          return (
            <Badge variant={statusColors[status]}>
              {statusLabels[status]}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'num_lines',
        header: 'Lines',
        cell: ({ row }) => row.getValue('num_lines') || 0,
      },
      {
        accessorKey: 'total_committed_qty',
        header: 'Committed',
        cell: ({ row }) => row.getValue('total_committed_qty')?.toLocaleString() || 0,
      },
      {
        accessorKey: 'total_released_qty',
        header: 'Released',
        cell: ({ row }) => row.getValue('total_released_qty')?.toLocaleString() || 0,
      },
      {
        accessorKey: 'completion_percentage',
        header: 'Progress',
        cell: ({ row }) => {
          const pct = row.getValue('completion_percentage') as number
          return (
            <div className="flex items-center gap-2">
              <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <span className="text-sm text-muted-foreground">{pct}%</span>
            </div>
          )
        },
      },
      {
        accessorKey: 'issue_date',
        header: 'Issue Date',
        cell: ({ row }) => {
          const date = row.getValue('issue_date') as string
          return date ? new Date(date).toLocaleDateString() : '-'
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
                    onClick={() => activateContract.mutate(contract.id)}
                    disabled={contract.num_lines === 0}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Activate
                  </DropdownMenuItem>
                )}
                {contract.status === 'active' && (
                  <>
                    <DropdownMenuItem
                      onClick={() => completeContract.mutate(contract.id)}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Mark Complete
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => {
                        if (confirm('Are you sure you want to cancel this contract?')) {
                          cancelContract.mutate(contract.id)
                        }
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
                      if (confirm('Are you sure you want to delete this contract?')) {
                        deleteContract.mutate(contract.id)
                      }
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
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Contracts</h1>
          <p className="text-muted-foreground">
            Manage blanket orders and customer commitments
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Contract
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            All Contracts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <DataTable
              columns={columns}
              data={contractsData?.results ?? []}
              searchColumn="customer_name"
              searchPlaceholder="Search by customer..."
              onRowDoubleClick={(contract) => navigate(`/contracts/${contract.id}`)}
            />
          )}
        </CardContent>
      </Card>

      <ContractDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingContract(null)
        }}
        contract={editingContract}
        onSuccess={(contract) => {
          // Navigate to contract detail page after creation
          if (!editingContract) {
            navigate(`/contracts/${contract.id}`)
          }
        }}
      />
    </div>
  )
}
