import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, MoreHorizontal, Trash2, FileText } from 'lucide-react'
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
import { useRFQs, useDeleteRFQ } from '@/api/rfqs'
import type { RFQ, RFQStatus } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'

const statusVariant: Record<RFQStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'success'> = {
  draft: 'secondary',
  sent: 'default',
  received: 'success',
  converted: 'outline',
  cancelled: 'destructive',
}

export default function RFQs() {
  usePageTitle('RFQs')
  const navigate = useNavigate()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingRFQ, setDeletingRFQ] = useState<RFQ | null>(null)

  const { data: rfqsData } = useRFQs()
  const deleteRFQ = useDeleteRFQ()

  const handleDeleteClick = (rfq: RFQ) => {
    setDeletingRFQ(rfq)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!deletingRFQ) return
    try {
      await deleteRFQ.mutateAsync(deletingRFQ.id)
      toast.success('RFQ deleted successfully')
      setDeleteDialogOpen(false)
      setDeletingRFQ(null)
    } catch (error) {
      console.error('Failed to delete RFQ:', error)
      toast.error('Failed to delete RFQ')
    }
  }

  const columns: ColumnDef<RFQ>[] = useMemo(
    () => [
      {
        accessorKey: 'rfq_number',
        header: 'RFQ #',
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.getValue('rfq_number')}</span>
        ),
      },
      {
        accessorKey: 'vendor_name',
        header: 'Vendor',
      },
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ row }) => format(new Date(row.getValue('date')), 'MMM d, yyyy'),
      },
      {
        accessorKey: 'expected_date',
        header: 'Expected Date',
        cell: ({ row }) => {
          const date = row.getValue('expected_date') as string | null
          if (!date) return <span className="text-gray-400">-</span>
          return format(new Date(date), 'MMM d, yyyy')
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.getValue('status') as RFQStatus
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
          <span className="text-gray-600">{row.getValue('num_lines')}</span>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const rfq = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(`/rfqs/${rfq.id}`)}>
                  <FileText className="mr-2 h-4 w-4" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => handleDeleteClick(rfq)}
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
    [navigate]
  )

  const rfqs = rfqsData?.results ?? []

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">RFQs</h1>
          <p className="text-muted-foreground">
            Create and manage requests for quotation
          </p>
        </div>
        <Button onClick={() => navigate('/rfqs/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Create RFQ
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {rfqs.filter((r) => r.status === 'draft').length}
            </div>
            <div className="text-sm text-muted-foreground">Draft</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {rfqs.filter((r) => r.status === 'sent').length}
            </div>
            <div className="text-sm text-muted-foreground">Sent</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {rfqs.filter((r) => r.status === 'received').length}
            </div>
            <div className="text-sm text-muted-foreground">Received</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {rfqs.filter((r) => r.status === 'converted').length}
            </div>
            <div className="text-sm text-muted-foreground">Converted</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {rfqs.filter((r) => r.status === 'cancelled').length}
            </div>
            <div className="text-sm text-muted-foreground">Cancelled</div>
          </CardContent>
        </Card>
      </div>

      {/* RFQs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            RFQs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={rfqs}
            searchColumn="rfq_number"
            searchPlaceholder="Search RFQs..."
            onRowClick={(rfq) => navigate(`/rfqs/${rfq.id}`)}
          />
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete RFQ"
        description={`Are you sure you want to delete RFQ ${deletingRFQ?.rfq_number}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        loading={deleteRFQ.isPending}
      />
    </div>
  )
}
