import React, { useState } from 'react'
import { Search, SlidersHorizontal, ArrowUpDown, X } from 'lucide-react'

interface SortOption {
  label: string
  key: string
}

interface MobileCardListProps<T> {
  data: T[]
  renderCard: (item: T) => React.ReactNode
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  sortOptions: SortOption[]
  currentSort: string
  onSortChange: (key: string) => void
  sortDirection: 'asc' | 'desc'
  onSortDirectionChange: () => void
  filterContent?: React.ReactNode
  isFiltered?: boolean
  resultCount?: number
  onItemClick?: (item: T) => void
  emptyMessage?: string
}

export function MobileCardList<T>({
  data,
  renderCard,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  sortOptions,
  currentSort,
  onSortChange,
  sortDirection,
  onSortDirectionChange,
  filterContent,
  isFiltered = false,
  resultCount,
  onItemClick,
  emptyMessage = 'No results found.',
}: MobileCardListProps<T>) {
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      {/* Search + Filter row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
            style={{ color: 'var(--so-text-tertiary)' }}
          />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full h-11 pl-9 pr-3 rounded-xl text-sm outline-none"
            style={{
              background: 'var(--so-surface)',
              border: '1px solid var(--so-border)',
              color: 'var(--so-text-primary)',
            }}
          />
        </div>
        {filterContent && (
          <button
            onClick={() => setFilterSheetOpen(true)}
            className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: isFiltered ? 'var(--so-accent-muted)' : 'var(--so-surface)',
              border: `1px solid ${isFiltered ? 'var(--so-accent)' : 'var(--so-border)'}`,
              color: isFiltered ? 'var(--so-accent)' : 'var(--so-text-secondary)',
            }}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Sort row */}
      <div className="flex items-center gap-2">
        <select
          value={currentSort}
          onChange={(e) => onSortChange(e.target.value)}
          className="flex-1 h-9 px-3 rounded-lg text-sm outline-none appearance-none"
          style={{
            background: 'var(--so-surface)',
            border: '1px solid var(--so-border)',
            color: 'var(--so-text-secondary)',
          }}
        >
          {sortOptions.map((opt) => (
            <option key={opt.key} value={opt.key}>
              Sort: {opt.label}
            </option>
          ))}
        </select>
        <button
          onClick={onSortDirectionChange}
          className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: 'var(--so-surface)',
            border: '1px solid var(--so-border)',
            color: 'var(--so-text-secondary)',
          }}
          title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
        >
          <ArrowUpDown
            className="h-3.5 w-3.5"
            style={{
              transform: sortDirection === 'desc' ? 'scaleY(-1)' : 'none',
              transition: 'transform 0.15s ease',
            }}
          />
        </button>
        {resultCount !== undefined && (
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--so-text-tertiary)' }}>
            {resultCount} result{resultCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Cards */}
      {data.length === 0 ? (
        <div
          className="flex items-center justify-center py-12 text-sm rounded-xl"
          style={{ color: 'var(--so-text-tertiary)', border: '1px dashed var(--so-border)' }}
        >
          {emptyMessage}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((item, idx) => (
            <div
              key={idx}
              onClick={() => onItemClick?.(item)}
              style={{ cursor: onItemClick ? 'pointer' : undefined }}
            >
              {renderCard(item)}
            </div>
          ))}
        </div>
      )}

      {/* Filter bottom sheet backdrop */}
      {filterSheetOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={() => setFilterSheetOpen(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl"
            style={{
              background: 'var(--so-surface)',
              borderTop: '1px solid var(--so-border)',
              animation: 'slideUpSheet 0.22s ease',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-3" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="font-semibold text-sm" style={{ color: 'var(--so-text-primary)' }}>
                Filters
              </span>
              <button
                onClick={() => setFilterSheetOpen(false)}
                className="h-7 w-7 rounded-full flex items-center justify-center"
                style={{ background: 'var(--so-bg)', color: 'var(--so-text-secondary)' }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="px-4 py-4">
              {filterContent}
            </div>
            <div className="px-4 pb-6">
              <button
                onClick={() => setFilterSheetOpen(false)}
                className="w-full h-11 rounded-xl text-sm font-semibold"
                style={{
                  background: 'var(--so-accent)',
                  color: '#fff',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes slideUpSheet {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
