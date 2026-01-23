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

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      toggleDateLock(date)
    },
    [date, toggleDateLock]
  )

  return (
    <div
      onContextMenu={handleContextMenu}
      className={`
        px-2 py-1 text-xs font-bold text-center border-b border-r
        select-none cursor-context-menu
        ${isLocked ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white text-slate-700 border-slate-200'}
      `}
      title={isLocked ? `${date} — LOCKED (right-click to unlock)` : `${date} (right-click to lock)`}
    >
      <div>{dayLabel}</div>
      <div className="text-[10px] font-normal text-slate-500">{date.slice(5)}</div>
      {isLocked && <div className="text-[9px] text-red-500 font-semibold mt-0.5">LOCKED</div>}
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
            ? 'bg-amber-50 text-amber-800 border-amber-200'
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
  return (
    <>
      <RowLabel truckId={truckId} isInbound={isInbound} />
      {dates.map((date) => {
        const cellId: CellId = `${truckId}|${date}`
        return <ManifestCell key={cellId} cellId={cellId} isInbound={isInbound} />
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
