import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Package, Search, X, ChevronDown, Plus, ExternalLink } from 'lucide-react'
import { useItems, useItem } from '@/api/items'
import { ProductCardTab } from '@/components/items/ProductCardTab'
import { primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'

export default function ProductCards() {
  usePageTitle('Product Cards')
  const navigate = useNavigate()

  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [searchText, setSearchText] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch items: when dropdown is open with search text, filter; otherwise load recent items
  const { data: searchResults, isLoading: searchLoading } = useItems(
    dropdownOpen
      ? searchText.length >= 1
        ? { search: searchText }
        : {}
      : undefined
  )
  const { data: selectedItem } = useItem(selectedItemId)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setDropdownOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handleSelectItem(id: number) {
    setSelectedItemId(id)
    setSearchText('')
    setDropdownOpen(false)
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedItemId(null)
    setSearchText('')
    setDropdownOpen(false)
  }

  function handleTriggerClick() {
    setDropdownOpen(true)
    // Focus the search input after opening
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const items = searchResults?.results ?? []

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">

        {/* Page header */}
        <div className="mb-7" data-print-hide>
          <div className="flex items-start justify-between gap-4 mb-1">
            <div className="flex items-center gap-2.5">
              <Package size={20} style={{ color: 'var(--so-accent)' }} />
              <h1
                className="text-2xl font-bold"
                style={{ color: 'var(--so-text-primary)', letterSpacing: '-0.03em' }}
              >
                Product Cards
              </h1>
            </div>
            <button
              type="button"
              className={primaryBtnClass}
              style={primaryBtnStyle}
              onClick={() => navigate('/items/new')}
            >
              <Plus size={14} />
              New Product Card
            </button>
          </div>
          <p className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
            View complete pricing, costing, and RFQ history for any item
          </p>
        </div>

        {/* Item selector dropdown */}
        <div className="mb-6" data-print-hide>
          <div ref={containerRef} className="relative" style={{ maxWidth: 420 }}>
            <div
              className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5"
              style={{ color: 'var(--so-text-tertiary)' }}
            >
              Select Item
            </div>

            {/* Trigger button */}
            <button
              type="button"
              onClick={handleTriggerClick}
              className="w-full h-10 rounded-md px-3 flex items-center gap-2 text-left transition-all cursor-pointer"
              style={{
                border: dropdownOpen ? '1px solid var(--so-accent)' : '1px solid var(--so-border)',
                background: 'var(--so-surface)',
                boxShadow: dropdownOpen ? '0 0 0 2px rgba(var(--so-accent-rgb, 99,102,241), 0.15)' : 'none',
              }}
            >
              <Search size={14} className="shrink-0" style={{ color: 'var(--so-text-tertiary)' }} />
              {selectedItem ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span
                    className="font-mono text-xs font-bold shrink-0"
                    style={{ color: 'var(--so-accent)' }}
                  >
                    {selectedItem.sku}
                  </span>
                  <span
                    className="text-sm truncate"
                    style={{ color: 'var(--so-text-primary)' }}
                  >
                    {selectedItem.name}
                  </span>
                </div>
              ) : (
                <span className="text-sm flex-1" style={{ color: 'var(--so-text-tertiary)' }}>
                  Search by SKU or name...
                </span>
              )}
              {selectedItem ? (
                <span
                  className="shrink-0 p-0.5 rounded hover:bg-[var(--so-bg)] transition-colors"
                  onClick={handleClear}
                  title="Clear selection"
                >
                  <X size={14} style={{ color: 'var(--so-text-tertiary)' }} />
                </span>
              ) : (
                <ChevronDown size={14} className="shrink-0" style={{ color: 'var(--so-text-tertiary)' }} />
              )}
            </button>

            {/* Dropdown panel */}
            {dropdownOpen && (
              <div
                className="absolute left-0 right-0 top-full mt-1 rounded-[10px] border shadow-lg overflow-hidden"
                style={{
                  background: 'var(--so-surface)',
                  borderColor: 'var(--so-border)',
                  zIndex: 50,
                }}
              >
                {/* Search input inside dropdown */}
                <div
                  className="px-3 py-2"
                  style={{ borderBottom: '1px solid var(--so-border-light)' }}
                >
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'var(--so-text-tertiary)' }}
                    />
                    <input
                      ref={inputRef}
                      type="text"
                      placeholder="Type to filter items..."
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      className="w-full pl-8 pr-3 h-8 rounded-md text-sm outline-none"
                      style={{
                        border: '1px solid var(--so-border-light)',
                        background: 'var(--so-bg)',
                        color: 'var(--so-text-primary)',
                      }}
                      autoFocus
                    />
                  </div>
                </div>

                {/* Results list */}
                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {searchLoading ? (
                    <div className="px-4 py-3 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                      Searching...
                    </div>
                  ) : items.length === 0 ? (
                    <div className="px-4 py-3 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                      {searchText.length >= 1 ? 'No items found' : 'Start typing to search...'}
                    </div>
                  ) : (
                    items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer"
                        style={{
                          borderBottom: '1px solid var(--so-border-light)',
                          background: item.id === selectedItemId ? 'var(--so-bg)' : 'transparent',
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          handleSelectItem(item.id)
                        }}
                        onMouseEnter={(e) => {
                          ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--so-bg)'
                        }}
                        onMouseLeave={(e) => {
                          ;(e.currentTarget as HTMLButtonElement).style.background =
                            item.id === selectedItemId ? 'var(--so-bg)' : ''
                        }}
                      >
                        <span
                          className="font-mono text-xs font-semibold shrink-0"
                          style={{ color: 'var(--so-accent)' }}
                        >
                          {item.sku}
                        </span>
                        <span
                          className="text-sm flex-1 truncate"
                          style={{ color: 'var(--so-text-primary)' }}
                        >
                          {item.name}
                        </span>
                        {item.division && (
                          <span
                            className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded shrink-0"
                            style={{
                              background: 'var(--so-bg)',
                              color: 'var(--so-text-tertiary)',
                              border: '1px solid var(--so-border-light)',
                            }}
                          >
                            {item.division}
                          </span>
                        )}
                        {item.id === selectedItemId && (
                          <span
                            className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
                            style={{
                              background: 'var(--so-accent)',
                              color: 'white',
                            }}
                          >
                            Selected
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Open in detail view link */}
        {selectedItemId && (
          <div className="mb-4" data-print-hide>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer"
              style={{ color: 'var(--so-accent)' }}
              onClick={() => navigate(`/items/${selectedItemId}`)}
            >
              <ExternalLink size={12} />
              Open in detail view
            </button>
          </div>
        )}

        {/* Product card content */}
        {selectedItemId ? (
          <ProductCardTab itemId={selectedItemId} />
        ) : (
          <div
            className="rounded-[14px] border flex flex-col items-center justify-center py-20"
            style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
            data-print-hide
          >
            <Package size={36} style={{ color: 'var(--so-border)' }} className="mb-3" />
            <p className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>
              Select an item above to view its product card
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
              Pricing, costing, and RFQ history will appear here
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
