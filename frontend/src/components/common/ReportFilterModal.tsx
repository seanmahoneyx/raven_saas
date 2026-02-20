import { useState } from 'react'
import { Calendar, Printer, Download } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

export interface ReportColumn {
  key: string
  header: string
  defaultVisible?: boolean
}

export interface ReportRowFilter {
  key: string
  label: string
  options: { value: string; label: string }[]
}

export interface ReportFilterConfig {
  /** Report title shown in the modal header */
  title: string
  /** Available columns for visibility toggles */
  columns: ReportColumn[]
  /** Available row-level filters (status, type, rep, etc.) */
  rowFilters?: ReportRowFilter[]
  /** Whether to show date range picker (default true) */
  showDateRange?: boolean
}

export interface ReportFilterResult {
  dateFrom: string
  dateTo: string
  visibleColumns: string[]
  rowFilters: Record<string, string>
  /** Formatted date range string for sub-headers */
  dateRangeLabel: string
}

interface ReportFilterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: ReportFilterConfig
  /** 'print' shows Print button, 'export' shows Export CSV button */
  mode: 'print' | 'export'
  /** Called with filter results when user confirms */
  onConfirm: (filters: ReportFilterResult) => void
}

const btnClass = 'inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md text-[13px] font-medium transition-all cursor-pointer'

function formatDateLabel(from: string, to: string): string {
  const fmtDate = (d: string) => {
    const date = new Date(d + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }
  if (from && to) return `${fmtDate(from)} \u2013 ${fmtDate(to)}`
  if (from) return `From ${fmtDate(from)}`
  if (to) return `Through ${fmtDate(to)}`
  return `January 1, ${new Date().getFullYear()} \u2013 ${fmtDate(new Date().toISOString().slice(0, 10))}`
}

export function ReportFilterModal({ open, onOpenChange, config, mode, onConfirm }: ReportFilterModalProps) {
  const year = new Date().getFullYear()
  const [dateFrom, setDateFrom] = useState(`${year}-01-01`)
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10))

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    config.columns.forEach(col => {
      init[col.key] = col.defaultVisible !== false
    })
    return init
  })

  const [rowFilters, setRowFilters] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    config.rowFilters?.forEach(f => { init[f.key] = 'all' })
    return init
  })

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleAll = (checked: boolean) => {
    setVisibleColumns(prev => {
      const next: Record<string, boolean> = {}
      Object.keys(prev).forEach(k => { next[k] = checked })
      return next
    })
  }

  const allChecked = Object.values(visibleColumns).every(Boolean)
  const someChecked = Object.values(visibleColumns).some(Boolean) && !allChecked

  const handleConfirm = () => {
    const selectedCols = Object.entries(visibleColumns)
      .filter(([, v]) => v)
      .map(([k]) => k)

    onConfirm({
      dateFrom,
      dateTo,
      visibleColumns: selectedCols,
      rowFilters: { ...rowFilters },
      dateRangeLabel: formatDateLabel(dateFrom, dateTo),
    })
    onOpenChange(false)
  }

  const showDateRange = config.showDateRange !== false

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--so-text-primary)' }}>
            {mode === 'print' ? 'Print' : 'Export'} {config.title}
          </DialogTitle>
          <DialogDescription style={{ color: 'var(--so-text-tertiary)' }}>
            {mode === 'print'
              ? 'Configure filters and columns before printing.'
              : 'Configure filters and columns before exporting.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Date Range */}
          {showDateRange && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                <Calendar className="h-3.5 w-3.5" style={{ color: 'var(--so-text-tertiary)' }} />
                Date Range
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs" style={{ color: 'var(--so-text-secondary)' }}>From</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" style={{ color: 'var(--so-text-secondary)' }}>To</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Row Filters */}
          {config.rowFilters && config.rowFilters.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                Filters
              </div>
              <div className="grid grid-cols-2 gap-3">
                {config.rowFilters.map(filter => (
                  <div key={filter.key} className="space-y-1.5">
                    <Label className="text-xs" style={{ color: 'var(--so-text-secondary)' }}>{filter.label}</Label>
                    <select
                      value={rowFilters[filter.key] || 'all'}
                      onChange={(e) => setRowFilters(prev => ({ ...prev, [filter.key]: e.target.value }))}
                      className="flex h-9 w-full rounded-md border px-3 py-1 text-sm"
                      style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-primary)' }}
                    >
                      <option value="all">All</option>
                      {filter.options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Column Visibility */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                Columns
              </span>
              <button
                onClick={() => toggleAll(!allChecked)}
                className="text-xs font-medium cursor-pointer"
                style={{ color: 'var(--so-accent)', background: 'none', border: 'none' }}
              >
                {allChecked ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {config.columns.map(col => (
                <label
                  key={col.key}
                  className="flex items-center gap-2 rounded-md px-2.5 py-1.5 cursor-pointer transition-colors hover:opacity-80"
                  style={{ background: visibleColumns[col.key] ? 'var(--so-border-light)' : 'transparent' }}
                >
                  <Checkbox
                    checked={visibleColumns[col.key]}
                    onCheckedChange={() => toggleColumn(col.key)}
                  />
                  <span className="text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>
                    {col.header}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <button
            className={btnClass}
            style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            className={btnClass + ' text-white'}
            style={{ background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }}
            onClick={handleConfirm}
            disabled={!Object.values(visibleColumns).some(Boolean)}
          >
            {mode === 'print'
              ? <><Printer className="h-3.5 w-3.5" /> Print</>
              : <><Download className="h-3.5 w-3.5" /> Export CSV</>
            }
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
