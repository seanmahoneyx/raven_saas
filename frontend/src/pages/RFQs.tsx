import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, MoreHorizontal, Trash2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    draft:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    active:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    inactive:  { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    sent:      { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    accepted:  { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    rejected:  { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    converted: { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    received:  { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    cancelled: { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
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

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

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
          if (!date) return <span style={{ color: 'var(--so-text-tertiary)' }}>-</span>
          return format(new Date(date), 'MMM d, yyyy')
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => getStatusBadge(row.getValue('status') as RFQStatus),
      },
      {
        accessorKey: 'num_lines',
        header: 'Lines',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-tertiary)' }}>{row.getValue('num_lines')}</span>
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

  const kpiStats = [
    { label: 'Draft',     value: rfqs.filter((r) => r.status === 'draft').length,     status: 'draft' },
    { label: 'Sent',      value: rfqs.filter((r) => r.status === 'sent').length,      status: 'sent' },
    { label: 'Received',  value: rfqs.filter((r) => r.status === 'received').length,  status: 'received' },
    { label: 'Converted', value: rfqs.filter((r) => r.status === 'converted').length, status: 'converted' },
    { label: 'Cancelled', value: rfqs.filter((r) => r.status === 'cancelled').length, status: 'cancelled' },
  ]

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>RFQs</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
              Create and manage requests for quotation
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => navigate('/rfqs/new')}>
              <Plus className="h-4 w-4" />
              Create RFQ
            </button>
          </div>
        </div>

        {/* KPI Summary */}
        <div className="rounded-[14px] border mb-6 animate-in delay-1"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="grid grid-cols-5 divide-x" style={{ borderColor: 'var(--so-border)' }}>
            {kpiStats.map((stat) => (
              <div key={stat.label} className="px-6 py-5">
                <div className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>{stat.value}</div>
                <div className="mt-1">{getStatusBadge(stat.status)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RFQs Table */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-2"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
              RFQs
            </span>
            <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
              {rfqs.length} total
            </span>
          </div>
          <DataTable
            columns={columns}
            data={rfqs}
            searchColumn="rfq_number"
            searchPlaceholder="Search RFQs..."
            onRowClick={(rfq) => navigate(`/rfqs/${rfq.id}`)}
          />
        </div>

      </div>

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
