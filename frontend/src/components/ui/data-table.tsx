import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type RowSelectionState,
  type VisibilityState,
} from '@tanstack/react-table'
import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, X, Settings2 } from 'lucide-react'
import { Button } from './button'
import { Checkbox } from './checkbox'
import { Input } from './input'
import { cn } from '@/lib/utils'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchColumn?: string
  searchPlaceholder?: string
  showSearchDropdown?: boolean
  searchDropdownLabel?: (row: TData) => string
  searchDropdownSublabel?: (row: TData) => string
  onRowClick?: (row: TData) => void
  onRowDoubleClick?: (row: TData) => void
  enableSelection?: boolean
  onBulkAction?: (action: string, selectedRows: TData[]) => void
  bulkActions?: { key: string; label: string; icon?: React.ReactNode; variant?: 'default' | 'destructive' }[]
  /** Storage key for persisting column visibility to localStorage. Enables column picker when set. */
  storageKey?: string
  /** Override initial column visibility (keys = column accessorKey/id, values = boolean). Only used on first load when no localStorage entry exists. */
  defaultColumnVisibility?: Record<string, boolean>
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchColumn,
  searchPlaceholder = 'Search...',
  showSearchDropdown,
  searchDropdownLabel,
  searchDropdownSublabel,
  onRowClick,
  onRowDoubleClick,
  enableSelection = false,
  onBulkAction,
  bulkActions,
  storageKey,
  defaultColumnVisibility,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    if (storageKey) {
      try {
        const stored = localStorage.getItem(`raven-table-${storageKey}`)
        if (stored) return JSON.parse(stored)
      } catch { /* ignore */ }
    }
    return defaultColumnVisibility ?? {}
  })
  const [columnPickerOpen, setColumnPickerOpen] = useState(false)
  const columnPickerRef = useRef<HTMLDivElement>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setDropdownOpen(false)
    }
  }, [])

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [handleClickOutside])

  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(`raven-table-${storageKey}`, JSON.stringify(columnVisibility))
    }
  }, [columnVisibility, storageKey])

  useEffect(() => {
    const handlePickerClickOutside = (e: MouseEvent) => {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
        setColumnPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePickerClickOutside)
    return () => document.removeEventListener('mousedown', handlePickerClickOutside)
  }, [])

  const allColumns = useMemo(() => {
    if (!enableSelection) return columns
    const selectColumn: ColumnDef<TData, any> = {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="translate-y-[2px]"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          className="translate-y-[2px]"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    }
    return [selectColumn, ...columns]
  }, [columns, enableSelection])

  const table = useReactTable({
    data,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      rowSelection,
      columnVisibility,
    },
    enableRowSelection: enableSelection,
  })

  const searchValue = searchColumn
    ? (table.getColumn(searchColumn)?.getFilterValue() as string) ?? ''
    : ''

  const dropdownItems = showSearchDropdown && searchDropdownLabel
    ? table.getFilteredRowModel().rows.slice(0, 20)
    : []

  const selectedCount = Object.keys(rowSelection).length

  return (
    <div className="space-y-4">
      {(searchColumn || storageKey) && (
        <div className="flex items-center justify-between gap-4 pl-6 pr-6">
          {/* Search */}
          {searchColumn ? (
            <div ref={containerRef} className="relative max-w-sm flex-1">
              <div className="relative">
                <Input
                  ref={inputRef}
                  placeholder={searchPlaceholder}
                  value={searchValue}
                  onChange={(event) => {
                    table.getColumn(searchColumn)?.setFilterValue(event.target.value)
                    if (showSearchDropdown) {
                      setDropdownOpen(true)
                      setHighlightIndex(-1)
                    }
                  }}
                  onFocus={() => {
                    if (showSearchDropdown) setDropdownOpen(true)
                  }}
                  onKeyDown={(e) => {
                    if (!showSearchDropdown || !dropdownOpen) return
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setHighlightIndex((prev) => Math.min(prev + 1, dropdownItems.length - 1))
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setHighlightIndex((prev) => Math.max(prev - 1, 0))
                    } else if (e.key === 'Enter' && highlightIndex >= 0) {
                      e.preventDefault()
                      const item = dropdownItems[highlightIndex]
                      if (item) {
                        onRowClick?.(item.original)
                        setDropdownOpen(false)
                        table.getColumn(searchColumn)?.setFilterValue('')
                      }
                    } else if (e.key === 'Escape') {
                      setDropdownOpen(false)
                    }
                  }}
                  className="pr-8"
                />
                {searchValue && (
                  <button
                    onClick={() => {
                      table.getColumn(searchColumn)?.setFilterValue('')
                      setDropdownOpen(false)
                      inputRef.current?.focus()
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {showSearchDropdown && dropdownOpen && dropdownItems.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-64 overflow-y-auto">
                  {dropdownItems.map((row, idx) => (
                    <button
                      key={row.id}
                      className={cn(
                        'w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                        idx === highlightIndex && 'bg-accent'
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        onRowClick?.(row.original)
                        setDropdownOpen(false)
                        table.getColumn(searchColumn)?.setFilterValue('')
                      }}
                      onMouseEnter={() => setHighlightIndex(idx)}
                    >
                      <div className="font-medium text-foreground">
                        {searchDropdownLabel(row.original)}
                      </div>
                      {searchDropdownSublabel && (
                        <div className="text-xs text-muted-foreground">
                          {searchDropdownSublabel(row.original)}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {showSearchDropdown && dropdownOpen && searchValue && dropdownItems.length === 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                    No matches found
                  </div>
                </div>
              )}
            </div>
          ) : <div />}

          {/* Column Picker */}
          {storageKey && (
            <div ref={columnPickerRef} className="relative">
              <button
                onClick={() => setColumnPickerOpen(prev => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer"
                style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }}
              >
                <Settings2 className="h-3.5 w-3.5" />
                Columns
              </button>
              {columnPickerOpen && (
                <div
                  className="absolute right-0 z-50 mt-1 w-56 rounded-md border shadow-lg overflow-hidden"
                  style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
                >
                  <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--so-text-tertiary)', borderBottom: '1px solid var(--so-border-light)' }}>
                    Toggle Columns
                  </div>
                  <div className="py-1 max-h-72 overflow-y-auto">
                    {table.getAllColumns()
                      .filter(col => col.getCanHide() && col.id !== 'select' && col.id !== 'actions')
                      .map(col => {
                        const header = typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id
                        return (
                          <label
                            key={col.id}
                            className="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors hover:opacity-80 text-[13px]"
                            style={{ color: 'var(--so-text-secondary)' }}
                          >
                            <Checkbox
                              checked={col.getIsVisible()}
                              onCheckedChange={(value) => col.toggleVisibility(!!value)}
                            />
                            {header}
                          </label>
                        )
                      })
                    }
                  </div>
                  <div className="px-3 py-2" style={{ borderTop: '1px solid var(--so-border-light)' }}>
                    <button
                      className="text-[12px] font-medium cursor-pointer"
                      style={{ color: 'var(--so-accent)', background: 'none', border: 'none' }}
                      onClick={() => {
                        table.getAllColumns().forEach(col => {
                          if (col.getCanHide()) col.toggleVisibility(true)
                        })
                      }}
                    >
                      Reset to Default
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-md border border-border">
        <table className="w-full">
          <thead className="bg-muted/50 dark:bg-muted/20">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-sm font-medium text-foreground"
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        className={cn(
                          'flex items-center gap-1',
                          header.column.getCanSort() && 'cursor-pointer select-none'
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <span className="text-muted-foreground">
                            {{
                              asc: <ChevronUp className="h-4 w-4" />,
                              desc: <ChevronDown className="h-4 w-4" />,
                            }[header.column.getIsSorted() as string] ?? (
                              <ChevronsUpDown className="h-4 w-4" />
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border">
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'bg-card hover:bg-muted/50 dark:hover:bg-muted/30 transition-colors',
                    (onRowClick || onRowDoubleClick) && 'cursor-pointer',
                    row.getIsSelected() && 'bg-primary/5 dark:bg-primary/10'
                  )}
                  onClick={() => onRowClick?.(row.original)}
                  onDoubleClick={() => onRowDoubleClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-sm text-foreground">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={allColumns.length}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No results.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {enableSelection && selectedCount > 0 && (
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
          <span className="text-sm font-medium text-foreground">
            {selectedCount} row(s) selected
          </span>
          <div className="flex items-center gap-2">
            {bulkActions?.map((action) => (
              <Button
                key={action.key}
                variant={action.variant || 'outline'}
                size="sm"
                onClick={() => {
                  const selectedRows = table.getFilteredSelectedRowModel().rows.map(r => r.original)
                  onBulkAction?.(action.key, selectedRows)
                }}
              >
                {action.icon}
                {action.label}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => table.toggleAllRowsSelected(false)}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pl-6 pr-6">
        <div className="text-sm text-muted-foreground">
          {enableSelection && selectedCount > 0
            ? `${selectedCount} of ${table.getFilteredRowModel().rows.length} row(s) selected`
            : `${table.getFilteredRowModel().rows.length} row(s)`
          }
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of{' '}
            {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
