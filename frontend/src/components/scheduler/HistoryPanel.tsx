import { memo, useState, type ReactNode } from 'react'
import { useGlobalHistory } from '@/api/scheduling'
import type { HistoryRecord } from '@/types/api'

const HISTORY_TYPE_CONFIG: Record<string, { label: string; bg: string; text: string; icon: ReactNode }> = {
  '+': {
    label: 'Added',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5">
        <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
      </svg>
    ),
  },
  '~': {
    label: 'Changed',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5">
        <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.025-.273Z" clipRule="evenodd" />
      </svg>
    ),
  },
  '-': {
    label: 'Removed',
    bg: 'bg-red-50',
    text: 'text-red-700',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5">
        <path d="M3.75 7.25a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Z" />
      </svg>
    ),
  },
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) {
    return 'Today'
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday'
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface HistoryItemProps {
  record: HistoryRecord
}

// Format field names for display
function formatFieldName(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace('Scheduled Date', 'Date')
    .replace('Scheduled Truck', 'Truck')
    .replace('Delivery Run', 'Run')
}

const HistoryItem = memo(function HistoryItem({ record }: HistoryItemProps) {
  const config = HISTORY_TYPE_CONFIG[record.history_type] || {
    label: record.history_type,
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    icon: null,
  }

  return (
    <div className="px-3 py-2 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${config.bg} ${config.text}`}>
          {config.icon}
          {config.label}
        </span>
        <span className="text-[11px] font-mono font-semibold text-slate-700">
          {record.order_type}-{record.number}
        </span>
      </div>
      <div className="mt-1 text-[10px] text-slate-500 truncate font-medium">
        {record.party_name}
      </div>
      {/* Show changes with old → new values */}
      {record.changes && record.changes.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {record.changes.map((change) => (
            <div key={change.field} className="text-[10px] flex items-center gap-1.5 text-slate-600">
              <span className="font-medium text-slate-500">{formatFieldName(change.field)}:</span>
              <span className="line-through text-red-400">{change.old}</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-slate-400 shrink-0">
                <path fillRule="evenodd" d="M2 8a.75.75 0 0 1 .75-.75h8.69L8.22 4.03a.75.75 0 0 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 0 1-1.06-1.06l3.22-3.22H2.75A.75.75 0 0 1 2 8Z" clipRule="evenodd" />
              </svg>
              <span className="font-semibold text-emerald-600">{change.new}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-1.5 text-[9px] text-slate-400">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
          <path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 0 0 0-1.5h-2.5v-3.5Z" clipRule="evenodd" />
        </svg>
        <span>{formatTime(record.history_date)}</span>
        {record.history_user && (
          <>
            <span className="text-slate-300">&middot;</span>
            <span className="font-medium">{record.history_user}</span>
          </>
        )}
      </div>
    </div>
  )
})

export const HistoryPanel = memo(function HistoryPanel() {
  const [isExpanded, setIsExpanded] = useState(false)
  const { data: history, isLoading, isError } = useGlobalHistory(50)

  // Group history by date
  const groupedHistory = (history ?? []).reduce((acc, record) => {
    const dateKey = formatDate(record.history_date)
    if (!acc[dateKey]) {
      acc[dateKey] = []
    }
    acc[dateKey].push(record)
    return acc
  }, {} as Record<string, HistoryRecord[]>)

  const dateKeys = Object.keys(groupedHistory)

  // When collapsed, show a small tab; when expanded, show full panel
  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="
          fixed right-0 top-1/2 -translate-y-1/2 z-40
          w-8 h-24 flex flex-col items-center justify-center gap-1.5
          bg-gradient-to-b from-slate-700 to-slate-800 text-white rounded-l-xl
          hover:from-slate-600 hover:to-slate-700 transition-all
          shadow-lg border-l border-t border-b border-slate-600
        "
        title="Show Audit Trail"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-amber-400">
          <path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 0 0 0-1.5h-2.5v-3.5Z" clipRule="evenodd" />
        </svg>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 opacity-70">
          <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
        </svg>
      </button>
    )
  }

  return (
    <div className="fixed right-0 top-1/2 -translate-y-1/2 z-40 w-72">
      {/* Panel Content */}
      <div className="h-[480px] bg-white border-l border-t border-b border-slate-200 rounded-l-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header with integrated collapse button */}
        <div className="px-3 py-2.5 bg-gradient-to-r from-slate-800 to-slate-700 text-white flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            title="Collapse panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </button>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-amber-400">
            <path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 0 0 0-1.5h-2.5v-3.5Z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-semibold tracking-wide">Audit Trail</span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-amber-500" />
              <span className="text-xs">Loading history...</span>
            </div>
          )}
          {isError && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-red-500">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-6 h-6">
                <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
              </svg>
              <span className="text-xs">Error loading history</span>
            </div>
          )}
          {!isLoading && !isError && dateKeys.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-8 h-8 opacity-40">
                <path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 0 0 0-1.5h-2.5v-3.5Z" clipRule="evenodd" />
              </svg>
              <span className="text-xs">No recent activity</span>
            </div>
          )}
          {!isLoading && !isError && dateKeys.map((dateKey) => (
            <div key={dateKey}>
              <div className="sticky top-0 px-3 py-1.5 bg-slate-100 border-y border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {dateKey}
              </div>
              {groupedHistory[dateKey].map((record) => (
                <HistoryItem key={record.id} record={record} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})
