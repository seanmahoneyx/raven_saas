import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Clock, User, ArrowRight } from 'lucide-react'

interface FieldChange {
  field: string
  field_name: string
  old_value: string | null
  new_value: string | null
}

interface HistoryRecord {
  id: number
  timestamp: string
  user: string
  action: string
  changes: FieldChange[]
}

function useFieldHistory(modelType: string, objectId: number) {
  return useQuery<HistoryRecord[]>({
    queryKey: ['field-history', modelType, objectId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/history/${modelType}/${objectId}/`)
      return data
    },
    enabled: objectId > 0,
  })
}

interface FieldHistoryTabProps {
  modelType: string
  objectId: number
}

export function FieldHistoryTab({ modelType, objectId }: FieldHistoryTabProps) {
  const { data: history, isLoading } = useFieldHistory(modelType, objectId)

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded" />
        ))}
      </div>
    )
  }

  if (!history || history.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No change history found.
      </div>
    )
  }

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  const truncate = (val: string | null, max = 60) => {
    if (!val) return '-'
    return val.length > max ? val.substring(0, max) + '...' : val
  }

  return (
    <div className="space-y-4">
      {history.map((record) => (
        <div
          key={record.id}
          className="border border-border rounded-lg p-4 bg-card"
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-3">
            <Badge
              variant="outline"
              className={
                record.action === 'Created'
                  ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
                  : record.action === 'Deleted'
                    ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                    : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
              }
            >
              {record.action}
            </Badge>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              <span>{record.user}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground ml-auto">
              <Clock className="h-3.5 w-3.5" />
              <span>{formatTimestamp(record.timestamp)}</span>
            </div>
          </div>

          {/* Changes */}
          {record.changes.length > 0 ? (
            <div className="space-y-1.5">
              {record.changes.map((change, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-sm py-1 px-2 rounded bg-muted/50"
                >
                  <span className="font-medium text-foreground min-w-[140px]">
                    {change.field}
                  </span>
                  <span className="text-red-500 dark:text-red-400 font-mono text-xs">
                    {truncate(change.old_value)}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-green-600 dark:text-green-400 font-mono text-xs">
                    {truncate(change.new_value)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Record created</p>
          )}
        </div>
      ))}
    </div>
  )
}
