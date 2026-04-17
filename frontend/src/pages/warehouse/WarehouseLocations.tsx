import { useMemo, useState } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { CheckCircle2, XCircle } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { FolderTabs } from '@/components/ui/folder-tabs'
import { useWarehouseLocations, useLots } from '@/api/warehouse'
import type { WarehouseLocation, Lot } from '@/api/warehouse'
import { format, isPast, parseISO } from 'date-fns'

function toTitleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

type Tab = 'locations' | 'lots'

export default function WarehouseLocations() {
  usePageTitle('Warehouse Locations & Lots')

  const [activeTab, setActiveTab] = useState<Tab>('locations')

  const { data: locationsData, isLoading: locationsLoading } = useWarehouseLocations()
  const { data: lotsData, isLoading: lotsLoading } = useLots()

  const locationColumns: ColumnDef<WarehouseLocation>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="font-medium text-[13px]">{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'barcode',
        header: 'Barcode',
        cell: ({ row }) => {
          const bc = row.original.barcode
          return bc ? (
            <span className="font-mono text-[12px]" style={{ color: 'var(--so-text-secondary)' }}>{bc}</span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
          )
        },
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => {
          const type = row.original.type
          return type ? (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-medium"
              style={{
                background: 'var(--so-surface-raised)',
                border: '1px solid var(--so-border)',
                color: 'var(--so-text-secondary)',
              }}
            >
              {toTitleCase(type)}
            </span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
          )
        },
      },
      {
        accessorKey: 'warehouse_code',
        header: 'Warehouse',
        cell: ({ row }) => {
          const code = row.original.warehouse_code
          return code ? (
            <span className="font-mono text-[12px]" style={{ color: 'var(--so-text-secondary)' }}>{code}</span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
          )
        },
      },
      {
        accessorKey: 'parent_path',
        header: 'Parent Path',
        cell: ({ row }) => {
          const path = row.original.parent_path
          return path ? (
            <span className="text-[12px] truncate max-w-[200px] block" style={{ color: 'var(--so-text-secondary)' }}>
              {path}
            </span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
          )
        },
      },
      {
        accessorKey: 'is_active',
        header: 'Active',
        cell: ({ row }) =>
          row.original.is_active ? (
            <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--so-success, #4a905c)' }} />
          ) : (
            <XCircle className="h-4 w-4" style={{ color: 'var(--so-danger, #dc2626)' }} />
          ),
      },
    ],
    []
  )

  const lotColumns: ColumnDef<Lot>[] = useMemo(
    () => [
      {
        accessorKey: 'lot_number',
        header: 'Lot Number',
        cell: ({ row }) => (
          <span className="font-mono font-medium text-[13px]">{row.original.lot_number}</span>
        ),
      },
      {
        accessorKey: 'item_sku',
        header: 'Item SKU',
        cell: ({ row }) => {
          const sku = row.original.item_sku
          return sku ? (
            <span className="font-mono text-[12px]" style={{ color: 'var(--so-text-secondary)' }}>{sku}</span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
          )
        },
      },
      {
        accessorKey: 'vendor_batch',
        header: 'Vendor Batch',
        cell: ({ row }) => {
          const val = row.original.vendor_batch
          return val ? (
            <span className="text-[13px]">{val}</span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
          )
        },
      },
      {
        accessorKey: 'manufacturer_batch_id',
        header: 'Manufacturer Batch',
        cell: ({ row }) => {
          const val = row.original.manufacturer_batch_id
          return val ? (
            <span className="text-[13px]">{val}</span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
          )
        },
      },
      {
        accessorKey: 'expiry_date',
        header: 'Expiry Date',
        cell: ({ row }) => {
          const expiry = row.original.expiry_date
          if (!expiry) return <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
          const expired = isPast(parseISO(expiry))
          return (
            <span
              className="text-[13px] font-medium"
              style={{ color: expired ? 'var(--so-danger, #dc2626)' : 'var(--so-text-primary)' }}
            >
              {format(parseISO(expiry), 'MMM d, yyyy')}
            </span>
          )
        },
      },
      {
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => {
          const created = row.original.created_at
          return created ? (
            <span className="text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>
              {format(parseISO(created), 'MMM d, yyyy')}
            </span>
          ) : (
            <span style={{ color: 'var(--so-text-tertiary)' }}>—</span>
          )
        },
      },
    ],
    []
  )

  return (
    <div className="raven-page">
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>
              Warehouse Locations &amp; Lots
            </h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
              Manage storage locations and lot tracking
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-5 animate-in delay-1">
          <FolderTabs
            tabs={[
              { id: 'locations', label: 'Locations' },
              { id: 'lots', label: 'Lots' },
            ]}
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as Tab)}
          />
        </div>

        <div className="rounded-[14px] overflow-hidden animate-in delay-2"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>

          {/* Locations Tab */}
          {activeTab === 'locations' && (
            <>
              <div
                className="flex items-center justify-between px-6 py-4"
                style={{ borderBottom: '1px solid var(--so-border-light)' }}
              >
                <span className="text-sm font-semibold">Locations</span>
                <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
                  {locationsData?.results?.length ?? 0} total
                </span>
              </div>
              {locationsLoading ? (
                <div className="p-6">
                  <TableSkeleton columns={6} rows={8} />
                </div>
              ) : (
                <DataTable
                  storageKey="warehouse-locations"
                  columns={locationColumns}
                  data={locationsData?.results ?? []}
                  searchColumn="name"
                  searchPlaceholder="Search locations..."
                />
              )}
            </>
          )}

          {/* Lots Tab */}
          {activeTab === 'lots' && (
            <>
              <div
                className="flex items-center justify-between px-6 py-4"
                style={{ borderBottom: '1px solid var(--so-border-light)' }}
              >
                <span className="text-sm font-semibold">Lots</span>
                <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
                  {lotsData?.results?.length ?? 0} total
                </span>
              </div>
              {lotsLoading ? (
                <div className="p-6">
                  <TableSkeleton columns={6} rows={8} />
                </div>
              ) : (
                <DataTable
                  storageKey="warehouse-lots"
                  columns={lotColumns}
                  data={lotsData?.results ?? []}
                  searchColumn="lot_number"
                  searchPlaceholder="Search lots..."
                />
              )}
            </>
          )}

        </div>

      </div>
    </div>
  )
}
