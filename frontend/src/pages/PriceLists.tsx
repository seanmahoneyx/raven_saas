import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, DollarSign } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { usePriceLists } from '@/api/priceLists'
import type { PriceList } from '@/types/api'

const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    draft:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    active:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    inactive:  { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    sent:      { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    partial:   { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    paid:      { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    overdue:   { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    void:      { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    complete:  { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    cancelled: { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    expired:   { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    confirmed: { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    applied:   { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    pending:   { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
  }
  const c = configs[status] || { bg: 'var(--so-warning-bg)', border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ background: c.text }} />
      {status}
    </span>
  )
}

const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

export default function PriceLists() {
  usePageTitle('Price Lists')
  const navigate = useNavigate()

  const { data: priceListsData, isLoading } = usePriceLists()

  const allPriceLists = priceListsData?.results ?? []
  const activeCount = allPriceLists.filter((p) => p.is_active).length
  const inactiveCount = allPriceLists.filter((p) => !p.is_active).length

  const columns: ColumnDef<PriceList>[] = useMemo(
    () => [
      {
        accessorKey: 'customer_name',
        header: 'Customer',
        cell: ({ row }) => (
          <div>
            <span className="font-medium" style={{ color: 'var(--so-text-primary)' }}>
              {row.original.customer_name}
            </span>
            <span className="text-xs font-mono ml-2" style={{ color: 'var(--so-text-tertiary)' }}>
              {row.original.customer_code}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'item_sku',
        header: 'Item',
        cell: ({ row }) => (
          <div>
            <span className="font-mono text-sm" style={{ color: 'var(--so-text-primary)' }}>
              {row.original.item_sku}
            </span>
            <span className="text-sm ml-2" style={{ color: 'var(--so-text-secondary)' }}>
              {row.original.item_name}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'begin_date',
        header: 'Begin Date',
        cell: ({ row }) => {
          const date = row.getValue('begin_date') as string
          return (
            <span style={{ color: 'var(--so-text-secondary)' }}>
              {date ? new Date(date + 'T00:00:00').toLocaleDateString() : '-'}
            </span>
          )
        },
      },
      {
        accessorKey: 'end_date',
        header: 'End Date',
        cell: ({ row }) => {
          const date = row.getValue('end_date') as string | null
          return (
            <span style={{ color: date ? 'var(--so-text-secondary)' : 'var(--so-text-tertiary)' }}>
              {date ? new Date(date + 'T00:00:00').toLocaleDateString() : 'Ongoing'}
            </span>
          )
        },
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => getStatusBadge(row.getValue('is_active') ? 'active' : 'inactive'),
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
            <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>Price Lists</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>
              Manage customer pricing with quantity break tiers
            </p>
          </div>
          <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => navigate('/price-lists/new')}>
            <Plus className="h-3.5 w-3.5" />
            New Price List
          </button>
        </div>

        {/* KPI Summary Cards */}
        <div className="rounded-[14px] mb-6 overflow-hidden animate-in delay-1"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
          <div className="grid grid-cols-3 divide-x" style={{ borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-5">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Total Price Lists
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>
                {allPriceLists.length}
              </div>
            </div>
            <div className="px-6 py-5" style={{ borderColor: 'var(--so-border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Active
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--so-success-text)' }}>
                {activeCount}
              </div>
            </div>
            <div className="px-6 py-5" style={{ borderColor: 'var(--so-border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Inactive
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--so-danger-text)' }}>
                {inactiveCount}
              </div>
            </div>
          </div>
        </div>

        {/* DataTable Card */}
        <div className="rounded-[14px] overflow-hidden animate-in delay-2"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
          <div className="px-6 py-4 flex items-center gap-2"
            style={{ borderBottom: '1px solid var(--so-border-light)', background: 'var(--so-surface-raised)' }}>
            <DollarSign className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>All Price Lists</span>
          </div>
          <div className="p-4">
            {isLoading ? (
              <div className="text-center py-8 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
            ) : (
              <DataTable
                columns={columns}
                data={priceListsData?.results ?? []}
                searchColumn="customer_name"
                searchPlaceholder="Search by customer..."
                storageKey="price-lists"
                onRowClick={(row) => navigate(`/price-lists/${row.id}`)}
              />
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
