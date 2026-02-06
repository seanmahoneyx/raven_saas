import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/hooks/useDebounce'
import apiClient from '@/api/client'
import { Search, Package, Users, FileText, ShoppingCart, Loader2 } from 'lucide-react'

interface SearchResult {
  category: string
  id: number
  title: string
  subtitle: string
  url: string
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'Items': Package,
  'Customers': Users,
  'Sales Orders': ShoppingCart,
  'Invoices': FileText,
}

export default function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const debouncedQuery = useDebounce(query, 300)

  // Fetch results when debounced query changes
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    apiClient
      .get('/search/', { params: { q: debouncedQuery } })
      .then((res) => {
        setResults(res.data.results || [])
        setSelectedIndex(0)
      })
      .catch(() => {
        setResults([])
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [debouncedQuery])

  // Show loading immediately when typing
  useEffect(() => {
    if (query && query.length >= 2 && query !== debouncedQuery) {
      setIsLoading(true)
    }
  }, [query, debouncedQuery])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setSelectedIndex(0)
    }
  }, [open])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault()
        navigate(results[selectedIndex].url)
        onOpenChange(false)
      }
    },
    [results, selectedIndex, navigate, onOpenChange]
  )

  // Group results by category
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, result) => {
    if (!acc[result.category]) acc[result.category] = []
    acc[result.category].push(result)
    return acc
  }, {})

  // Flat index mapping for keyboard nav
  let flatIndex = 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            placeholder="Search items, customers, orders, invoices..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-11"
            autoFocus
          />
          {isLoading && <Loader2 className="h-4 w-4 animate-spin opacity-50" />}
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto p-2">
          {query.length >= 2 && !isLoading && results.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">
              No results found for "{query}"
            </p>
          )}

          {query.length > 0 && query.length < 2 && (
            <p className="text-center text-sm text-muted-foreground py-6">
              Type at least 2 characters to search
            </p>
          )}

          {Object.entries(grouped).map(([category, items]) => {
            const Icon = CATEGORY_ICONS[category] || Package
            return (
              <div key={category} className="mb-2">
                <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <Icon className="h-3.5 w-3.5" />
                  {category}
                </div>
                {items.map((result) => {
                  const currentIndex = flatIndex++
                  const isSelected = currentIndex === selectedIndex
                  return (
                    <button
                      key={`${result.category}-${result.id}`}
                      className={`w-full flex items-center gap-3 rounded-md px-2 py-2 text-sm cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-accent/50'
                      }`}
                      onClick={() => {
                        navigate(result.url)
                        onOpenChange(false)
                      }}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                    >
                      <div className="flex-1 text-left">
                        <div className="font-medium">{result.title}</div>
                        {result.subtitle && (
                          <div className="text-xs text-muted-foreground">{result.subtitle}</div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
          <span>Use arrow keys to navigate</span>
          <span>
            <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">Enter</kbd> to select
            <span className="mx-1.5">·</span>
            <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">Esc</kbd> to close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
