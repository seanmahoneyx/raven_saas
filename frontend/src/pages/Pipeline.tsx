import { useState, useMemo } from 'react'
import { formatCurrency as formatCurrencyFull } from '@/lib/format'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { usePipelineData } from '@/api/pipeline'
import { useItems } from '@/api/items'
import type { PipelineStage, PipelineCard as PipelineCardType, Item } from '@/types/api'
import { ArrowRight, Filter, X, Clock, Layers } from 'lucide-react'

type Track = 'customer' | 'vendor' | 'both' | 'items'

const STAGE_ROUTES: Record<string, string> = {
  design_request: '/design-requests',
  estimate: '/estimates',
  sales_order: '/customers/open-orders',
  shipment: '/shipping',
  invoice: '/invoices',
  payment: '/receive-payment',
  rfq: '/rfqs',
  purchase_order: '/vendors/open-orders',
  receiving: '/inventory',
  vendor_bill: '/invoices',
  bill_payment: '/invoices',
}

function getCardRoute(entityType: string, id: number): string {
  switch (entityType) {
    case 'sales_order': return `/orders/sales/${id}`
    case 'purchase_order': return `/orders/purchase/${id}`
    case 'design_request': return '/design-requests'
    case 'estimate': return '/estimates'
    case 'shipment': return '/orders/sales'
    case 'invoice': return '/invoices'
    case 'customer_payment': return '/receive-payment'
    case 'rfq': return '/rfqs'
    case 'inventory_lot': return '/orders/purchase'
    case 'vendor_bill': return '/invoices'
    case 'bill_payment': return '/invoices'
    default: return STAGE_ROUTES[entityType] || '/'
  }
}

// Each stage gets a unique accent color for column header bar + card left border
const STAGE_COLORS: Record<string, string> = {
  design_request: '#6366f1',  // indigo
  estimate: '#f59e0b',        // amber
  sales_order: '#3b82f6',     // blue
  shipment: '#06b6d4',        // cyan
  invoice: '#10b981',         // emerald
  payment: '#22c55e',         // green
  rfq: '#8b5cf6',             // violet
  purchase_order: '#ec4899',  // pink
  receiving: '#f97316',       // orange
  vendor_bill: '#ef4444',     // red
  bill_payment: '#14b8a6',    // teal
}

import { getStatusBadge } from '@/components/ui/StatusBadge'

function formatCurrency(value: string | null) {
  if (!value) return null
  const num = parseFloat(value)
  if (isNaN(num)) return null
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num)
}


