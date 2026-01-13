import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Package, Layers, BarChart3, History } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import {
  useInventoryBalances,
  useInventoryLots,
  useInventoryPallets,
  useInventoryTransactions,
  type InventoryBalance,
  type InventoryLot,
  type InventoryPallet,
  type InventoryTransaction,
} from '@/api/inventory'
import { format } from 'date-fns'

type Tab = 'balances' | 'lots' | 'pallets' | 'transactions'

const palletStatusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  available: 'success',
  reserved: 'warning',
  damaged: 'destructive',
  quarantine: 'secondary',
}

export default function Inventory() {
  const [activeTab, setActiveTab] = useState<Tab>('balances')

  const { data: balancesData } = useInventoryBalances()
  const { data: lotsData } = useInventoryLots()
  const { data: palletsData } = useInventoryPallets()
  const { data: transactionsData } = useInventoryTransactions()

  const balanceColumns: ColumnDef<InventoryBalance>[] = useMemo(
    () => [
      {
        accessorKey: 'item_sku',
        header: 'SKU',
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.getValue('item_sku')}</span>
        ),
      },
      {
        accessorKey: 'item_name',
        header: 'Item',
      },
      {
        accessorKey: 'warehouse_name',
        header: 'Warehouse',
      },
      {
        accessorKey: 'bin_code',
        header: 'Bin',
        cell: ({ row }) => row.getValue('bin_code') || '-',
      },
      {
        accessorKey: 'lot_number',
        header: 'Lot',
        cell: ({ row }) => row.getValue('lot_number') || '-',
      },
      {
        accessorKey: 'quantity_on_hand',
        header: 'On Hand',
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue('quantity_on_hand')}</span>
        ),
      },
      {
        accessorKey: 'quantity_reserved',
        header: 'Reserved',
        cell: ({ row }) => (
          <span className="text-yellow-600">{row.getValue('quantity_reserved')}</span>
        ),
      },
      {
        accessorKey: 'quantity_available',
        header: 'Available',
        cell: ({ row }) => (
          <span className="text-green-600 font-medium">{row.getValue('quantity_available')}</span>
        ),
      },
      {
        accessorKey: 'uom_code',
        header: 'UOM',
      },
    ],
    []
  )

  const lotColumns: ColumnDef<InventoryLot>[] = useMemo(
    () => [
      {
        accessorKey: 'lot_number',
        header: 'Lot #',
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.getValue('lot_number')}</span>
        ),
      },
      {
        accessorKey: 'item_sku',
        header: 'SKU',
      },
      {
        accessorKey: 'item_name',
        header: 'Item',
      },
      {
        accessorKey: 'quantity',
        header: 'Quantity',
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue('quantity')}</span>
        ),
      },
      {
        accessorKey: 'uom_code',
        header: 'UOM',
      },
      {
        accessorKey: 'received_date',
        header: 'Received',
        cell: ({ row }) => format(new Date(row.getValue('received_date')), 'MMM d, yyyy'),
      },
      {
        accessorKey: 'expiration_date',
        header: 'Expires',
        cell: ({ row }) => {
          const date = row.getValue('expiration_date') as string | null
          return date ? format(new Date(date), 'MMM d, yyyy') : '-'
        },
      },
    ],
    []
  )

  const palletColumns: ColumnDef<InventoryPallet>[] = useMemo(
    () => [
      {
        accessorKey: 'pallet_id',
        header: 'Pallet ID',
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.getValue('pallet_id')}</span>
        ),
      },
      {
        accessorKey: 'warehouse_name',
        header: 'Warehouse',
      },
      {
        accessorKey: 'bin_code',
        header: 'Bin',
        cell: ({ row }) => row.getValue('bin_code') || '-',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.getValue('status') as string
          return (
            <Badge variant={palletStatusVariant[status] || 'outline'}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'notes',
        header: 'Notes',
        cell: ({ row }) => {
          const notes = row.getValue('notes') as string
          return notes || <span className="text-gray-400">-</span>
        },
      },
    ],
    []
  )

  const transactionColumns: ColumnDef<InventoryTransaction>[] = useMemo(
    () => [
      {
        accessorKey: 'transaction_date',
        header: 'Date',
        cell: ({ row }) => format(new Date(row.getValue('transaction_date')), 'MMM d, yyyy HH:mm'),
      },
      {
        accessorKey: 'transaction_type',
        header: 'Type',
        cell: ({ row }) => (
          <Badge variant="outline">{row.getValue('transaction_type')}</Badge>
        ),
      },
      {
        accessorKey: 'item_sku',
        header: 'SKU',
        cell: ({ row }) => (
          <span className="font-mono">{row.getValue('item_sku')}</span>
        ),
      },
      {
        accessorKey: 'item_name',
        header: 'Item',
      },
      {
        accessorKey: 'quantity',
        header: 'Qty',
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue('quantity')}</span>
        ),
      },
      {
        accessorKey: 'from_warehouse_name',
        header: 'From',
        cell: ({ row }) => row.getValue('from_warehouse_name') || '-',
      },
      {
        accessorKey: 'to_warehouse_name',
        header: 'To',
        cell: ({ row }) => row.getValue('to_warehouse_name') || '-',
      },
      {
        accessorKey: 'created_by_name',
        header: 'By',
      },
    ],
    []
  )

  const tabs = [
    { id: 'balances' as Tab, label: 'Balances', icon: BarChart3 },
    { id: 'lots' as Tab, label: 'Lots', icon: Package },
    { id: 'pallets' as Tab, label: 'Pallets', icon: Layers },
    { id: 'transactions' as Tab, label: 'Transactions', icon: History },
  ]

  // Calculate summary stats
  const totalOnHand = balancesData?.results.reduce((sum, b) => sum + b.quantity_on_hand, 0) ?? 0
  const totalReserved = balancesData?.results.reduce((sum, b) => sum + b.quantity_reserved, 0) ?? 0
  const totalAvailable = balancesData?.results.reduce((sum, b) => sum + b.quantity_available, 0) ?? 0
  const uniqueItems = new Set(balancesData?.results.map((b) => b.item)).size

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Inventory</h1>
        <p className="text-muted-foreground">
          Track inventory balances, lots, pallets, and transactions
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{uniqueItems}</div>
            <div className="text-sm text-muted-foreground">Unique Items</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{totalOnHand.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">On Hand</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-600">{totalReserved.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Reserved</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{totalAvailable.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Available</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <Card>
        <CardHeader>
          <CardTitle>
            {tabs.find((t) => t.id === activeTab)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeTab === 'balances' && (
            <DataTable
              columns={balanceColumns}
              data={balancesData?.results ?? []}
              searchColumn="item_name"
              searchPlaceholder="Search items..."
            />
          )}
          {activeTab === 'lots' && (
            <DataTable
              columns={lotColumns}
              data={lotsData?.results ?? []}
              searchColumn="lot_number"
              searchPlaceholder="Search lots..."
            />
          )}
          {activeTab === 'pallets' && (
            <DataTable
              columns={palletColumns}
              data={palletsData?.results ?? []}
              searchColumn="pallet_id"
              searchPlaceholder="Search pallets..."
            />
          )}
          {activeTab === 'transactions' && (
            <DataTable
              columns={transactionColumns}
              data={transactionsData?.results ?? []}
              searchColumn="item_name"
              searchPlaceholder="Search transactions..."
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
