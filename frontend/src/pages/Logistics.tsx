import { useState, useMemo } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { FolderTabs } from '@/components/ui/folder-tabs'
import { DataTable } from '@/components/ui/data-table'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { useLicensePlates, useDeliveryStops, type LicensePlate, type DeliveryStopListItem } from '@/api/logistics'

type Tab = 'lpns' | 'stops'

export default function Logistics() {
  usePageTitle('Logistics')

  const [activeTab, setActiveTab] = useState<Tab>('lpns')

  const { data: lpnData, isLoading: lpnLoading, isError: lpnError } = useLicensePlates()
  const { data: stopsData, isLoading: stopsLoading, isError: stopsError } = useDeliveryStops()

  const lpnColumns: ColumnDef<LicensePlate>[] = useMemo(
    () => [
      {
        accessorKey: 'code',
        header: 'Code',
        cell: ({ row }) => (
          <span className="font-mono font-medium" style={{ color: 'var(--so-accent)' }}>
            {row.getValue('code')}
          </span>
        ),
      },
      {
        accessorKey: 'order_number',
        header: 'Order #',
        cell: ({ row }) => (
          <span className="font-mono" style={{ color: 'var(--so-text-secondary)' }}>
            {row.getValue('order_number') || '-'}
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
        accessorKey: 'run_name',
        header: 'Run',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('run_name') || '-'}</span>
        ),
      },
      {
        accessorKey: 'weight_lbs',
        header: 'Weight (lbs)',
        cell: ({ row }) => (
          <span className="font-medium" style={{ color: 'var(--so-text-primary)' }}>
            {parseFloat(row.getValue('weight_lbs')).toLocaleString(undefined, { minimumFractionDigits: 1 })}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => getStatusBadge(row.getValue('status') as string),
      },
      {
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-tertiary)' }}>
            {new Date(row.getValue('created_at')).toLocaleDateString()}
          </span>
        ),
      },
    ],
    []
  )

  const stopsColumns: ColumnDef<DeliveryStopListItem>[] = useMemo(
    () => [
      {
        accessorKey: 'run',
        header: 'Run',
        cell: ({ row }) => (
          <span className="font-medium" style={{ color: 'var(--so-text-secondary)' }}>
            {row.getValue('run')}
          </span>
        ),
      },
      {
        accessorKey: 'sequence',
        header: 'Seq #',
        cell: ({ row }) => (
          <span className="font-mono font-semibold" style={{ color: 'var(--so-text-primary)' }}>
            {row.getValue('sequence')}
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
        accessorKey: 'address',
        header: 'Address',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('address') || '-'}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => getStatusBadge(row.getValue('status') as string),
      },
      {
        accessorKey: 'order_count',
        header: 'Orders',
        cell: ({ row }) => (
          <span className="font-medium" style={{ color: 'var(--so-text-primary)' }}>
            {row.getValue('order_count')}
          </span>
        ),
      },
      {
        accessorKey: 'signed_by',
        header: 'Signed By',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('signed_by') || '-'}</span>
        ),
      },
      {
        accessorKey: 'delivered_at',
        header: 'Delivered At',
        cell: ({ row }) => {
          const val = row.getValue('delivered_at') as string | null
          return (
            <span style={{ color: 'var(--so-text-tertiary)' }}>
              {val ? new Date(val).toLocaleDateString() : '-'}
            </span>
          )
        },
      },
    ],
    []
  )

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>Logistics</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>
              Manage deliveries, license plates, and driver runs
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'lpns' && (
              <button className={primaryBtnClass} style={primaryBtnStyle}>
                <Plus className="h-3.5 w-3.5" />
                New LPN
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-5 animate-in delay-1">
          <FolderTabs
            tabs={[
              { id: 'lpns', label: 'LPNs' },
              { id: 'stops', label: 'Delivery Stops' },
            ]}
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as Tab)}
          />
        </div>

        {/* Table Card */}
        <div className="rounded-[14px] overflow-hidden animate-in delay-2"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
          <div className="px-6 py-4 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--so-border-light)', background: 'var(--so-surface-raised)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
              {activeTab === 'lpns' ? 'License Plates' : 'Delivery Stops'}
            </span>
            {activeTab === 'lpns' && !lpnLoading && !lpnError && (
              <span className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>
                {lpnData?.count ?? 0} total
              </span>
            )}
            {activeTab === 'stops' && !stopsLoading && !stopsError && (
              <span className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>
                {stopsData?.count ?? 0} total
              </span>
            )}
          </div>
          <div className="p-4">
            {activeTab === 'lpns' && (
              lpnLoading ? (
                <TableSkeleton columns={7} rows={8} />
              ) : lpnError ? (
                <div className="py-10 text-center text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                  Failed to load license plates.
                </div>
              ) : (
                <DataTable
                  columns={lpnColumns}
                  data={lpnData?.results ?? []}
                  searchColumn="code"
                  searchPlaceholder="Search by code..."
                  storageKey="logistics-lpns"
                />
              )
            )}
            {activeTab === 'stops' && (
              stopsLoading ? (
                <TableSkeleton columns={8} rows={8} />
              ) : stopsError ? (
                <div className="py-10 text-center text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                  Failed to load delivery stops.
                </div>
              ) : (
                <DataTable
                  columns={stopsColumns}
                  data={stopsData?.results ?? []}
                  searchColumn="customer_name"
                  searchPlaceholder="Search by customer..."
                  storageKey="logistics-stops"
                />
              )
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