export default function Pipeline() {
  usePageTitle('Pipeline')
  const navigate = useNavigate()

  const [activeTrack, setActiveTrack] = useState<Track>('customer')
  const [filters, setFilters] = useState<{ customer?: string; vendor?: string; date_from?: string; date_to?: string }>({})

  const queryFilters = useMemo(() => ({
    customer: filters.customer ? Number(filters.customer) : undefined,
    vendor: filters.vendor ? Number(filters.vendor) : undefined,
    date_from: filters.date_from || undefined,
    date_to: filters.date_to || undefined,
  }), [filters])

  const { data, isLoading } = usePipelineData(queryFilters)

  const stages = useMemo(() => {
    if (!data) return []
    if (activeTrack === 'customer') return data.customer_track
    if (activeTrack === 'vendor') return data.vendor_track
    return [...data.customer_track, ...data.vendor_track]
  }, [data, activeTrack])

  const hasFilters = filters.customer || filters.vendor || filters.date_from || filters.date_to

  // Fetch items for each lifecycle stage (only when items tab active)
  const { data: draftItems } = useItems(activeTrack === 'items' ? { lifecycle_status: 'draft' } : undefined)
  const { data: pendingDesignItems } = useItems(activeTrack === 'items' ? { lifecycle_status: 'pending_design' } : undefined)
  const { data: inDesignItems } = useItems(activeTrack === 'items' ? { lifecycle_status: 'in_design' } : undefined)
  const { data: pendingApprovalItems } = useItems(activeTrack === 'items' ? { lifecycle_status: 'pending_approval' } : undefined)

  const tabs: { key: Track; label: string }[] = [
    { key: 'customer', label: 'Customer' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'both', label: 'Both' },
    { key: 'items', label: 'Items' },
  ]

  return (
    <div className="raven-page animate-in" style={{ minHeight: '100vh' }}>
      <div className="mx-auto px-4 md:px-8 py-7 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text)' }}>Pipeline</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--so-text-secondary)' }}>
            Track deals from inception to payment
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5" style={{ color: 'var(--so-text-secondary)' }}>
          <Filter size={14} />
          <span className="text-xs font-medium">Filters</span>
        </div>
        <input
          type="text"
          placeholder="Customer ID"
          value={filters.customer || ''}
          onChange={e => setFilters(f => ({ ...f, customer: e.target.value || undefined }))}
          className="h-8 px-2.5 rounded-md text-xs"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text)', width: 110 }}
        />
        <input
          type="text"
          placeholder="Vendor ID"
          value={filters.vendor || ''}
          onChange={e => setFilters(f => ({ ...f, vendor: e.target.value || undefined }))}
          className="h-8 px-2.5 rounded-md text-xs"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text)', width: 110 }}
        />
        <input
          type="date"
          value={filters.date_from || ''}
          onChange={e => setFilters(f => ({ ...f, date_from: e.target.value || undefined }))}
          className="h-8 px-2.5 rounded-md text-xs"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text)' }}
        />
        <input
          type="date"
          value={filters.date_to || ''}
          onChange={e => setFilters(f => ({ ...f, date_to: e.target.value || undefined }))}
          className="h-8 px-2.5 rounded-md text-xs"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text)' }}
        />
        {hasFilters && (
          <button
            onClick={() => setFilters({})}
            className="h-8 px-2.5 rounded-md text-xs font-medium flex items-center gap-1 hover:opacity-80 transition-opacity"
            style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }}
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--so-surface-raised)' }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTrack(tab.key)}
              className="px-4 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                background: activeTrack === tab.key ? 'var(--so-surface)' : 'transparent',
                color: activeTrack === tab.key ? 'var(--so-text)' : 'var(--so-text-secondary)',
                boxShadow: activeTrack === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {activeTrack !== 'items' && isLoading && (
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[280px] rounded-xl p-4 animate-pulse"
              style={{ background: 'var(--so-surface)', border: '1px solid var(--so-border)' }}>
              <div className="h-4 w-24 rounded mb-4" style={{ background: 'var(--so-surface-raised)' }} />
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-20 rounded-lg mb-2" style={{ background: 'var(--so-surface-raised)' }} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {activeTrack !== 'items' && !isLoading && stages.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl"
          style={{ background: 'var(--so-surface)', border: '1px solid var(--so-border)' }}>
          <Layers size={40} style={{ color: 'var(--so-text-muted)' }} />
          <p className="mt-3 text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>No pipeline data</p>
          <p className="text-xs mt-1" style={{ color: 'var(--so-text-muted)' }}>Create orders or estimates to see them flow through the pipeline</p>
        </div>
      )}

      {/* Kanban Board (Order Pipeline) */}
      {activeTrack !== 'items' && !isLoading && stages.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
          {stages.map(stage => (
            <KanbanColumn
              key={stage.stage}
              stage={stage}
              onCardClick={(card) => navigate(getCardRoute(card.entity_type, card.id))}
              onViewAll={() => navigate(STAGE_ROUTES[stage.stage] || '/')}
            />
          ))}
        </div>
      )}

      {/* Item Lifecycle Kanban */}
      {activeTrack === 'items' && (
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
          {[
            { key: 'draft', label: 'Drafts', color: '#a855f7', items: draftItems?.results ?? [] },
            { key: 'pending_design', label: 'Design Requested', color: '#f59e0b', items: pendingDesignItems?.results ?? [] },
            { key: 'in_design', label: 'In Design', color: '#3b82f6', items: inDesignItems?.results ?? [] },
            { key: 'pending_approval', label: 'Pending Approval', color: '#f97316', items: pendingApprovalItems?.results ?? [] },
          ].map(col => (
            <div key={col.key} className="flex-shrink-0 w-[280px] flex flex-col rounded-xl overflow-hidden"
              style={{ background: 'var(--so-surface)', border: '1px solid var(--so-border)', maxHeight: 'calc(100vh - 280px)' }}>
              <div style={{ height: 3, background: col.color }} />
              <div className="px-3.5 py-3" style={{ borderBottom: '1px solid var(--so-border)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold" style={{ color: 'var(--so-text)' }}>{col.label}</span>
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold"
                    style={{ background: col.color, color: 'white' }}>
                    {col.items.length}
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2" style={{ scrollbarWidth: 'thin' }}>
                {col.items.length === 0 && (
                  <div className="flex items-center justify-center py-8">
                    <span className="text-[11px]" style={{ color: 'var(--so-text-muted)' }}>No items</span>
                  </div>
                )}
                {col.items.map((item: Item) => (
                  <div
                    key={item.id}
                    onClick={() => navigate(`/items/${item.id}`)}
                    className="rounded-lg p-3 cursor-pointer transition-all hover:shadow-md"
                    style={{
                      background: 'var(--so-bg)',
                      border: '1px solid var(--so-border-light)',
                      borderLeft: `3px solid ${col.color}`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-mono font-semibold" style={{ color: col.color }}>
                        {item.sku}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--so-surface-raised)', color: 'var(--so-text-tertiary)' }}>
                        {item.division}
                      </span>
                    </div>
                    <div className="text-[12px] font-medium truncate" style={{ color: 'var(--so-text)' }}>
                      {item.name}
                    </div>
                    {item.customer_name && (
                      <div className="text-[11px] mt-1 truncate" style={{ color: 'var(--so-text-secondary)' }}>
                        {item.customer_name}
                      </div>
                    )}
                    <div className="text-[10px] mt-1.5" style={{ color: 'var(--so-text-muted)' }}>
                      <Clock size={10} className="inline mr-0.5" style={{ verticalAlign: '-1px' }} />
                      {new Date(item.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-3 py-2" style={{ borderTop: '1px solid var(--so-border)' }}>
                <button
                  onClick={() => navigate(`/items?lifecycle=${col.key}`)}
                  className="text-[11px] font-medium flex items-center gap-1 w-full justify-center py-1 rounded-md transition-colors hover:opacity-80"
                  style={{ color: col.color }}
                >
                  View all <ArrowRight size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}

function KanbanColumn({ stage, onCardClick, onViewAll }: {
  stage: PipelineStage
  onCardClick: (card: PipelineCardType) => void
  onViewAll: () => void
}) {
  const hasMore = stage.total_count > stage.cards.length
  const stageColor = STAGE_COLORS[stage.stage] || 'var(--so-accent)'

  return (
    <div className="flex-shrink-0 w-[280px] flex flex-col rounded-xl overflow-hidden"
      style={{ background: 'var(--so-surface)', border: '1px solid var(--so-border)', maxHeight: 'calc(100vh - 280px)' }}>
      {/* Colored top bar */}
      <div style={{ height: 3, background: stageColor }} />

      {/* Column Header with merged KPI info */}
      <div className="px-3.5 py-3" style={{ borderBottom: '1px solid var(--so-border)' }}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold" style={{ color: 'var(--so-text)' }}>
              {stage.label}
            </span>
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold"
              style={{ background: stageColor, color: 'white' }}>
              {stage.kpi.count}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {stage.kpi.total_value && (
            <span className="text-[11px] font-semibold" style={{ color: 'var(--so-text-secondary)' }}>
              {formatCurrency(stage.kpi.total_value)}
            </span>
          )}
          {stage.kpi.avg_days_in_stage !== null && (
            <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--so-text-muted)' }}>
              <Clock size={10} />
              {Math.round(stage.kpi.avg_days_in_stage)}d avg
            </span>
          )}
        </div>
      </div>

      {/* Card List */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2" style={{ scrollbarWidth: 'thin' }}>
        {stage.cards.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <span className="text-[11px]" style={{ color: 'var(--so-text-muted)' }}>No active items</span>
          </div>
        )}
        {stage.cards.map(card => {
          const cardKey = `${card.entity_type}:${card.id}`
          return (
            <div
              key={cardKey}
              onClick={() => onCardClick(card)}
              className="rounded-lg p-3 cursor-pointer transition-all hover:opacity-80"
              style={{
                background: 'var(--so-bg)',
                border: '1px solid var(--so-border)',
                borderLeft: `3px solid ${stageColor}`,
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-mono font-semibold" style={{ color: stageColor }}>
                  {card.number}
                </span>
                {getStatusBadge(card.status)}
              </div>
              <div className="text-[11px] font-medium truncate mb-1" style={{ color: 'var(--so-text)' }}>
                {card.customer_name || card.vendor_name || '—'}
              </div>
              <div className="flex items-center justify-between">
                {card.total_value && (
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--so-text)' }}>
                    {formatCurrencyFull(card.total_value)}
                  </span>
                )}
                <span className="text-[10px] flex items-center gap-0.5 ml-auto" style={{ color: 'var(--so-text-muted)' }}>
                  <Clock size={10} />
                  {card.age_days}d
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* View All Footer */}
      {hasMore && (
        <button
          onClick={onViewAll}
          className="px-3.5 py-2.5 flex items-center justify-center gap-1 text-xs font-medium transition-opacity hover:opacity-80"
          style={{ borderTop: '1px solid var(--so-border)', color: stageColor }}
        >
          View all {stage.total_count} <ArrowRight size={12} />
        </button>
      )}
    </div>
  )
}
