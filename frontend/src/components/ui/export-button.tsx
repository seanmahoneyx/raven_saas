import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from './button'
import { downloadCsv } from '@/lib/csv'

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
    downloadCsv(rows, cols, filename)
  }

  return (
    <Button variant={variant} size={iconOnly ? 'icon' : size} onClick={handleExport} disabled={exporting} title="Export CSV">
      <Download className="h-4 w-4" />
      {!iconOnly && <span className="ml-2">{exporting ? 'Exporting…' : 'Export CSV'}</span>}
    </Button>
  )
}
