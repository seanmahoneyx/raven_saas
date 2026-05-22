import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'

import { usePageTitle } from '@/hooks/usePageTitle'
import { useItemReceipts, type ItemReceipt } from '@/api/inventory'
import { PageHeader } from '@/components/page'
import { DataTable } from '@/components/ui/data-table'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format } from 'date-fns'
import { formatCurrency } from '@/lib/format'
import { getStatusBadge } from '@/components/ui/StatusBadge'

export default function ItemReceipts() {
  usePageTitle('Item Receipts')
  const navigate = useNavigate()

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')

  const { data: receiptsData, isLoading } = useItemReceipts({
    search: searchTerm || undefined,
    status: selectedStatus !== 'all' ? selectedStatus : undefined,
    ordering: '-received_date',
  })
  const receipts = receiptsData?.results ?? []

  const columns: ColumnDef<ItemReceipt>[] = useMemo(() => [
    {
      accessorKey: 'receipt_number',
      header: 'Receipt #',
      cell: ({ row }) => (
        <button
          className="font-mono font-medium hover:underline cursor-pointer"
          style={{ color: 'var(--so-accent)' }}
          onClick={() => navigate(`/item-receipts/${row.original.id}`)}
        >
          {row.getValue('receipt_number')}
        </button>
      ),
    },
    {
      accessorKey: 'vendor_name',
      header: 'Vendor',
      cell: ({ row }) => (
        <span style={{ color: 'var(--so-text-primary)' }}>{row.getValue('vendor_name')}</span>
      ),
    },
    {
      accessorKey: 'purchase_order_number',
      header: 'PO',
      cell: ({ row }) => {
        const num = row.getValue('purchase_order_number') as string | null
        const poId = row.original.purchase_order
        if (!num || !poId) return <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
        return (
          <button
            className="font-mono text-[12.5px] hover:underline cursor-pointer"
            style={{ color: 'var(--so-accent)' }}
            onClick={(e) => { e.stopPropagation(); navigate(`/orders/purchase/${poId}`) }}
          >
            {num}
          </button>
        )
      },
    },
    {
      accessorKey: 'received_date',
      header: 'Received',
      cell: ({ row }) => (
        <span style={{ color: 'var(--so-text-secondary)' }}>
          {format(new Date((row.getValue('received_date') as string) + 'T00:00:00'), 'MMM d, yyyy')}
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
  ], [navigate])

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16">
        <PageHeader
          title="Item Receipts"
          description="Goods received from vendors — feeds inventory and bills"
        />

        {/* Filters */}
        <div className="mb-5 animate-in delay-1">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>
                Search
              </label>
              <Input
                placeholder="Receipt #, PO #, or vendor..."
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
                  <SelectItem value="posted">Posted</SelectItem>
                  <SelectItem value="partially_billed">Partially Billed</SelectItem>
                  <SelectItem value="billed">Billed</SelectItem>
                  <SelectItem value="void">Void</SelectItem>
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
              <TableSkeleton columns={7} rows={6} />
            ) : (
              <DataTable
                columns={columns}
                data={receipts}
                storageKey="item-receipts"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
