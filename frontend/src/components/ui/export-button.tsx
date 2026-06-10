import { Download } from 'lucide-react'
import { Button } from './button'
import { downloadCsv } from '@/lib/csv'

interface ExportButtonProps {
  data: Record<string, unknown>[]
  filename: string
  columns?: { key: string; header: string }[]
  variant?: 'outline' | 'ghost' | 'default'
  size?: 'sm' | 'default'
  iconOnly?: boolean
}

export function ExportButton({
  data,
  filename,
  columns,
  variant = 'outline',
  size = 'sm',
  iconOnly = false,
}: ExportButtonProps) {
  const handleExport = () => {
    if (data.length === 0) return

    const cols = columns ?? Object.keys(data[0]).map((key) => ({ key, header: key }))
    downloadCsv(data, cols, filename)
  }

  return (
    <Button variant={variant} size={iconOnly ? 'icon' : size} onClick={handleExport} title="Export CSV">
      <Download className="h-4 w-4" />
      {!iconOnly && <span className="ml-2">Export CSV</span>}
    </Button>
  )
}
