import { memo, useMemo, useCallback } from 'react'
import {
  useSchedulerStore,
  selectIsDateLocked,
  type CellId,
} from './useSchedulerStore'
import { ManifestCell } from './ManifestCell'

// ─── Constants ───────────────────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Date Header ─────────────────────────────────────────────────────────────

interface DateHeaderProps {
  date: string
  dayLabel: string
}

const DateHeader = memo(function DateHeader({ date, dayLabel }: DateHeaderProps) {
  const isLocked = useSchedulerStore(selectIsDateLocked(date))
  const toggleDateLock = useSchedulerStore((s) => s.toggleDateLock)

  const handleToggle = useCallback(() => {
    toggleDateLock(date)
  }, [date, toggleDateLock])

  return (
    <div
      className={`
        relative px-2 py-1 text-xs font-bold text-center border-b border-r select-none
        ${isLocked ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white text-slate-700 border-slate-200'}
      `}
    >
      <div>{dayLabel}</div>
      <div className="text-[10px] font-normal text-slate-500">{date.slice(5)}</div>
      <button
        type="button"
        onClick={handleToggle}
        className={`
          absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center rounded
          transition-colors
          ${isLocked
            ? 'bg-red-200 text-red-700 hover:bg-red-300'
            : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
          }
        `}
        title={isLocked ? 'Unlock day' : 'Lock day'}
      >
        {isLocked ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5">
            <path fillRule="evenodd" d="M14.5 1A4.5 4.5 0 0 0 10 5.5V9H3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1.5V5.5a3 3 0 1 1 6 0v3a.75.75 0 0 0 1.5 0v-3A4.5 4.5 0 0 0 14.5 1Z" clipRule="evenodd" />
          </svg>
        )}
      </button>
    </div>
  )
})

// ─── Row Label ───────────────────────────────────────────────────────────────

interface RowLabelProps {
  truckId: string
  isInbound: boolean
}

const RowLabel = memo(function RowLabel({ truckId, isInbound }: RowLabelProps) {
  return (
    <div
      className={`
        w-24 min-w-[96px] flex items-start justify-center
        px-1 py-2 text-[11px] font-bold border-r border-b
        ${isInbound
          ? 'bg-slate-700 text-white border-slate-600'
          : truckId === 'unassigned'
            ? 'bg-teal-100 text-teal-800 border-teal-200'
            : 'bg-white text-slate-700 border-slate-200'
        }
      `}
    >
      <span className="truncate">
        {isInbound ? 'INBOUND' : truckId === 'unassigned' ? 'UNSCHEDULED' : truckId}
      </span>
    </div>
  )
})

// ─── Grid Row ────────────────────────────────────────────────────────────────

interface GridRowProps {
  truckId: string
  isInbound: boolean
  dates: string[]
}

const GridRow = memo(function GridRow({ truckId, isInbound, dates }: GridRowProps) {
  const isUnassigned = truckId === 'unassigned'
  return (
    <>
      <RowLabel truckId={truckId} isInbound={isInbound} />
      {dates.map((date) => {
        const cellId: CellId = `${truckId}|${date}`
        return <ManifestCell key={cellId} cellId={cellId} isInbound={isInbound} isUnassigned={isUnassigned} />
      })}
    </>
  )
})

// ─── WeekGroup ───────────────────────────────────────────────────────────────

interface WeekGroupProps {
  dates: string[]
  weekLabel: string
  isCurrentWeek: boolean
}

export const WeekGroup = memo(function WeekGroup({ dates, weekLabel, isCurrentWeek }: WeekGroupProps) {
  const trucks = useSchedulerStore((s) => s.trucks)

  const dayLabels = useMemo(() => {
    return dates.map((d) => {
      const day = new Date(d + 'T12:00:00Z')
      return WEEKDAYS[day.getUTCDay()]
    })
  }, [dates])

  const rows = useMemo(() => {
    const result: { truckId: string; isInbound: boolean }[] = []
    result.push({ truckId: 'inbound', isInbound: true })
    result.push({ truckId: 'unassigned', isInbound: false })
    for (const t of trucks) {
      result.push({ truckId: t, isInbound: false })
    }
    return result
  }, [trucks])

  return (
    <div className="mb-4">
      {/* Week Band Label */}
      <div className={`
        px-3 py-1.5 text-xs font-bold uppercase tracking-wider border-b
        ${isCurrentWeek
          ? 'bg-blue-600 text-white border-blue-700'
          : 'bg-slate-700 text-slate-200 border-slate-600'
        }
      `}>
        {weekLabel}
      </div>

      {/* Grid */}
      <div
        className="grid"
        style={{ gridTemplateColumns: `96px repeat(${dates.length}, minmax(160px, 1fr))` }}
      >
        {/* Corner Cell */}
        <div className="bg-slate-800 border-b border-r border-slate-600" />

        {/* Date Headers */}
        {dates.map((date, idx) => (
          <DateHeader key={date} date={date} dayLabel={dayLabels[idx]} />
        ))}

        {/* Rows */}
        {rows.map((row) => (
          <GridRow key={row.truckId} truckId={row.truckId} isInbound={row.isInbound} dates={dates} />
        ))}
      </div>
    </div>
  )
})
