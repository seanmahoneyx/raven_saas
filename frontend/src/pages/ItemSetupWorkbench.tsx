import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useItems } from '@/api/items'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { outlineBtnClass, outlineBtnStyle } from '@/components/ui/button-styles'
import { DIVISIONS } from '@/constants/items'
import type { Item } from '@/types/api'

type FilterTab = 'draft' | 'in_design' | 'pending_approval' | 'all'

const DIVISION_COLORS: Record<string, { bg: string; color: string }> = {
  corrugated: { bg: 'var(--so-accent-light)', color: 'var(--so-accent)' },
  packaging: { bg: '#fef3c7', color: '#92400e' },
  tooling: { bg: '#f3e8ff', color: '#6b21a8' },
  janitorial: { bg: '#dcfce7', color: '#166534' },
  misc: { bg: 'var(--so-border-light)', color: 'var(--so-text-secondary)' },
}

function divisionLabel(value: string): string {
  return DIVISIONS.find((d) => d.value === value)?.label ?? value
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function ItemWorkbenchCard({ item }: { item: Item }) {
  const navigate = useNavigate()
  const divStyle = DIVISION_COLORS[item.division] ?? DIVISION_COLORS.misc

  return (
    <div
      className="rounded-[14px] p-5 flex flex-col gap-3"
      style={{
        border: '1px solid var(--so-border)',
        background: 'var(--so-surface)',
      }}
    >
      {/* Top row: SKU + status badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {item.sku && (
            <span className="font-mono text-[12px] block mb-0.5" style={{ color: 'var(--so-text-tertiary)' }}>
              {item.sku}
            </span>
          )}
          <span className="font-bold text-[15px] leading-snug" style={{ color: 'var(--so-text-primary)' }}>
            {item.name}
          </span>
        </div>
        {getStatusBadge(item.lifecycle_status ?? 'draft')}
      </div>

      {/* Division badge */}
      <div>
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
          style={{ background: divStyle.bg, color: divStyle.color }}
        >
          {divisionLabel(item.division)}
        </span>
      </div>

      {/* Customer */}
      {item.customer_name && (
        <p className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
          {item.customer_name}
        </p>
      )}

      {/* Created date */}
      {item.created_at && (
        <p className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
          Requested {formatDate(item.created_at)}
        </p>
      )}

      {/* Action */}
      <div className="mt-auto pt-1">
        <button
          className={outlineBtnClass}
          style={outlineBtnStyle}
          onClick={() => navigate(`/items/${item.id}`)}
        >
          Open
        </button>
      </div>
    </div>
  )
}

export default function ItemSetupWorkbench() {
  usePageTitle('Item Setup Workbench')
  const [activeTab, setActiveTab] = useState<FilterTab>('draft')

  const lifecycleParam: string | undefined =
    activeTab === 'all' ? undefined : activeTab

  const { data, isLoading } = useItems(
    lifecycleParam ? { lifecycle_status: lifecycleParam } : undefined
  )
  const items = data?.results ?? []

  // For counts on all tabs, fetch all once
  const { data: allData } = useItems()
  const allItems = allData?.results ?? []
  const draftCount = allItems.filter((i) => i.lifecycle_status === 'draft').length
  const inDesignCount = allItems.filter((i) => i.lifecycle_status === 'in_design').length
  const pendingCount = allItems.filter((i) => i.lifecycle_status === 'pending_approval').length
  const allCount = allItems.length

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'draft', label: 'Draft', count: draftCount },
    { key: 'in_design', label: 'In Design', count: inDesignCount },
    { key: 'pending_approval', label: 'Pending Approval', count: pendingCount },
    { key: 'all', label: 'All', count: allCount },
  ]

  const emptyMessage: Record<FilterTab, string> = {
    draft: 'No draft item requests',
    in_design: 'No items currently in design',
    pending_approval: 'No items pending approval',
    all: 'No items found',
  }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="mb-8 animate-in">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>Item Setup Workbench</h1>
          <p className="mt-1 text-[13.5px]" style={{ color: 'var(--so-text-muted)' }}>
            Review and complete item specifications
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-6 animate-in delay-1 flex-wrap">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-all cursor-pointer"
                style={
                  isActive
                    ? { background: 'var(--so-accent)', color: '#fff', border: '1px solid var(--so-accent)' }
                    : { background: 'transparent', color: 'var(--so-text-secondary)', border: '1px solid var(--so-border)' }
                }
              >
                {tab.label}
                <span
                  className="inline-flex items-center justify-center rounded-full text-[11px] font-semibold px-1.5 min-w-[20px] h-4"
                  style={
                    isActive
                      ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                      : { background: 'var(--so-border-light)', color: 'var(--so-text-tertiary)' }
                  }
                >
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Card grid */}
        {isLoading ? (
          <div className="text-center py-16 text-sm animate-in delay-2" style={{ color: 'var(--so-text-muted)' }}>
            Loading...
          </div>
        ) : items.length === 0 ? (
          <div
            className="rounded-[14px] py-16 text-center animate-in delay-2"
            style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}
          >
            <p className="text-[13px]" style={{ color: 'var(--so-text-muted)' }}>
              {emptyMessage[activeTab]}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in delay-2">
            {items.map((item) => (
              <ItemWorkbenchCard key={item.id} item={item} />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
