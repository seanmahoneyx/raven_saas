import { useEffect, useState } from 'react'
import { downloadCsv, type CsvColumn } from '@/lib/csv'
import type { ReportFilterResult } from '@/components/common/ReportFilterModal'

export interface UseReportExportOptions<T> {
  /**
   * Returns the full row set to export. A getter (rather than a value) so the
   * hook can be called at the top of a component before the rows — typically a
   * `useMemo` defined lower down — exist, keeping the Rules of Hooks satisfied.
   */
  getRows: () => T[]
  /** All exportable columns; the visible subset is chosen per export. */
  columns: CsvColumn[]
  /** Download filename (without extension), or a factory for dynamic names. */
  filename: string | (() => string)
  /**
   * Optional row-level filtering applied before export (status/type/date,
   * etc.). Mirrors whatever the page applies to its on-screen print view.
   */
  applyFilters?: (rows: T[], filters: ReportFilterResult) => T[]
}

export interface UseReportExportResult {
  printFilterOpen: boolean
  setPrintFilterOpen: (open: boolean) => void
  exportFilterOpen: boolean
  setExportFilterOpen: (open: boolean) => void
  printFilters: ReportFilterResult | null
  isPrintMode: boolean
  handleFilteredPrint: (filters: ReportFilterResult) => void
  handleFilteredExport: (filters: ReportFilterResult) => void
}

/**
 * Consolidates the print/export boilerplate shared by the report list pages:
 * the print-mode state, the `window.print()` effect, and the CSV export
 * (column selection + download). Per-page row filtering is supplied via
 * `applyFilters`; the print view still reads `printFilters` directly.
 */
export function useReportExport<T>(options: UseReportExportOptions<T>): UseReportExportResult {
  const [printFilterOpen, setPrintFilterOpen] = useState(false)
  const [exportFilterOpen, setExportFilterOpen] = useState(false)
  const [printFilters, setPrintFilters] = useState<ReportFilterResult | null>(null)
  const [isPrintMode, setIsPrintMode] = useState(false)

  useEffect(() => {
    if (isPrintMode) {
      requestAnimationFrame(() => {
        window.print()
        setIsPrintMode(false)
      })
    }
  }, [isPrintMode])

  const handleFilteredPrint = (filters: ReportFilterResult) => {
    setPrintFilters(filters)
    setIsPrintMode(true)
  }

  const handleFilteredExport = (filters: ReportFilterResult) => {
    let rows = options.getRows()
    if (options.applyFilters) {
      rows = options.applyFilters(rows, filters)
    }
    if (rows.length === 0) return

    const cols = options.columns.filter((c) => filters.visibleColumns.includes(c.key))
    const filename = typeof options.filename === 'function' ? options.filename() : options.filename
    downloadCsv(rows as unknown as Record<string, unknown>[], cols, filename)
  }

  return {
    printFilterOpen,
    setPrintFilterOpen,
    exportFilterOpen,
    setExportFilterOpen,
    printFilters,
    isPrintMode,
    handleFilteredPrint,
    handleFilteredExport,
  }
}
