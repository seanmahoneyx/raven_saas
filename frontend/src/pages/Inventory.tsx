import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useInventorySync } from '@/hooks/useRealtimeSync'
import { type ColumnDef } from '@tanstack/react-table'
import { Package, Layers, BarChart3, History, ArrowLeft } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import {
  useInventoryBalances,
  useInventoryLots,
  useInventoryPallets,
  useInventoryTransactions,
  useWarehousePalletSummary,
  type InventoryBalance,
  type InventoryLot,
  type InventoryPallet,
  type InventoryTransaction,
} from '@/api/inventory'
import { useItems } from '@/api/items'
import type { Item } from '@/types/api'
import { format } from 'date-fns'
import { getStatusBadge, getItemTypeBadge } from '@/components/ui/StatusBadge'
import { outlineBtnClass, outlineBtnStyle } from '@/components/ui/button-styles'
import { PageHeader, KpiGrid, KpiCard, TabStrip } from '@/components/page'

type Tab = 'balances' | 'lots' | 'pallets' | 'transactions'

const getTransactionTypeBadge = (type: string) => (
  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
    style={{ background: 'var(--so-border-light)', color: 'var(--so-text-secondary)' }}>
    {type}
  </span>
)

export default function Inventory() {
  usePageTitle('Inventory')
  useInventorySync()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<Tab>('balances')
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)

  const { data: itemsData } = useItems()
  const allItems = itemsData?.results ?? []

  // Detail-level data when an item is selected
  const detailParams = selectedItemId ? { item: selectedItemId } : {}
  const { data: balancesData } = useInventoryBalances(detailParams)
  const { data: lotsData } = useInventoryLots(detailParams)
  const { data: palletsData } = useInventoryPallets()
  const { data: transactionsData } = useInventoryTransactions(detailParams)
  const { data: palletSummary } = useWarehousePalletSummary()

  const selectedItem = useMemo(
    () => (selectedItemId ? allItems.find(i => i.id === selectedItemId) : null),
    [selectedItemId, allItems]
  )

  // -- Item-level columns (default view) --
  const itemColumns: ColumnDef<Item>[] = useMemo(() => [
    {
      accessorKey: 'item_type',
      header: 'Type',
      cell: ({ row }) => getItemTypeBadge(row.getValue('item_type') as string),
    },
    {
      accessorKey: 'sku',
      header: 'MSPN',
      cell: ({ row }) => (
        <button
          className="font-mono font-medium text-sm cursor-pointer"
          style={{ color: 'var(--so-accent)' }}
          onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          onClick={() => setSelectedItemId(row.original.id)}
        >
          {row.getValue('sku')}
        </button>
      ),
    },
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'division', header: 'Division', cell: ({ row }) => <span className="capitalize">{row.getValue('division')}</span> },
    {
      accessorKey: 'qty_on_hand',
      header: 'On Hand',
      cell: ({ row }) => <span className="font-medium">{row.original.qty_on_hand ?? 0}</span>,
    },
    {
      accessorKey: 'qty_on_open_so',
      header: 'On Open SO',
      cell: ({ row }) => {
        const val = row.original.qty_on_open_so ?? 0
        return <span style={{ color: val > 0 ? 'var(--so-warning-text)' : 'var(--so-text-tertiary)' }}>{val}</span>
      },
    },
    {
      accessorKey: 'qty_on_open_po',
      header: 'On Open PO',
      cell: ({ row }) => {
        const val = row.original.qty_on_open_po ?? 0
        return <span style={{ color: val > 0 ? 'var(--so-info-text, #3b82f6)' : 'var(--so-text-tertiary)' }}>{val}</span>
      },
    },
    {
      id: 'available',
      header: 'Available',
      cell: ({ row }) => {
        const onHand = row.original.qty_on_hand ?? 0
        const onSO = row.original.qty_on_open_so ?? 0
        const avail = onHand - onSO
        return <span className="font-medium" style={{ color: avail > 0 ? 'var(--so-success-text)' : avail < 0 ? '#ef4444' : 'var(--so-text-tertiary)' }}>{avail}</span>
      },
    },
  ], [])

  // -- Balance detail columns (when item selected) --
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
    { accessorKey: 'license_plate', header: 'License Plate', cell: ({ row }) => <span className="font-mono font-medium">{row.getValue('license_plate')}</span> },
    { accessorKey: 'item_sku', header: 'MSPN', cell: ({ row }) => <span className="font-mono">{row.getValue('item_sku')}</span> },
    { accessorKey: 'warehouse_code', header: 'Warehouse' },
    { accessorKey: 'bin_code', header: 'Bin', cell: ({ row }) => row.getValue('bin_code') || '-' },
    { accessorKey: 'pallet_number', header: 'Pallet #', cell: ({ row }) => <span className="font-mono">{row.getValue('pallet_number')}</span> },
    { accessorKey: 'quantity_on_hand', header: 'On Hand', cell: ({ row }) => <span className="font-medium">{row.getValue('quantity_on_hand')}</span> },
    { accessorKey: 'quantity_received', header: 'Received', cell: ({ row }) => row.getValue('quantity_received') },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => getStatusBadge((row.getValue('status') as string).toLowerCase()) },
  ], [])

  const transactionColumns: ColumnDef<InventoryTransaction>[] = useMemo(() => [
    { accessorKey: 'transaction_date', header: 'Date', cell: ({ row }) => format(new Date(row.getValue('transaction_date')), 'MMM d, yyyy HH:mm') },
    { accessorKey: 'transaction_type', header: 'Type', cell: ({ row }) => getTransactionTypeBadge(row.getValue('transaction_type') as string) },
    { accessorKey: 'item_sku', header: 'MSPN', cell: ({ row }) => <span className="font-mono">{row.getValue('item_sku')}</span> },
    { accessorKey: 'item_name', header: 'Item' },
    { accessorKey: 'quantity', header: 'Qty', cell: ({ row }) => <span className="font-medium">{row.getValue('quantity')}</span> },
    { accessorKey: 'from_warehouse_name', header: 'From', cell: ({ row }) => row.getValue('from_warehouse_name') || '-' },
    { accessorKey: 'to_warehouse_name', header: 'To', cell: ({ row }) => row.getValue('to_warehouse_name') || '-' },
    { accessorKey: 'created_by_name', header: 'By' },
  ], [])

  // KPIs from items data
  const totalOnHand = allItems.reduce((sum, i) => sum + (i.qty_on_hand ?? 0), 0)
  const itemsWithStock = allItems.filter(i => (i.qty_on_hand ?? 0) > 0).length

  // Pallet counts for open SO/PO: ceil(qty / units_per_pallet) per item, skip items without pallet config
  const palletsOnSO = allItems.reduce((sum, i) => {
    const qty = i.qty_on_open_so ?? 0
    const upp = i.units_per_pallet
    if (qty === 0 || !upp || upp <= 0) return sum
    return sum + Math.ceil(qty / upp)
  }, 0)
  const palletsOnPO = allItems.reduce((sum, i) => {
    const qty = i.qty_on_open_po ?? 0
    const upp = i.units_per_pallet
    if (qty === 0 || !upp || upp <= 0) return sum
    return sum + Math.ceil(qty / upp)
  }, 0)

  const palletsInInventory = palletSummary?.pallets_in_inventory ?? 0
  const totalCapacity = palletSummary?.total_capacity ?? 0

  const summaryKPIs = [
    { label: 'Items with Stock', value: itemsWithStock },
    { label: 'Total On Hand', value: totalOnHand.toLocaleString() },
    { label: 'On Open SO', value: `${palletsOnSO.toLocaleString()} plt` },
    { label: 'On Open PO', value: `${palletsOnPO.toLocaleString()} plt` },
    { label: 'Pallet Slots', value: totalCapacity > 0 ? `${palletsInInventory.toLocaleString()} / ${totalCapacity.toLocaleString()}` : `${palletsInInventory.toLocaleString()}` },
  ]

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16">
        <PageHeader
          title="Inventory"
          description="Track inventory balances, lots, pallets, and transactions"
        />

        <div className="mb-5 animate-in delay-1">
          <KpiGrid columns={5}>
            {summaryKPIs.map((kpi, idx) => (
              <KpiCard
                key={idx}
                label={kpi.label}
                value={<span className="font-mono">{kpi.value}</span>}
              />
            ))}
          </KpiGrid>
        </div>

        <div className="mb-5 animate-in delay-2">
          <TabStrip
            tabs={[
              { id: 'balances', label: 'Balances', icon: BarChart3 },
              { id: 'lots', label: 'Lots', icon: Package },
              { id: 'pallets', label: 'Pallets', icon: Layers },
              { id: 'transactions', label: 'Transactions', icon: History },
            ]}
            active={activeTab}
            onChange={(id) => { setActiveTab(id as Tab); setSelectedItemId(null) }}
          />
        </div>

        {/* Content */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <div className="flex items-center gap-3">
              {selectedItemId && (
                <button
                  className="inline-flex items-center gap-1 text-[13px] font-medium cursor-pointer"
                  style={{ color: 'var(--so-text-tertiary)' }}
                  onClick={() => setSelectedItemId(null)}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  All Items
                </button>
              )}
              <span className="text-sm font-semibold">
                {selectedItem
                  ? `${selectedItem.sku} — ${selectedItem.name}`
                  : { balances: 'All Items', lots: 'All Items', pallets: 'Pallets', transactions: 'All Items' }[activeTab]}
              </span>
            </div>
            {selectedItemId && (
              <button
                className={outlineBtnClass}
                style={outlineBtnStyle}
                onClick={() => navigate(`/items/${selectedItemId}`)}
              >
                View Item
              </button>
            )}
          </div>
          <div className="px-6 py-5">
            {activeTab === 'balances' && !selectedItemId && (
              <DataTable columns={itemColumns} data={allItems} searchColumn="sku" searchPlaceholder="Search by MSPN or name..." storageKey="inventory-items" />
            )}
            {activeTab === 'balances' && selectedItemId && (
              <DataTable columns={balanceColumns} data={balancesData?.results ?? []} storageKey="inventory-balances-detail" />
            )}
            {activeTab === 'lots' && !selectedItemId && (
              <DataTable columns={itemColumns} data={allItems} searchColumn="sku" searchPlaceholder="Search by MSPN or name..." storageKey="inventory-lots-items" />
            )}
            {activeTab === 'lots' && selectedItemId && (
              <DataTable columns={lotColumns} data={lotsData?.results ?? []} searchColumn="lot_number" searchPlaceholder="Search lots..." storageKey="inventory-lots" />
            )}
            {activeTab === 'pallets' && <DataTable columns={palletColumns} data={palletsData?.results ?? []} searchColumn="license_plate" searchPlaceholder="Search by license plate..." storageKey="inventory-pallets" />}
            {activeTab === 'transactions' && !selectedItemId && (
              <DataTable columns={itemColumns} data={allItems} searchColumn="sku" searchPlaceholder="Search by MSPN or name..." storageKey="inventory-txn-items" />
            )}
            {activeTab === 'transactions' && selectedItemId && (
              <DataTable columns={transactionColumns} data={transactionsData?.results ?? []} searchColumn="item_name" searchPlaceholder="Search transactions..." storageKey="inventory-transactions" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
