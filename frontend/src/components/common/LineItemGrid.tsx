import { Plus, Trash2 } from 'lucide-react'
import type React from 'react'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchableCombobox } from '@/components/common/SearchableCombobox'
import type { EntityType } from '@/types/api'

// ── Public API ───────────────────────────────────────────────────────

export interface LineItemColumn<T> {
  /** Field key on the row, or a synthetic id for computed/readonly cells. */
  key: string
  header: string
  /** A CSS grid track sizing, e.g. '2fr' | '110px' | 'minmax(0,1fr)'. */
  width: string
  type: 'item' | 'text' | 'numeric' | 'select' | 'readonly' | 'computed'
  align?: 'left' | 'right' | 'center'
  /** For type 'item' (e.g. 'item'). */
  entityType?: string
  /** For type 'item' — label shown before the combobox resolves its own data. */
  initialLabel?: (row: T) => string | undefined
  /** For type 'select'. */
  options?: (row: T) => { value: string; label: string }[]
  /** For type 'readonly' | 'computed'. */
  render?: (row: T, index: number) => React.ReactNode
  placeholder?: string
}

export interface LineItemGridProps<T> {
  lines: T[]
  columns: LineItemColumn<T>[]
  onCellChange: (index: number, key: string, value: string | number | null) => void
  onAddLine: () => void
  onRemoveLine: (index: number) => void
  /** Text for the explicit add-line button. Default '+ Add Line'. */
  addLabel?: string
  /** Optional totals row content rendered under the grid. */
  footer?: React.ReactNode
}

// ── Component ────────────────────────────────────────────────────────

const ACTIONS_WIDTH = '44px'

export function LineItemGrid<T>({
  lines,
  columns,
  onCellChange,
  onAddLine,
  onRemoveLine,
  addLabel = '+ Add Line',
  footer,
}: LineItemGridProps<T>) {
  // Header, every data row, and the footer share this exact template so columns
  // line up perfectly. Trailing fixed track hosts the per-row delete button.
  const gridTemplateColumns = `${columns.map((c) => c.width).join(' ')} ${ACTIONS_WIDTH}`

  const cellJustify = (align?: 'left' | 'right' | 'center') =>
    align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start'

  const textAlign = (align?: 'left' | 'right' | 'center') => align ?? 'left'

  const renderCell = (col: LineItemColumn<T>, row: T, index: number) => {
    const raw = (row as Record<string, unknown>)[col.key]

    switch (col.type) {
      case 'item':
        return (
          <SearchableCombobox
            entityType={(col.entityType ?? 'item') as EntityType}
            value={raw ? Number(raw) : null}
            onChange={(id) => onCellChange(index, col.key, id)}
            initialLabel={col.initialLabel?.(row)}
            placeholder={col.placeholder}
            className="w-full"
            allowClear
          />
        )
      case 'text':
        return (
          <Input
            value={(raw as string) ?? ''}
            onChange={(e) => onCellChange(index, col.key, e.target.value)}
            placeholder={col.placeholder}
            className="h-9"
            style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
          />
        )
      case 'numeric':
        return (
          <NumericInput
            value={(raw as string) ?? ''}
            onValueChange={(v) => onCellChange(index, col.key, v)}
            className="h-9 text-right"
            style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
          />
        )
      case 'select':
        return (
          <Select
            value={raw ? String(raw) : ''}
            onValueChange={(v) => onCellChange(index, col.key, v)}
          >
            <SelectTrigger
              className="h-9"
              style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
            >
              <SelectValue placeholder={col.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {(col.options?.(row) ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      case 'readonly': {
        const content = col.render?.(row, index)
        return (
          <span
            className="block w-full truncate text-[13px]"
            style={{ color: 'var(--so-text-secondary)', textAlign: textAlign(col.align) }}
            title={typeof content === 'string' ? content : undefined}
          >
            {content}
          </span>
        )
      }
      case 'computed': {
        const content = col.render?.(row, index)
        return (
          <span
            className="block w-full truncate font-mono text-[13px]"
            style={{ color: 'var(--so-text-primary)', textAlign: textAlign(col.align) }}
            title={typeof content === 'string' ? content : undefined}
          >
            {content}
          </span>
        )
      }
      default:
        return null
    }
  }

  return (
    <div>
      {/* Header row */}
      <div
        className="grid items-center"
        style={{ gridTemplateColumns, columnGap: '8px' }}
      >
        {columns.map((col) => (
          <div
            key={col.key}
            className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide"
            style={{
              color: 'var(--so-text-tertiary)',
              textAlign: textAlign(col.align),
            }}
          >
            {col.header}
          </div>
        ))}
        {/* Actions column header (empty) */}
        <div />
      </div>

      {/* Data rows */}
      {lines.map((row, index) => (
        <div
          key={index}
          className="grid items-center"
          style={{
            gridTemplateColumns,
            columnGap: '8px',
            borderBottom: '1px solid var(--so-border-light)',
          }}
        >
          {columns.map((col) => (
            <div
              key={col.key}
              className="px-1.5 py-1.5"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: cellJustify(col.align),
                minWidth: 0,
              }}
            >
              {renderCell(col, row, index)}
            </div>
          ))}
          {/* Actions cell — delete button, present on every row */}
          <div className="px-1.5 py-1.5 flex items-center justify-center">
            <button
              type="button"
              onClick={() => onRemoveLine(index)}
              aria-label="Remove line"
              className="flex items-center justify-center h-7 w-7 rounded-md transition-colors hover:bg-red-50 hover:text-red-600"
              style={{ color: 'var(--so-text-tertiary)', background: 'transparent' }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}

      {/* Explicit Add Line button — directly under the last data row. */}
      <button
        type="button"
        onClick={onAddLine}
        className="mt-2 inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-[13px] font-medium transition-colors"
        style={{
          border: '1px dashed var(--so-border)',
          background: 'transparent',
          color: 'var(--so-text-secondary)',
        }}
      >
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </button>

      {/* Optional footer/totals row — shares the same template so it aligns. */}
      {footer != null && (
        <div
          className="grid items-center mt-3 pt-3"
          style={{
            gridTemplateColumns,
            columnGap: '8px',
            borderTop: '1px solid var(--so-border-light)',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  )
}

export default LineItemGrid
