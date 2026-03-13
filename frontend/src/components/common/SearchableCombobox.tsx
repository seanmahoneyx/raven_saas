import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, X, Star, Clock } from 'lucide-react'
import { useSuggestions, useAddFavorite, useRemoveFavorite, useFavorites } from '@/api/favorites'
import type { EntityType, SuggestionItem } from '@/types/api'

// ── Types ────────────────────────────────────────────────────────────

interface SearchableComboboxProps {
  entityType: EntityType
  value: number | null
  onChange: (id: number | null, label: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
  className?: string
  allowClear?: boolean
  initialLabel?: string
}

// ── Debounce hook ────────────────────────────────────────────────────

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

// ── Flat row type for keyboard navigation ────────────────────────────

interface FlatRow {
  item: SuggestionItem
  section: 'favorites' | 'recents' | 'results'
}

// ── Component ────────────────────────────────────────────────────────

export function SearchableCombobox({
  entityType,
  value,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  required = false,
  className = '',
  allowClear = false,
  initialLabel,
}: SearchableComboboxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [resolvedLabel, setResolvedLabel] = useState<string>(initialLabel ?? '')

  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const debouncedSearch = useDebouncedValue(searchText, 300)

  // Fetch suggestions (favorites + recents + search results)
  const { data: suggestions } = useSuggestions(entityType, debouncedSearch, isOpen)

  // Fetch full favorites list to cross-reference star state in results rows
  const { data: favoritesData } = useFavorites(entityType)

  const addFavorite = useAddFavorite()
  const removeFavorite = useRemoveFavorite()

  // Build a set of favorited object_ids for quick lookup
  const favoritedIds = new Set<number>(favoritesData?.map(f => f.object_id) ?? [])

  // Build a map of object_id → favorite record id (needed for remove)
  const favoriteIdMap = new Map<number, number>(
    favoritesData?.map(f => [f.object_id, f.id]) ?? []
  )

  // Flatten visible rows for keyboard navigation
  const flatRows: FlatRow[] = []
  if (suggestions) {
    for (const item of suggestions.favorites) flatRows.push({ item, section: 'favorites' })
    for (const item of suggestions.recents) flatRows.push({ item, section: 'recents' })
    for (const item of suggestions.results) flatRows.push({ item, section: 'results' })
  }

  // Resolve label when value changes (from favorites/recents/results data)
  useEffect(() => {
    if (value == null) {
      setResolvedLabel('')
      return
    }
    if (initialLabel) {
      setResolvedLabel(initialLabel)
      return
    }
    if (!suggestions) return
    const all = [...suggestions.favorites, ...suggestions.recents, ...suggestions.results]
    const found = all.find(item => item.id === value)
    if (found) setResolvedLabel(found.label)
  }, [value, suggestions, initialLabel])

  // Click outside to close
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearchText('')
        setHighlightedIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 0)
    }
  }, [isOpen])

  // ── Handlers ──────────────────────────────────────────────────────

  function openDropdown() {
    if (disabled) return
    setIsOpen(true)
    setHighlightedIndex(-1)
  }

  function selectItem(item: SuggestionItem) {
    setResolvedLabel(item.label)
    onChange(item.id, item.label)
    setIsOpen(false)
    setSearchText('')
    setHighlightedIndex(-1)
  }

  function clearValue(e: React.MouseEvent) {
    e.stopPropagation()
    setResolvedLabel('')
    onChange(null, '')
  }

  const toggleFavorite = useCallback(
    (e: React.MouseEvent, item: SuggestionItem) => {
      e.stopPropagation()
      const existingFavoriteId = favoriteIdMap.get(item.id)
      if (existingFavoriteId != null) {
        removeFavorite.mutate(existingFavoriteId)
      } else {
        addFavorite.mutate({ entity_type: entityType, object_id: item.id })
      }
    },
    [favoriteIdMap, addFavorite, removeFavorite, entityType]
  )

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        openDropdown()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(i => (i < flatRows.length - 1 ? i + 1 : 0))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(i => (i > 0 ? i - 1 : flatRows.length - 1))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < flatRows.length) {
          selectItem(flatRows[highlightedIndex].item)
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        setSearchText('')
        setHighlightedIndex(-1)
        break
    }
  }

  // ── Section rendering ──────────────────────────────────────────────

  function renderRow(item: SuggestionItem, section: 'favorites' | 'recents' | 'results', flatIndex: number) {
    const isFavorited = favoritedIds.has(item.id)
    const isHighlighted = flatIndex === highlightedIndex
    const isSelected = item.id === value

    return (
      <div
        key={`${section}-${item.id}`}
        onMouseDown={(e) => { e.preventDefault(); selectItem(item) }}
        onMouseEnter={() => setHighlightedIndex(flatIndex)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 10px',
          cursor: 'pointer',
          background: isHighlighted || isSelected ? 'var(--so-bg)' : 'transparent',
          borderRadius: '6px',
        }}
      >
        {/* Star toggle */}
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); toggleFavorite(e, item) }}
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '20px',
            height: '20px',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            borderRadius: '3px',
          }}
          tabIndex={-1}
          aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star
            size={14}
            style={{
              fill: isFavorited ? '#f59e0b' : 'none',
              color: isFavorited ? '#f59e0b' : 'var(--so-text-tertiary)',
              transition: 'fill 0.1s, color 0.1s',
            }}
          />
        </button>

        {/* Label */}
        <span
          style={{
            flex: 1,
            fontSize: '13px',
            color: isSelected ? 'var(--so-accent)' : 'var(--so-text-primary)',
            fontWeight: isSelected ? 500 : 400,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.label}
        </span>
      </div>
    )
  }

  // ── Body content of the dropdown ──────────────────────────────────

  function renderDropdownBody() {
    if (!suggestions) {
      return (
        <div style={{ padding: '20px 10px', textAlign: 'center', fontSize: '13px', color: 'var(--so-text-tertiary)' }}>
          Loading…
        </div>
      )
    }

    const hasFavorites = suggestions.favorites.length > 0
    const hasRecents = suggestions.recents.length > 0
    const hasResults = suggestions.results.length > 0
    const hasSearch = debouncedSearch.trim().length > 0

    if (!hasFavorites && !hasRecents && !hasSearch) {
      return (
        <div style={{ padding: '20px 10px', textAlign: 'center', fontSize: '13px', color: 'var(--so-text-tertiary)' }}>
          Start typing to search…
        </div>
      )
    }

    if (hasSearch && !hasFavorites && !hasRecents && !hasResults) {
      return (
        <div style={{ padding: '20px 10px', textAlign: 'center', fontSize: '13px', color: 'var(--so-text-tertiary)' }}>
          No results found
        </div>
      )
    }

    let flatIndex = 0
    const sections: React.ReactNode[] = []

    if (hasFavorites) {
      sections.push(
        <div key="favorites-section">
          <div style={sectionHeaderStyle}>
            <Star size={11} style={{ fill: '#f59e0b', color: '#f59e0b' }} />
            Favorites
          </div>
          {suggestions.favorites.map(item => {
            const node = renderRow(item, 'favorites', flatIndex)
            flatIndex++
            return node
          })}
        </div>
      )
    }

    if (hasRecents) {
      sections.push(
        <div key="recents-section">
          <div style={sectionHeaderStyle}>
            <Clock size={11} style={{ color: 'var(--so-text-tertiary)' }} />
            Recent
          </div>
          {suggestions.recents.map(item => {
            const node = renderRow(item, 'recents', flatIndex)
            flatIndex++
            return node
          })}
        </div>
      )
    }

    if (hasResults) {
      sections.push(
        <div key="results-section">
          <div style={sectionHeaderStyle}>
            Results
          </div>
          {suggestions.results.map(item => {
            const node = renderRow(item, 'results', flatIndex)
            flatIndex++
            return node
          })}
        </div>
      )
    }

    return <>{sections}</>
  }

  // ── Styles ────────────────────────────────────────────────────────

  const sectionHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '8px 10px 4px',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: 'var(--so-text-tertiary)',
  }

  const hasValue = value != null && resolvedLabel !== ''

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', display: 'block' }}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger */}
      <div
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-required={required}
        tabIndex={disabled ? -1 : 0}
        onClick={openDropdown}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          height: '36px',
          padding: '0 10px',
          borderRadius: '6px',
          border: `1px solid ${isOpen ? 'var(--so-accent)' : 'var(--so-border)'}`,
          background: disabled ? 'var(--so-bg)' : 'var(--so-surface)',
          color: hasValue ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)',
          fontSize: '13px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          userSelect: 'none',
          outline: 'none',
          transition: 'border-color 0.15s',
          boxShadow: isOpen ? '0 0 0 2px var(--so-accent-light)' : undefined,
          opacity: disabled ? 0.6 : 1,
          minWidth: 0,
        }}
      >
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {hasValue ? resolvedLabel : placeholder}
        </span>

        {allowClear && hasValue && !disabled && (
          <button
            type="button"
            onMouseDown={clearValue}
            tabIndex={-1}
            aria-label="Clear selection"
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '18px',
              height: '18px',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              borderRadius: '3px',
              color: 'var(--so-text-tertiary)',
            }}
          >
            <X size={13} />
          </button>
        )}

        <ChevronDown
          size={14}
          style={{
            flexShrink: 0,
            color: 'var(--so-text-tertiary)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
          }}
        />
      </div>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 50,
            background: 'var(--so-surface)',
            border: '1px solid var(--so-border)',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
            overflow: 'hidden',
          }}
        >
          {/* Search input */}
          <div
            style={{
              padding: '8px',
              borderBottom: '1px solid var(--so-border-light)',
            }}
          >
            <input
              ref={searchInputRef}
              type="text"
              value={searchText}
              onChange={e => {
                setSearchText(e.target.value)
                setHighlightedIndex(-1)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search…"
              style={{
                width: '100%',
                height: '30px',
                padding: '0 8px',
                fontSize: '13px',
                border: '1px solid var(--so-border)',
                borderRadius: '6px',
                background: 'var(--so-bg)',
                color: 'var(--so-text-primary)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Rows */}
          <div
            style={{
              maxHeight: '280px',
              overflowY: 'auto',
              padding: '4px',
            }}
          >
            {renderDropdownBody()}
          </div>
        </div>
      )}
    </div>
  )
}

export default SearchableCombobox
