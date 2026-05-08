import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useItems } from '@/api/items'
import { getStatusBadge } from '@/components/ui/StatusBadge'
import { DIVISIONS } from '@/constants/items'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const LIFECYCLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_design', label: 'Design Requested' },
  { value: 'in_design', label: 'In Design' },
  { value: 'design_complete', label: 'Design Complete' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'active', label: 'Active' },
]

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

export default function ItemSetupWorkbench() {
  usePageTitle('Item Setup Workbench')
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const lifecycleParam = statusFilter === 'all' ? undefined : statusFilter

  const { data, isLoading } = useItems(
    lifecycleParam ? { lifecycle_status: lifecycleParam } : undefined
  )
  const items = data?.results ?? []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((i) =>
      [i.sku, i.name, i.customer_name].some((v) => (v ?? '').toLowerCase().includes(q))
    )
  }, [items, search])

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16">

        {/* Header */}
        <div className="mb-6 animate-in flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--so-text-primary)' }}>Item Setup Workbench</h1>
            <p className="mt-1 text-[13.5px]" style={{ color: 'var(--so-text-muted)' }}>
              Review, approve, and advance items through their lifecycle
            </p>
          </div>
          <div className="text-[13px]" style={{ color: 'var(--so-text-muted)' }}>
            {filtered.length} of {items.length}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4 animate-in delay-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU, name, or customer..."
            className="flex-1 min-w-[220px] h-9 rounded-md px-3 text-[13px] outline-none"
            style={{
              border: '1px solid var(--so-border)',
              background: 'var(--so-surface)',
              color: 'var(--so-text-primary)',
            }}
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[200px] text-[13px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {LIFECYCLE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        <div
          className="rounded-[14px] overflow-hidden animate-in delay-2"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}
        >
          {/* Header row */}
          <div
            className="hidden md:grid grid-cols-[140px_1fr_140px_200px_160px_140px] gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider"
            style={{
              background: 'var(--so-bg)',
              color: 'var(--so-text-tertiary)',
              borderBottom: '1px solid var(--so-border-light)',
            }}
          >
            <div>SKU</div>
            <div>Name</div>
            <div>Division</div>
            <div>Customer</div>
            <div>Status</div>
            <div>Requested</div>
          </div>

          {isLoading ? (
            <div className="px-4 py-12 text-center text-[13px]" style={{ color: 'var(--so-text-muted)' }}>
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-12 text-center text-[13px]" style={{ color: 'var(--so-text-muted)' }}>
              No items match the current filter
            </div>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`/items/${item.id}`)}
                className="w-full text-left grid grid-cols-1 md:grid-cols-[140px_1fr_140px_200px_160px_140px] gap-1 md:gap-3 px-4 py-3 transition-colors hover:bg-[var(--so-bg)] cursor-pointer"
                style={{
                  borderTop: idx === 0 ? 'none' : '1px solid var(--so-border-light)',
                }}
              >
                <div className="font-mono text-[12.5px]" style={{ color: 'var(--so-text-secondary)' }}>
                  {item.sku || '—'}
                </div>
                <div className="text-[13.5px] font-medium truncate" style={{ color: 'var(--so-text-primary)' }}>
                  {item.name}
                </div>
                <div className="text-[12.5px]" style={{ color: 'var(--so-text-secondary)' }}>
                  {divisionLabel(item.division)}
                </div>
                <div className="text-[12.5px] truncate" style={{ color: 'var(--so-text-secondary)' }}>
                  {item.customer_name || '—'}
                </div>
                <div>{getStatusBadge(item.lifecycle_status ?? 'draft')}</div>
                <div className="text-[12.5px]" style={{ color: 'var(--so-text-tertiary)' }}>
                  {item.created_at ? formatDate(item.created_at) : '—'}
                </div>
              </button>
            ))
          )}
        </div>

      </div>
    </div>
  )
}
