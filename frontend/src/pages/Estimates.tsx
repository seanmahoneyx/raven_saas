import { useState, useMemo, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, MoreHorizontal, Pencil, Trash2, Send, ArrowRightLeft, FileText, AlertTriangle, FileDown } from 'lucide-react'
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
import { useEstimates, useDeleteEstimate, useSendEstimate, useConvertEstimate } from '@/api/estimates'
import { EstimateDialog } from '@/components/estimates/EstimateDialog'
import type { Estimate, EstimateStatus } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'

const statusVariant: Record<EstimateStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  draft: 'secondary',
  sent: 'default',
  accepted: 'success',
  rejected: 'destructive',
  converted: 'outline',
}

export default function Estimates() {
  usePageTitle('Estimates')
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEstimate, setEditingEstimate] = useState<Estimate | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const [pendingConvertId, setPendingConvertId] = useState<number | null>(null)

  // Handle URL params for action=new
  useEffect(() => {
    const action = searchParams.get('action')
    if (action === 'new') {
      setEditingEstimate(null)
      setDialogOpen(true)
      searchParams.delete('action')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const { data: estimatesData } = useEstimates()
  const deleteEstimate = useDeleteEstimate()
  const sendEstimate = useSendEstimate()
  const convertEstimate = useConvertEstimate()

  const handleAddNew = () => {
    setEditingEstimate(null)
    setDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return
    try {
      await deleteEstimate.mutateAsync(pendingDeleteId)
      toast.success('Estimate deleted successfully')
      setDeleteDialogOpen(false)
      setPendingDeleteId(null)
    } catch (error) {
      toast.error('Failed to delete estimate')
    }
  }

  const handleConfirmConvert = async () => {
    if (!pendingConvertId) return
    try {
      await convertEstimate.mutateAsync(pendingConvertId)
      toast.success('Estimate converted to Sales Order')
      setConvertDialogOpen(false)
      setPendingConvertId(null)
    } catch (error) {
      toast.error('Failed to convert estimate')
    }
  }

  const columns: ColumnDef<Estimate>[] = useMemo(
    () => [
      {
        accessorKey: 'estimate_number',
        header: 'Estimate #',
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.getValue('estimate_number')}</span>
        ),
      },
      {
        accessorKey: 'customer_name',
        header: 'Customer',
      },
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ row }) => format(new Date(row.getValue('date')), 'MMM d, yyyy'),
      },
      {
        accessorKey: 'expiration_date',
        header: 'Expires',
        cell: ({ row }) => {
          const date = row.getValue('expiration_date') as string | null
          const estimate = row.original
          if (!date) return <span className="text-muted-foreground">-</span>
          return (
            <span className={estimate.is_expired ? 'text-red-600 flex items-center gap-1' : ''}>
              {estimate.is_expired && <AlertTriangle className="h-3 w-3" />}
              {format(new Date(date), 'MMM d, yyyy')}
            </span>
          )
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.getValue('status') as EstimateStatus
          return (
            <Badge variant={statusVariant[status]}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'num_lines',
        header: 'Lines',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.getValue('num_lines')}</span>
        ),
      },
      {
        accessorKey: 'total_amount',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-medium">
            ${parseFloat(row.getValue('total_amount')).toFixed(2)}
          </span>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const est = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setEditingEstimate(est)
                  setDialogOpen(true)
                }}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                {est.status === 'draft' && (
                  <DropdownMenuItem onClick={() => {
                    sendEstimate.mutate({ id: est.id })
                    toast.success('Estimate sent to customer')
                  }}>
                    <Send className="mr-2 h-4 w-4" />
                    Send to Customer
                  </DropdownMenuItem>
                )}
                {(est.status === 'accepted' || est.status === 'draft' || est.status === 'sent') && (
                  <DropdownMenuItem onClick={() => {
                    setPendingConvertId(est.id)
                    setConvertDialogOpen(true)
                  }}>
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    Convert to Sales Order
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => window.open(`/api/v1/estimates/${est.id}/pdf/`, '_blank')}>
                  <FileDown className="mr-2 h-4 w-4" />
                  Download PDF
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    setPendingDeleteId(est.id)
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
    [deleteEstimate, sendEstimate, convertEstimate]
  )

  const estimates = estimatesData?.results ?? []

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Estimates</h1>
          <p className="text-muted-foreground">
            Create and manage customer estimates and quotes
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Estimate
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {estimates.filter((e) => e.status === 'draft').length}
            </div>
            <div className="text-sm text-muted-foreground">Draft</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {estimates.filter((e) => e.status === 'sent').length}
            </div>
            <div className="text-sm text-muted-foreground">Sent</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {estimates.filter((e) => e.status === 'accepted').length}
            </div>
            <div className="text-sm text-muted-foreground">Accepted</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {estimates.filter((e) => e.status === 'rejected').length}
            </div>
            <div className="text-sm text-muted-foreground">Rejected</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {estimates.filter((e) => e.status === 'converted').length}
            </div>
            <div className="text-sm text-muted-foreground">Converted</div>
          </CardContent>
        </Card>
      </div>

      {/* Estimates Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Estimates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={estimates}
            searchColumn="estimate_number"
            searchPlaceholder="Search estimates..."
            onRowClick={(estimate) => navigate(`/estimates/${estimate.id}`)}
          />
        </CardContent>
      </Card>

      {/* Dialog */}
      <EstimateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        estimate={editingEstimate}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Estimate"
        description="Are you sure you want to delete this estimate? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        loading={deleteEstimate.isPending}
      />

      <ConfirmDialog
        open={convertDialogOpen}
        onOpenChange={setConvertDialogOpen}
        title="Convert to Sales Order"
        description="Convert this estimate to a Sales Order? This action cannot be undone."
        confirmLabel="Convert"
        variant="default"
        onConfirm={handleConfirmConvert}
        loading={convertEstimate.isPending}
      />
    </div>
  )
}
