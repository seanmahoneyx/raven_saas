import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Settings2 } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { Checkbox } from './checkbox'

const STORAGE_PREFIX = 'raven-table-'

export type ColumnVisibilityState = Record<string, boolean>

export interface TableColumnVisibility {
  visibility: ColumnVisibilityState
  setVisibility: React.Dispatch<React.SetStateAction<ColumnVisibilityState>>
  toggle: (id: string, value: boolean) => void
  reset: () => void
}

export function useTableColumnVisibility(storageKey: string): TableColumnVisibility {
  const [visibility, setVisibility] = useState<ColumnVisibilityState>(() => {
    try {
      const stored = localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`)
      if (stored) return JSON.parse(stored)
    } catch { /* ignore */ }
    return {}
  })

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, JSON.stringify(visibility))
    } catch { /* ignore */ }
  }, [visibility, storageKey])

  const toggle = useCallback((id: string, value: boolean) => {
    setVisibility(prev => ({ ...prev, [id]: value }))
  }, [])

  const reset = useCallback(() => {
    setVisibility({})
    try { localStorage.removeItem(`${STORAGE_PREFIX}${storageKey}`) } catch { /* ignore */ }
  }, [storageKey])

  return { visibility, setVisibility, toggle, reset }
}

interface PickerColumn {
  id: string
  header: string
}

function getPickerColumns<TData>(columns: ColumnDef<TData, any>[]): PickerColumn[] {
  return columns
    .map(col => {
      const id = (col as any).accessorKey ?? col.id ?? ''
      return { col, id: String(id) }
    })
    .filter(({ col, id }) => {
      if (!id) return false
      if (id === 'select' || id === 'actions') return false
      if (col.enableHiding === false) return false
      return true
    })
    .map(({ col, id }) => ({
      id,
      header: typeof col.header === 'string' ? col.header : id,
    }))
}

interface TableColumnPickerProps<TData> {
  columns: ColumnDef<TData, any>[]
  visibility: ColumnVisibilityState
  onToggle: (id: string, value: boolean) => void
  onReset?: () => void
  className?: string
}

export function TableColumnPicker<TData>({
  columns,
  visibility,
  onToggle,
  onReset,
  className,
}: TableColumnPickerProps<TData>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pickerColumns = useMemo(() => getPickerColumns(columns), [columns])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer"
        style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }}
      >
        <Settings2 className="h-3.5 w-3.5" />
        Columns
      </button>
      {open && (
        <div
          className="absolute right-0 z-50 mt-1 w-56 rounded-md border shadow-lg overflow-hidden"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
        >
          <div
            className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--so-text-tertiary)', borderBottom: '1px solid var(--so-border-light)' }}
          >
            Toggle Columns
          </div>
          <div className="py-1 max-h-72 overflow-y-auto">
            {pickerColumns.map(col => {
              const isVisible = visibility[col.id] !== false
              return (
                <label
                  key={col.id}
                  className="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors hover:opacity-80 text-[13px]"
                  style={{ color: 'var(--so-text-secondary)' }}
                >
                  <Checkbox
                    checked={isVisible}
                    onCheckedChange={value => onToggle(col.id, !!value)}
                  />
                  <span>{col.header}</span>
                </label>
              )
            })}
          </div>
          {onReset && (
            <div className="px-3 py-2" style={{ borderTop: '1px solid var(--so-border-light)' }}>
              <button
                type="button"
                className="text-[12px] font-medium cursor-pointer"
                style={{ color: 'var(--so-accent)', background: 'none', border: 'none' }}
                onClick={() => { onReset(); setOpen(false) }}
              >
                Reset to Default
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
