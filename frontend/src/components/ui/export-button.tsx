import { Download } from 'lucide-react'
import { Button } from './button'

interface ExportButtonProps {
  data: Record<string, unknown>[]
  filename: string
  columns?: { key: string; header: string }[]
  variant?: 'outline' | 'ghost' | 'default'
  size?: 'sm' | 'default'
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
  filename,
  columns,
  variant = 'outline',
  size = 'sm',
}: ExportButtonProps) {
  const handleExport = () => {
    if (data.length === 0) return

    const cols = columns ?? Object.keys(data[0]).map((key) => ({ key, header: key }))

    const header = cols.map((c) => escapeCSVValue(c.header)).join(',')
    const rows = data.map((row) =>
      cols.map((c) => escapeCSVValue(row[c.key])).join(',')
    )
    const csv = [header, ...rows].join('\r\n')

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
    <Button variant={variant} size={size} onClick={handleExport}>
      <Download className="h-4 w-4 mr-2" />
      Export CSV
    </Button>
  )
}
