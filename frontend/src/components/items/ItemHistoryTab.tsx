import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { useItemHistory, type ItemHistoryEntry } from '@/api/items'

const typeBadgeConfig: Record<string, { label: string; className: string }> = {
  ESTIMATE: { label: 'Estimate', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  RFQ:      { label: 'RFQ',      className: 'bg-orange-100 text-orange-800 border-orange-200' },
  SO:       { label: 'SO',       className: 'bg-green-100 text-green-800 border-green-200' },
  PO:       { label: 'PO',       className: 'bg-red-100 text-red-800 border-red-200' },
}

const typeRoutes: Record<string, string> = {
  ESTIMATE: '/estimates',
  RFQ: '/rfqs',
  SO: '/orders',
  PO: '/orders',
}

export function ItemHistoryTab({ itemId }: { itemId: number }) {
  const { data: history, isLoading } = useItemHistory(itemId)
  const navigate = useNavigate()

  const columns: ColumnDef<ItemHistoryEntry>[] = useMemo(
    () => [
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => {
          const type = row.getValue('type') as string
          const config = typeBadgeConfig[type] || { label: type, className: '' }
          return (
            <Badge variant="outline" className={config.className}>
              {config.label}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ row }) => new Date(row.getValue('date') as string).toLocaleDateString(),
      },
      {
        accessorKey: 'document_number',
        header: 'Document #',
        cell: ({ row }) => (
          <span className="font-mono font-medium text-primary">
            {row.getValue('document_number')}
          </span>
        ),
      },
      {
        accessorKey: 'party_name',
        header: 'Party',
      },
      {
        accessorKey: 'quantity',
        header: 'Qty',
        cell: ({ row }) => (row.getValue('quantity') as number).toLocaleString(),
      },
      {
        accessorKey: 'price',
        header: 'Unit Price',
        cell: ({ row }) => {
          const price = row.getValue('price') as string | null
          return price ? `$${parseFloat(price).toFixed(4)}` : '-'
        },
      },
      {
        accessorKey: 'line_total',
        header: 'Total',
        cell: ({ row }) => {
          const total = row.getValue('line_total') as string | null
          return total ? `$${parseFloat(total).toFixed(2)}` : '-'
        },
      },
      {
        accessorKey: 'status_display',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant="outline">{row.getValue('status_display')}</Badge>
        ),
      },
    ],
    []
  )

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 bg-muted animate-pulse rounded" />
        ))}
      </div>
    )
  }

  if (!history || history.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No transaction history found for this item.
      </div>
    )
  }

  return (
    <DataTable
      columns={columns}
      data={history}
      searchColumn="party_name"
      searchPlaceholder="Search by party name..."
      onRowClick={(row) => {
        const route = typeRoutes[row.type]
        if (route) navigate(route)
      }}
    />
  )
}
