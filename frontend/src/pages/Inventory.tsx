import { useState, useMemo } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useInventorySync } from '@/hooks/useRealtimeSync'
import { type ColumnDef } from '@tanstack/react-table'
import { Package, Layers, BarChart3, History } from 'lucide-react'
import { FolderTabs } from '@/components/ui/folder-tabs'
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
import { getStatusBadge } from '@/components/ui/StatusBadge'

type Tab = 'balances' | 'lots' | 'pallets' | 'transactions'

const getTypeBadge = (type: string) => (
  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
    style={{ background: 'var(--so-border-light)', color: 'var(--so-text-secondary)' }}>
    {type}
  </span>
)

export default function Inventory() {
  usePageTitle('Inventory')
  useInventorySync()

  const [activeTab, setActiveTab] = useState<Tab>('balances')

  const { data: balancesData } = useInventoryBalances()
  const { data: lotsData } = useInventoryLots()
  const { data: palletsData } = useInventoryPallets()
  const { data: transactionsData } = useInventoryTransactions()

  const balanceColumns: ColumnDef<InventoryBalance>[] = useMemo(() => [
    { accessorKey: 'item_sku', header: 'MSPN', cell: ({ row }) => <span className="font-mono font-medium">{row.getValue('item_sku')}</span> },
    { accessorKey: 'item_name', header: 'Item' },
    { accessorKey: 'warehouse_name', header: 'Warehouse' },
    { accessorKey: 'bin_code', header: 'Bin', cell: ({ row }) => row.getValue('bin_code') || '-' },
    { accessorKey: 'lot_number', header: 'Lot', cell: ({ row }) => row.getValue('lot_number') || '-' },
    { accessorKey: 'quantity_on_hand', header: 'On Hand', cell: ({ row }) => <span className="font-medium">{row.getValue('quantity_on_hand')}</span> },
    { accessorKey: 'quantity_reserved', header: 'Reserved', cell: ({ row }) => <span style={{ color: 'var(--so-warning-text)' }}>{row.getValue('quantity_reserved')}</span> },
    { accessorKey: 'quantity_available', header: 'Available', cell: ({ row }) => <span className="font-medium" style={{ color: 'var(--so-success-text)' }}>{row.getValue('quantity_available')}</span> },
    { accessorKey: 'uom_code', header: 'UOM' },
  ], [])

  const lotColumns: ColumnDef<InventoryLot>[] = useMemo(() => [
    { accessorKey: 'lot_number', header: 'Lot #', cell: ({ row }) => <span className="font-mono font-medium">{row.getValue('lot_number')}</span> },
    { accessorKey: 'item_sku', header: 'MSPN' },
    { accessorKey: 'item_name', header: 'Item' },
    { accessorKey: 'quantity', header: 'Quantity', cell: ({ row }) => <span className="font-medium">{row.getValue('quantity')}</span> },
    { accessorKey: 'uom_code', header: 'UOM' },
    { accessorKey: 'received_date', header: 'Received', cell: ({ row }) => format(new Date(row.getValue('received_date')), 'MMM d, yyyy') },
    { accessorKey: 'expiration_date', header: 'Expires', cell: ({ row }) => { const date = row.getValue('expiration_date') as string | null; return date ? format(new Date(date), 'MMM d, yyyy') : '-' } },
  ], [])

  const palletColumns: ColumnDef<InventoryPallet>[] = useMemo(() => [
    { accessorKey: 'pallet_id', header: 'Pallet ID', cell: ({ row }) => <span className="font-mono font-medium">{row.getValue('pallet_id')}</span> },
    { accessorKey: 'warehouse_name', header: 'Warehouse' },
    { accessorKey: 'bin_code', header: 'Bin', cell: ({ row }) => row.getValue('bin_code') || '-' },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => getStatusBadge(row.getValue('status') as string) },
    { accessorKey: 'notes', header: 'Notes', cell: ({ row }) => { const notes = row.getValue('notes') as string; return notes || <span style={{ color: 'var(--so-text-tertiary)' }}>-</span> } },
  ], [])

  const transactionColumns: ColumnDef<InventoryTransaction>[] = useMemo(() => [
    { accessorKey: 'transaction_date', header: 'Date', cell: ({ row }) => format(new Date(row.getValue('transaction_date')), 'MMM d, yyyy HH:mm') },
    { accessorKey: 'transaction_type', header: 'Type', cell: ({ row }) => getTypeBadge(row.getValue('transaction_type') as string) },
    { accessorKey: 'item_sku', header: 'MSPN', cell: ({ row }) => <span className="font-mono">{row.getValue('item_sku')}</span> },
    { accessorKey: 'item_name', header: 'Item' },
    { accessorKey: 'quantity', header: 'Qty', cell: ({ row }) => <span className="font-medium">{row.getValue('quantity')}</span> },
    { accessorKey: 'from_warehouse_name', header: 'From', cell: ({ row }) => row.getValue('from_warehouse_name') || '-' },
    { accessorKey: 'to_warehouse_name', header: 'To', cell: ({ row }) => row.getValue('to_warehouse_name') || '-' },
    { accessorKey: 'created_by_name', header: 'By' },
  ], [])

  const totalOnHand = balancesData?.results.reduce((sum, b) => sum + b.quantity_on_hand, 0) ?? 0
  const totalReserved = balancesData?.results.reduce((sum, b) => sum + b.quantity_reserved, 0) ?? 0
  const totalAvailable = balancesData?.results.reduce((sum, b) => sum + b.quantity_available, 0) ?? 0
  const uniqueItems = new Set(balancesData?.results.map((b) => b.item)).size

  const summaryKPIs = [
    { label: 'Unique Items', value: uniqueItems },
    { label: 'On Hand', value: totalOnHand.toLocaleString() },
    { label: 'Reserved', value: totalReserved.toLocaleString() },
    { label: 'Available', value: totalAvailable.toLocaleString() },
  ]

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Inventory</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Track inventory balances, lots, pallets, and transactions</p>
          </div>
        </div>

        {/* KPI Summary */}
        <div className="rounded-[14px] border overflow-hidden mb-5 animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="grid grid-cols-4">
            {summaryKPIs.map((kpi, idx) => (
              <div key={idx} className="px-5 py-4" style={{ borderRight: idx < 3 ? '1px solid var(--so-border-light)' : 'none' }}>
                <div className="text-[11px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>{kpi.label}</div>
                <div className="text-xl font-bold font-mono" style={{ color: 'var(--so-text-primary)' }}>{kpi.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-5 animate-in delay-2">
          <FolderTabs
            tabs={[
              { id: 'balances', label: 'Balances', icon: <BarChart3 className="h-3.5 w-3.5" /> },
              { id: 'lots', label: 'Lots', icon: <Package className="h-3.5 w-3.5" /> },
              { id: 'pallets', label: 'Pallets', icon: <Layers className="h-3.5 w-3.5" /> },
              { id: 'transactions', label: 'Transactions', icon: <History className="h-3.5 w-3.5" /> },
            ]}
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as Tab)}
          />
        </div>

        {/* Content */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">{{ balances: 'Balances', lots: 'Lots', pallets: 'Pallets', transactions: 'Transactions' }[activeTab]}</span>
          </div>
          <div className="px-6 py-5">
            {activeTab === 'balances' && <DataTable columns={balanceColumns} data={balancesData?.results ?? []} searchColumn="item_name" searchPlaceholder="Search items..." storageKey="inventory-balances" />}
            {activeTab === 'lots' && <DataTable columns={lotColumns} data={lotsData?.results ?? []} searchColumn="lot_number" searchPlaceholder="Search lots..." storageKey="inventory-lots" />}
            {activeTab === 'pallets' && <DataTable columns={palletColumns} data={palletsData?.results ?? []} searchColumn="pallet_id" searchPlaceholder="Search pallets..." storageKey="inventory-pallets" />}
            {activeTab === 'transactions' && <DataTable columns={transactionColumns} data={transactionsData?.results ?? []} searchColumn="item_name" searchPlaceholder="Search transactions..." storageKey="inventory-transactions" />}
          </div>
        </div>
      </div>
    </div>
  )
}
