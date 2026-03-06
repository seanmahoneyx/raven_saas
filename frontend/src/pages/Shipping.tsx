import { useState, useMemo } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useShipmentSync } from '@/hooks/useRealtimeSync'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Truck, FileText } from 'lucide-react'
import { FolderTabs } from '@/components/ui/folder-tabs'
import { DataTable } from '@/components/ui/data-table'
import { useShipments, useBillsOfLading, type Shipment, type BillOfLading } from '@/api/shipping'
import { format } from 'date-fns'
import { primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { getStatusBadge } from '@/components/ui/StatusBadge'

type Tab = 'shipments' | 'bols'

export default function Shipping() {
  usePageTitle('Shipping')
  useShipmentSync()

  const [activeTab, setActiveTab] = useState<Tab>('shipments')

  const { data: shipmentsData } = useShipments()
  const { data: bolsData } = useBillsOfLading()

  const shipmentColumns: ColumnDef<Shipment>[] = useMemo(
    () => [
      { accessorKey: 'shipment_number', header: 'Shipment #', cell: ({ row }) => <span className="font-mono font-medium">{row.getValue('shipment_number')}</span> },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => getStatusBadge(row.getValue('status') as string) },
      { accessorKey: 'ship_from_name', header: 'From' },
      { accessorKey: 'ship_to_name', header: 'To' },
      { accessorKey: 'carrier', header: 'Carrier', cell: ({ row }) => row.getValue('carrier') || '-' },
      { accessorKey: 'ship_date', header: 'Ship Date', cell: ({ row }) => { const date = row.getValue('ship_date') as string | null; return date ? format(new Date(date), 'MMM d, yyyy') : '-' } },
      { accessorKey: 'delivery_date', header: 'Delivery Date', cell: ({ row }) => { const date = row.getValue('delivery_date') as string | null; return date ? format(new Date(date), 'MMM d, yyyy') : '-' } },
      { accessorKey: 'tracking_number', header: 'Tracking', cell: ({ row }) => { const tracking = row.getValue('tracking_number') as string; return tracking ? <span className="font-mono text-xs">{tracking}</span> : '-' } },
    ],
    []
  )

  const bolColumns: ColumnDef<BillOfLading>[] = useMemo(
    () => [
      { accessorKey: 'bol_number', header: 'BOL #', cell: ({ row }) => <span className="font-mono font-medium">{row.getValue('bol_number')}</span> },
      { accessorKey: 'shipment_number', header: 'Shipment' },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => getStatusBadge(row.getValue('status') as string) },
      { accessorKey: 'carrier', header: 'Carrier' },
      { accessorKey: 'trailer_number', header: 'Trailer #', cell: ({ row }) => row.getValue('trailer_number') || '-' },
      { accessorKey: 'driver_name', header: 'Driver', cell: ({ row }) => row.getValue('driver_name') || '-' },
      { accessorKey: 'pickup_date', header: 'Pickup', cell: ({ row }) => { const date = row.getValue('pickup_date') as string | null; return date ? format(new Date(date), 'MMM d, yyyy') : '-' } },
      { accessorKey: 'freight_charge', header: 'Freight', cell: ({ row }) => { const charge = row.getValue('freight_charge') as string; return charge ? `$${parseFloat(charge).toFixed(2)}` : '-' } },
    ],
    []
  )

  const pendingShipments = shipmentsData?.results.filter((s) => s.status === 'pending').length ?? 0
  const inTransit = shipmentsData?.results.filter((s) => s.status === 'in_transit').length ?? 0
  const delivered = shipmentsData?.results.filter((s) => s.status === 'delivered').length ?? 0

  const summaryKPIs = [
    { label: 'Pending', value: pendingShipments },
    { label: 'In Transit', value: inTransit },
    { label: 'Delivered', value: delivered },
  ]

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Shipping</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Manage shipments and bills of lading</p>
          </div>
          <button className={primaryBtnClass} style={primaryBtnStyle}>
            <Plus className="h-3.5 w-3.5" /> New {activeTab === 'shipments' ? 'Shipment' : 'BOL'}
          </button>
        </div>

        {/* KPI Summary */}
        <div className="rounded-[14px] border overflow-hidden mb-5 animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="grid grid-cols-3">
            {summaryKPIs.map((kpi, idx) => (
              <div key={idx} className="px-5 py-4" style={{ borderRight: idx < 2 ? '1px solid var(--so-border-light)' : 'none' }}>
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
              { id: 'shipments', label: 'Shipments', icon: <Truck className="h-3.5 w-3.5" /> },
              { id: 'bols', label: 'Bills of Lading', icon: <FileText className="h-3.5 w-3.5" /> },
            ]}
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as Tab)}
          />
        </div>

        {/* Content */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">{{ shipments: 'Shipments', bols: 'Bills of Lading' }[activeTab]}</span>
          </div>
          <div className="px-6 py-5">
            {activeTab === 'shipments' && (
              <DataTable columns={shipmentColumns} data={shipmentsData?.results ?? []} searchColumn="shipment_number" searchPlaceholder="Search shipments..." storageKey="shipments" />
            )}
            {activeTab === 'bols' && (
              <DataTable columns={bolColumns} data={bolsData?.results ?? []} searchColumn="bol_number" searchPlaceholder="Search BOLs..." storageKey="bols" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
