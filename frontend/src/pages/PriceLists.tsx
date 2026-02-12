import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { usePriceLists } from '@/api/priceLists'
import type { PriceList } from '@/types/api'

export default function PriceLists() {
  usePageTitle('Price Lists')
  const navigate = useNavigate()

  const { data: priceListsData, isLoading } = usePriceLists()

  const columns: ColumnDef<PriceList>[] = useMemo(
    () => [
      {
        accessorKey: 'customer_name',
        header: 'Customer',
        cell: ({ row }) => (
          <div>
            <span className="font-medium">{row.original.customer_name}</span>
            <span className="text-xs text-muted-foreground ml-2 font-mono">{row.original.customer_code}</span>
          </div>
        ),
      },
      {
        accessorKey: 'item_sku',
        header: 'Item',
        cell: ({ row }) => (
          <div>
            <span className="font-mono text-sm">{row.original.item_sku}</span>
            <span className="text-sm text-muted-foreground ml-2">{row.original.item_name}</span>
          </div>
        ),
      },
      {
        accessorKey: 'begin_date',
        header: 'Begin Date',
        cell: ({ row }) => {
          const date = row.getValue('begin_date') as string
          return date ? new Date(date + 'T00:00:00').toLocaleDateString() : '-'
        },
      },
      {
        accessorKey: 'end_date',
        header: 'End Date',
        cell: ({ row }) => {
          const date = row.getValue('end_date') as string | null
          return date ? new Date(date + 'T00:00:00').toLocaleDateString() : 'Ongoing'
        },
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={row.getValue('is_active') ? 'success' : 'secondary'}>
            {row.getValue('is_active') ? 'Active' : 'Inactive'}
          </Badge>
        ),
      },
    ],
    []
  )

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Price Lists</h1>
          <p className="text-muted-foreground">
            Manage customer pricing with quantity break tiers
          </p>
        </div>
        <Button onClick={() => navigate('/price-lists/new')}>
          <Plus className="h-4 w-4 mr-2" />
          New Price List
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            All Price Lists
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <DataTable
              columns={columns}
              data={priceListsData?.results ?? []}
              searchColumn="customer_name"
              searchPlaceholder="Search by customer..."
              onRowClick={(row) => navigate(`/price-lists/${row.id}`)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
