import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'

import { usePageTitle } from '@/hooks/usePageTitle'
import { usePickTickets, type PickTicket } from '@/api/pickTickets'
import { PageHeader } from '@/components/page'
import { DataTable } from '@/components/ui/data-table'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format } from 'date-fns'
import { formatCurrency } from '@/lib/format'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { FileText } from 'lucide-react'

export default function PickTickets() {
  usePageTitle('Pick Tickets')
  const navigate = useNavigate()

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')

  const { data: picksData, isLoading } = usePickTickets({
    search: searchTerm || undefined,
    status: selectedStatus !== 'all' ? selectedStatus : undefined,
    ordering: '-picked_date',
  })
  const picks = picksData?.results ?? []

  const columns: ColumnDef<PickTicket>[] = useMemo(() => [
    {
      accessorKey: 'pick_number',
      header: 'Pick #',
      cell: ({ row }) => (
        <span className="font-mono font-medium" style={{ color: 'var(--so-text-primary)' }}>
          {row.getValue('pick_number')}
        </span>
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
      accessorKey: 'sales_order_number',
      header: 'Sales Order',
      cell: ({ row }) => {
        const num = row.getValue('sales_order_number') as string | null
        const soId = row.original.sales_order
        if (!num || !soId) return <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
        return (
          <button
            className="font-mono text-[12.5px] hover:underline cursor-pointer"
            style={{ color: 'var(--so-accent)' }}
            onClick={(e) => { e.stopPropagation(); navigate(`/orders/sales/${soId}`) }}
          >
            {num}
          </button>
        )
      },
    },
    {
      accessorKey: 'picked_date',
      header: 'Picked',
      cell: ({ row }) => (
        <span style={{ color: 'var(--so-text-secondary)' }}>
          {format(new Date((row.getValue('picked_date') as string) + 'T00:00:00'), 'MMM d, yyyy')}
        </span>
      ),
    },
    {
      accessorKey: 'warehouse_code',
      header: 'Warehouse',
      cell: ({ row }) => (
        <span className="font-mono text-[12.5px]" style={{ color: 'var(--so-text-secondary)' }}>
          {row.getValue('warehouse_code')}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => getStatusBadge(row.getValue('status') as string),
    },
    {
      accessorKey: 'subtotal',
      header: 'Total',
      cell: ({ row }) => (
        <span className="font-medium font-mono" style={{ color: 'var(--so-text-primary)' }}>
          {formatCurrency(row.getValue('subtotal'))}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const pick = row.original
        const invoiceable = pick.status !== 'void' && pick.status !== 'cancelled' && pick.status !== 'invoiced'
        if (!invoiceable) return null
        return (
          <button
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:underline cursor-pointer"
            style={{ color: 'var(--so-accent)' }}
            onClick={(e) => {
              e.stopPropagation()
              // Land on Create Invoice with the customer pre-selected so the user can
              // immediately "Pull from Pick Ticket".
              navigate('/invoices/new', { state: { party: String(pick.customer) } })
            }}
          >
            <FileText className="h-3.5 w-3.5" />
            Create Invoice
          </button>
        )
      },
    },
  ], [navigate])

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16">
        <PageHeader
          title="Pick Tickets"
          description="Picked goods awaiting invoicing — feeds customer invoices"
        />

        {/* Filters */}
        <div className="mb-5 animate-in delay-1">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>
                Search
              </label>
              <Input
                placeholder="Pick #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>
                Status
              </label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="picked">Picked</SelectItem>
                  <SelectItem value="partially_invoiced">Partially Invoiced</SelectItem>
                  <SelectItem value="invoiced">Invoiced</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-[14px] overflow-hidden animate-in delay-2"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
          <div className="p-4">
            {isLoading ? (
              <TableSkeleton columns={8} rows={6} />
            ) : (
              <DataTable
                columns={columns}
                data={picks}
                storageKey="pick-tickets"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
