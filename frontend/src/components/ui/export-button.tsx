import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from './button'

interface ExportButtonProps {
  /** Rows to export. Optional when `fetchData` is provided. */
  data?: Record<string, unknown>[]
  /** Fetch rows lazily when the button is clicked. Use for server-paginated lists so
   *  the export contains ALL matching rows rather than only the ones already loaded. */
  fetchData?: () => Promise<Record<string, unknown>[]>
  filename: string
  columns?: { key: string; header: string }[]
  variant?: 'outline' | 'ghost' | 'default'
  size?: 'sm' | 'default'
  iconOnly?: boolean
}

function escapeCSVValue(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

export function ExportButton({
  data,
  fetchData,
  filename,
  columns,
  variant = 'outline',
  size = 'sm',
  iconOnly = false,
}: ExportButtonProps) {
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    let rows = data ?? []
    if (fetchData) {
      try {
        setExporting(true)
        rows = await fetchData()
      } finally {
        setExporting(false)
      }
    }
    if (rows.length === 0) return

    const cols = columns ?? Object.keys(rows[0]).map((key) => ({ key, header: key }))

    const header = cols.map((c) => escapeCSVValue(c.header)).join(',')
    const body = rows.map((row) =>
      cols.map((c) => escapeCSVValue(row[c.key])).join(',')
    )
    const csv = [header, ...body].join('\r\n')

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${filename}.csv`
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <Button variant={variant} size={iconOnly ? 'icon' : size} onClick={handleExport} disabled={exporting} title="Export CSV">
      <Download className="h-4 w-4" />
      {!iconOnly && <span className="ml-2">{exporting ? 'Exporting…' : 'Export CSV'}</span>}
    </Button>
  )
}
