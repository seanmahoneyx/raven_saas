/**
 * Shared CSV export helpers.
 *
 * Single source of truth for the escaping + download logic that was previously
 * copy-pasted into ExportButton and ~12 list pages. Output is intentionally
 * byte-for-byte identical to the old inline implementations: UTF-8 BOM,
 * CRLF row separators, and RFC-4180 quoting.
 */

export interface CsvColumn {
  key: string
  header: string
}

/** Quote a CSV cell only when it contains a delimiter, quote, or newline. */
export function escapeCSVValue(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

/** Build a CSV string (header row + data rows) from columns and row objects. */
export function buildCsv(rows: Record<string, unknown>[], columns: CsvColumn[]): string {
  const header = columns.map((c) => escapeCSVValue(c.header)).join(',')
  const body = rows.map((row) => columns.map((c) => escapeCSVValue(row[c.key])).join(','))
  return [header, ...body].join('\r\n')
}

/**
 * Build a CSV and trigger a browser download.
 *
 * @param filename Base name; a `.csv` extension is appended if not present.
 */
export function downloadCsv(
  rows: Record<string, unknown>[],
  columns: CsvColumn[],
  filename: string,
): void {
  const csv = buildCsv(rows, columns)
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
