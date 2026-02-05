import { memo, useMemo, useCallback } from 'react'
import {
  useSchedulerStore,
  selectIsDateLocked,
  selectTruckName,
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
  const selectLockedMemo = useMemo(() => selectIsDateLocked(date), [date])
  const isLocked = useSchedulerStore(selectLockedMemo)
  const toggleDateLock = useSchedulerStore((s) => s.toggleDateLock)

  // Check if today
  const isToday = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    return date === today
  }, [date])

  const handleToggle = useCallback(() => {
    toggleDateLock(date)
  }, [date, toggleDateLock])

  return (
    <div
      className={`
        relative px-2 py-2 text-center border-b border-r select-none transition-colors
        ${isLocked
          ? 'bg-red-50 border-red-200'
          : isToday
            ? 'bg-amber-50 border-slate-200'
            : 'bg-slate-50 border-slate-200'
        }
      `}
    >
      <div className={`text-[11px] font-semibold uppercase tracking-wide ${isLocked ? 'text-red-600' : isToday ? 'text-amber-700' : 'text-slate-500'}`}>
        {dayLabel}
      </div>
      <div className={`text-xs font-medium ${isLocked ? 'text-red-700' : isToday ? 'text-amber-800' : 'text-slate-700'}`}>
        {date.slice(5).replace('-', '/')}
      </div>
      {isToday && !isLocked && (
        <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-500" />
      )}
      <button
        type="button"
        onClick={handleToggle}
        className={`
          absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-md
          transition-all duration-150
          ${isLocked
            ? 'bg-red-200/80 text-red-700 hover:bg-red-300'
            : 'text-slate-300 hover:text-slate-500 hover:bg-slate-200/50'
          }
        `}
        title={isLocked ? 'Unlock day' : 'Lock day'}
      >
        {isLocked ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
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
  const selectTruckMemo = useMemo(() => selectTruckName(truckId), [truckId])
  const truckName = useSchedulerStore(selectTruckMemo)

  const isUnassigned = truckId === 'unassigned'
  const isPickup = truckId === 'pickup'

  return (
    <div
      className={`
        w-32 min-w-[128px] flex items-center gap-2
        px-2.5 py-2.5 text-[11px] font-semibold border-r border-b
        ${isInbound
          ? 'bg-gradient-to-r from-rose-200 to-rose-100 text-rose-900 border-rose-300'
          : isPickup
            ? 'bg-gradient-to-r from-purple-100 to-purple-50 text-purple-700 border-purple-200'
            : isUnassigned
              ? 'bg-gradient-to-r from-cyan-100 to-cyan-50 text-cyan-700 border-cyan-200'
              : 'bg-white text-slate-600 border-slate-200'
        }
      `}
    >
      {/* Icon */}
      {isInbound ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0 opacity-60">
          <path fillRule="evenodd" d="M8 14a.75.75 0 0 1-.75-.75V4.56L4.03 7.78a.75.75 0 0 1-1.06-1.06l4.5-4.5a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06L8.75 4.56v8.69A.75.75 0 0 1 8 14Z" clipRule="evenodd" />
        </svg>
      ) : isPickup ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0 opacity-60">
          <path d="M8 1a.75.75 0 0 1 .75.75v6.44l2.72-2.72a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 0 1 1.06-1.06l2.72 2.72V1.75A.75.75 0 0 1 8 1ZM2.75 12a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5H2.75Z" />
        </svg>
      ) : isUnassigned ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0 opacity-60">
          <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v.401a2.986 2.986 0 0 0-1.5-.401h-9c-.546 0-1.059.146-1.5.401V3.5ZM3.5 5A1.5 1.5 0 0 0 2 6.5v.401A2.986 2.986 0 0 1 3.5 6.5h9c.546 0 1.059.146 1.5.401V6.5A1.5 1.5 0 0 0 12.5 5h-9ZM2 9.5A1.5 1.5 0 0 1 3.5 8h9a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-3Z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0 text-slate-400">
          <path d="M4 3.5A1.5 1.5 0 0 1 5.5 2h5A1.5 1.5 0 0 1 12 3.5V5h.25A2.75 2.75 0 0 1 15 7.75v4.5A2.75 2.75 0 0 1 12.25 15h-8.5A2.75 2.75 0 0 1 1 12.25v-4.5A2.75 2.75 0 0 1 3.75 5H4V3.5Zm1.5 0V5h5V3.5a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 0-.5.5Z" />
        </svg>
      )}
      <span className="truncate uppercase tracking-wide">
        {isInbound ? 'Inbound' : isPickup ? 'Pick Up' : isUnassigned ? 'Unscheduled' : truckName}
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
  const isPickup = truckId === 'pickup'
  return (
    <>
      <RowLabel truckId={truckId} isInbound={isInbound} />
      {dates.map((date) => {
        const cellId: CellId = `${truckId}|${date}`
        return <ManifestCell key={cellId} cellId={cellId} isInbound={isInbound} isUnassigned={isUnassigned} isPickup={isPickup} />
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
    // Order: Inbound (top) → Unscheduled → Truck rows → Pick Up (bottom)
    result.push({ truckId: 'inbound', isInbound: true })
    result.push({ truckId: 'unassigned', isInbound: false })
    for (const t of trucks) {
      result.push({ truckId: t, isInbound: false })
    }
    result.push({ truckId: 'pickup', isInbound: false })
    return result
  }, [trucks])

  return (
    <div className="mb-8 border-b-[6px] border-slate-900 pb-6">
      {/* Week Band Label */}
      <div className={`
        flex items-center gap-2 px-4 py-2 rounded-t-lg
        ${isCurrentWeek
          ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-white shadow-sm'
          : 'bg-gradient-to-r from-slate-700 to-slate-600 text-slate-100 shadow-sm'
        }
      `}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 opacity-70">
          <path fillRule="evenodd" d="M4 1.75a.75.75 0 0 1 1.5 0V3h5V1.75a.75.75 0 0 1 1.5 0V3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2V1.75ZM4.5 6a1 1 0 0 0-1 1v4.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-7Z" clipRule="evenodd" />
        </svg>
        <span className="text-xs font-semibold uppercase tracking-wider">{weekLabel}</span>
        {isCurrentWeek && (
          <span className="ml-auto text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-medium">
            Current
          </span>
        )}
      </div>

      {/* Grid */}
      <div
        className="grid bg-white rounded-b-lg shadow-sm overflow-hidden border border-t-0 border-slate-200"
        style={{ gridTemplateColumns: `128px repeat(${dates.length}, minmax(160px, 1fr))` }}
      >
        {/* Corner Cell */}
        <div className="bg-slate-800 border-b border-r border-slate-700 flex items-center justify-center">
          <span className="text-[9px] text-slate-400 uppercase tracking-widest font-medium">Lane</span>
        </div>

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
