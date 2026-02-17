import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowUpDown, ArrowUp, ArrowDown, Download, FileText } from 'lucide-react'

export interface ReportColumn {
  key: string
  header: string
  align?: 'left' | 'right' | 'center'
  format?: 'currency' | 'number' | 'percent'
  summable?: boolean
}

interface ReportViewerProps {
  title: string
  columns: ReportColumn[]
  rows: Record<string, any>[]
  isLoading?: boolean
  onExportCsv?: () => void
}

function formatValue(value: any, format?: string): string {
  if (value == null || value === '') return '-'
  if (format === 'currency') {
    const num = typeof value === 'string' ? parseFloat(value) : value
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num)
  }
  if (format === 'percent') return `${value}%`
  if (format === 'number') {
    const num = typeof value === 'string' ? parseFloat(value) : value
    return new Intl.NumberFormat('en-US').format(num)
  }
  return String(value)
}

export default function ReportViewer({ title, columns, rows, isLoading, onExportCsv }: ReportViewerProps) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filter, setFilter] = useState('')

  const filteredRows = useMemo(() => {
    if (!filter) return rows
    const lc = filter.toLowerCase()
    return rows.filter(row =>
      columns.some(col => String(row[col.key] ?? '').toLowerCase().includes(lc))
    )
  }, [rows, filter, columns])

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows
    return [...filteredRows].sort((a, b) => {
      const aVal = a[sortKey] ?? ''
      const bVal = b[sortKey] ?? ''
      const aNum = parseFloat(aVal)
      const bNum = parseFloat(bVal)
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDir === 'asc' ? aNum - bNum : bNum - aNum
      }
      const cmp = String(aVal).localeCompare(String(bVal))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filteredRows, sortKey, sortDir])

  // Summary row
  const summaryRow = useMemo(() => {
    const sums: Record<string, number> = {}
    for (const col of columns) {
      if (col.summable) {
        sums[col.key] = filteredRows.reduce((acc, row) => {
          const val = parseFloat(row[col.key]) || 0
          return acc + val
        }, 0)
      }
    }
    return sums
  }, [filteredRows, columns])

  const hasSummary = columns.some(c => c.summable)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Loading report...</p></CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {title}
            <span className="text-sm font-normal text-muted-foreground ml-2">
              ({filteredRows.length} row{filteredRows.length !== 1 ? 's' : ''})
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Filter..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-48 h-8"
            />
            {onExportCsv && (
              <Button variant="outline" size="sm" className="gap-1" onClick={onExportCsv}>
                <Download className="h-4 w-4" /> CSV
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md overflow-auto max-h-[600px]">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={`px-3 py-2 font-medium cursor-pointer hover:bg-muted select-none whitespace-nowrap ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                    }`}
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {sortKey === col.key ? (
                        sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">
                    No data for this report
                  </td>
                </tr>
              ) : (
                sortedRows.map((row, i) => (
                  <tr key={i} className="border-t hover:bg-muted/30">
                    {columns.map(col => (
                      <td
                        key={col.key}
                        className={`px-3 py-2 ${
                          col.align === 'right' ? 'text-right font-mono' :
                          col.align === 'center' ? 'text-center' : ''
                        }`}
                      >
                        {formatValue(row[col.key], col.format)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            {hasSummary && sortedRows.length > 0 && (
              <tfoot className="bg-muted/50 border-t-2 border-foreground/20 sticky bottom-0">
                <tr className="font-bold">
                  {columns.map((col, i) => (
                    <td
                      key={col.key}
                      className={`px-3 py-2 ${
                        col.align === 'right' ? 'text-right font-mono' :
                        col.align === 'center' ? 'text-center' : ''
                      }`}
                    >
                      {i === 0 ? 'TOTAL' : col.summable ? formatValue(summaryRow[col.key], col.format) : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
