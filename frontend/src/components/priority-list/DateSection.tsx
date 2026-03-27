import { memo, useState, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { BoxTypeBin } from './BoxTypeBin'
import { OverridePopover } from './OverridePopover'
import { KicksIndicator } from './KicksIndicator'
import { usePriorityListStore, parseBinId } from './usePriorityListStore'
import { BOX_TYPE_ORDER } from './constants'
import { parseLocalDate } from '@/lib/dates'
import type { BoxType } from '@/types/api'

interface DateSectionProps {
  vendorId: number
  date: string
  boxTypeFilter?: BoxType | null
  selectedLineId: string | null
  onSelectLine: (lineId: string) => void
}

/**
 * A date section showing priority lines directly under a date header.
 * When filtered to a single box type, renders a flat integrated layout.
 */
export const DateSection = memo(function DateSection({
  vendorId,
  date,
  boxTypeFilter,
  selectedLineId,
  onSelectLine,
}: DateSectionProps) {
  const bins = usePriorityListStore((s) => s.bins)

  const [overridePopover, setOverridePopover] = useState<{
    vendorId: number
    boxType: BoxType
    date: string
  } | null>(null)

  // Get bins for this vendor/date, sorted by box type
  // Optionally filtered to a single box type
  const binIds = useMemo(() => {
    return Object.keys(bins)
      .filter((binId) => {
        const parsed = parseBinId(binId)
        if (!parsed || parsed.vendorId !== vendorId || parsed.date !== date) return false
        if (boxTypeFilter && parsed.boxType !== boxTypeFilter) return false
        return true
      })
      .sort((a, b) => {
        const parsedA = parseBinId(a)
        const parsedB = parseBinId(b)
        const orderA = parsedA ? (BOX_TYPE_ORDER[parsedA.boxType] ?? 99) : 99
        const orderB = parsedB ? (BOX_TYPE_ORDER[parsedB.boxType] ?? 99) : 99
        return orderA - orderB
      })
  }, [bins, vendorId, date, boxTypeFilter])

  // Format date for display
  const formatDate = (dateStr: string) => {
    return parseLocalDate(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  // Calculate totals for this date (only for filtered bins)
  const totals = binIds.reduce(
    (acc, binId) => {
      const bin = bins[binId]
      if (bin) {
        acc.lines += bin.lines.length
        acc.scheduled += bin.scheduled_qty
        acc.allotment += bin.allotment
      }
      return acc
    },
    { lines: 0, scheduled: 0, allotment: 0 }
  )

  // Check if this is today
  const today = new Date().toISOString().split('T')[0]
  const isToday = date === today
  const isPast = date < today

  // Droppable for empty day slots
  const { setNodeRef, isOver } = useDroppable({
    id: `empty-day-${vendorId}-${date}`,
    data: { vendorId, date, isEmpty: true },
  })

  // Hide date row entirely if filtering and no lines for this date
  if (boxTypeFilter && totals.lines === 0 && binIds.length === 0) {
    return null
  }

  // Whether we're in single-type filtered mode (flat layout)
  const isFlatMode = !!boxTypeFilter

  return (
    <div className={`${isPast ? 'bg-muted/50' : ''}`}>
      {/* Date header with kicks indicator inline */}
      <div className={`flex items-center justify-between px-4 py-2.5 border-b border-border ${isToday ? 'bg-yellow-50' : 'bg-muted/60'}`}>
        <div className="flex items-center gap-4">
          <span className={`font-medium min-w-[100px] ${isToday ? 'text-yellow-700' : 'text-foreground'}`}>
            {formatDate(date)}
            {isToday && <span className="ml-2 text-xs bg-yellow-200 px-1.5 py-0.5 rounded">Today</span>}
          </span>

          {totals.lines > 0 ? (
            <span className="text-sm text-muted-foreground">
              {totals.lines} {totals.lines === 1 ? 'line' : 'lines'}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground italic">No orders scheduled</span>
          )}
        </div>

        {/* Kicks indicator inline in date header when in flat mode */}
        {isFlatMode && totals.lines > 0 && binIds.length === 1 && (() => {
          const bin = bins[binIds[0]]
          const parsed = parseBinId(binIds[0])
          if (!bin || !parsed) return null
          return (
            <KicksIndicator
              scheduled={bin.scheduled_qty}
              allotment={bin.allotment}
              isOverride={bin.is_override}
              onEditOverride={(e) => {
                e?.stopPropagation?.()
                setOverridePopover({ vendorId, boxType: parsed.boxType, date })
              }}
            />
          )
        })()}
      </div>

      {/* Lines area */}
      {binIds.length === 0 ? (
        // Empty drop zone for days with no orders
        <div className="px-4 pb-2">
          <div
            ref={setNodeRef}
            className={`
              border-2 border-dashed rounded-lg py-4 text-center text-sm
              ${isOver ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-border text-muted-foreground'}
            `}
          >
            {isOver ? 'Drop here to schedule' : 'Drag orders here'}
          </div>
        </div>
      ) : isFlatMode ? (
        // Flat mode: lines render directly under date header, no wrapper card
        binIds.map((binId) => {
          const bin = bins[binId]
          if (!bin) return null
          const parsed = parseBinId(binId)
          if (!parsed) return null

          return (
            <BoxTypeBin
              key={binId}
              vendorId={vendorId}
              date={date}
              bin={bin}
              flat
              onEditOverride={() =>
                setOverridePopover({ vendorId, boxType: parsed.boxType, date })
              }
              selectedLineId={selectedLineId}
              onSelectLine={onSelectLine}
            />
          )
        })
      ) : (
        // Multi-type mode: each bin gets its own card
        <div className="px-4 pb-2 space-y-1">
          {binIds.map((binId) => {
            const bin = bins[binId]
            if (!bin) return null
            const parsed = parseBinId(binId)
            if (!parsed) return null

            return (
              <BoxTypeBin
                key={binId}
                vendorId={vendorId}
                date={date}
                bin={bin}
                onEditOverride={() =>
                  setOverridePopover({ vendorId, boxType: parsed.boxType, date })
                }
                selectedLineId={selectedLineId}
                onSelectLine={onSelectLine}
              />
            )
          })}
        </div>
      )}

      {/* Override popover */}
      {overridePopover && (
        <OverridePopover
          vendorId={overridePopover.vendorId}
          boxType={overridePopover.boxType}
          date={overridePopover.date}
          onClose={() => setOverridePopover(null)}
        />
      )}
    </div>
  )
})
