import { useMemo, useEffect, useRef } from 'react'
import {
  format,
  startOfWeek,
  addDays,
  addWeeks,
  isToday,
} from 'date-fns'
import type { CalendarOrder, TruckCalendar, Truck, DeliveryRun, OrderStatus, SchedulerNote, NoteColor } from '@/types/api'
import CalendarCell from './CalendarCell'
import { cn } from '@/lib/utils'
import { Truck as TruckIcon, Package } from 'lucide-react'

interface CalendarGridProps {
  trucks: Truck[]
  calendarData: TruckCalendar[]
  deliveryRuns?: DeliveryRun[]
  schedulerNotes?: SchedulerNote[]
  anchorDate: Date
  weeksToShow?: number
  onOrderClick?: (order: CalendarOrder) => void
  onStatusChange?: (order: CalendarOrder, newStatus: OrderStatus) => void
  onNoteUpdate?: (noteId: number, updates: { content?: string; color?: NoteColor; isPinned?: boolean }) => void
  onNoteDelete?: (noteId: number) => void
  onAddNote?: (target: { type: 'cell'; date: string; truckId: number | null } | { type: 'order'; order: CalendarOrder } | { type: 'run'; run: DeliveryRun }, position: { x: number; y: number }) => void
  /** Callback when clicking the yellow note indicator to view notes */
  onViewNotes?: (target: { type: 'order'; order: CalendarOrder } | { type: 'run'; run: DeliveryRun }) => void
  onDissolveRun?: (run: DeliveryRun) => void
  draggingOrderType?: 'PO' | 'SO' | null
  /** Whether a drag is currently active */
  isDragActive?: boolean
  /** ID of the cell currently being hovered during drag (for drop zone visibility) */
  hoveredCellId?: string | null
  /** Lookup of all orders by ID */
  allOrdersLookup?: Record<string, CalendarOrder>
  /** Set of expanded container IDs */
  expandedContainers?: Set<number>
  /** Toggle container expand/collapse */
  onToggleExpanded?: (runId: number) => void
}

export default function CalendarGrid({
  trucks,
  calendarData,
  deliveryRuns = [],
  schedulerNotes = [],
  anchorDate,
  weeksToShow = 8,
  onOrderClick,
  onStatusChange,
  onNoteUpdate,
  onNoteDelete,
  onAddNote,
  onViewNotes,
  onDissolveRun,
  draggingOrderType,
  isDragActive,
  hoveredCellId,
  allOrdersLookup = {},
  expandedContainers = new Set(),
  onToggleExpanded,
}: CalendarGridProps) {
  const currentWeekRef = useRef<HTMLDivElement>(null)

  // Calculate weeks: anchor is at week 3 (0-indexed: week 2), so we show 2 weeks before
  const weeks = useMemo(() => {
    const startWeek = startOfWeek(anchorDate, { weekStartsOn: 1 }) // Monday
    const adjustedStart = addWeeks(startWeek, -2) // 2 weeks before anchor

    const result: Date[][] = []
    for (let w = 0; w < weeksToShow; w++) {
      const weekStart = addWeeks(adjustedStart, w)
      const weekDays: Date[] = []
      // Only Mon-Fri (5 days)
      for (let d = 0; d < 5; d++) {
        weekDays.push(addDays(weekStart, d))
      }
      result.push(weekDays)
    }
    return result
  }, [anchorDate, weeksToShow])

  // Scroll to current week on mount
  useEffect(() => {
    if (currentWeekRef.current) {
      currentWeekRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])

  // Build a lookup for orders by truck and date
  const orderLookup = useMemo(() => {
    const lookup: Record<string, CalendarOrder[]> = {}
    calendarData.forEach((truckData) => {
      const truckKey = truckData.truck_id ?? 'inbound'
      truckData.days.forEach((day) => {
        const key = `${truckKey}-${day.date}`
        lookup[key] = day.orders
      })
    })
    return lookup
  }, [calendarData])

  const getOrdersForCell = (truckId: number | null, date: Date): CalendarOrder[] => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const key = `${truckId ?? 'inbound'}-${dateStr}`
    return orderLookup[key] || []
  }

  // Build a lookup for notes by date and truck (cell-attached notes only)
  const noteLookup = useMemo(() => {
    const lookup: Record<string, SchedulerNote[]> = {}
    schedulerNotes.forEach((note) => {
      // Only include notes attached to a date cell (not order/run attached)
      if (note.scheduled_date && !note.sales_order_id && !note.purchase_order_id && !note.delivery_run_id) {
        const key = `${note.truck_id ?? 'all'}-${note.scheduled_date}`
        if (!lookup[key]) {
          lookup[key] = []
        }
        lookup[key].push(note)
      }
    })
    return lookup
  }, [schedulerNotes])

  const getNotesForCell = (truckId: number | null, date: Date): SchedulerNote[] => {
    const dateStr = format(date, 'yyyy-MM-dd')
    // Get notes specifically for this truck + date
    const truckKey = `${truckId ?? 'all'}-${dateStr}`
    const truckNotes = noteLookup[truckKey] || []
    // Also get notes attached to just the date (no truck - shown on all trucks)
    const dateKey = `all-${dateStr}`
    const dateNotes = truckId !== null ? (noteLookup[dateKey] || []) : []
    return [...truckNotes, ...dateNotes]
  }

  // All notes passed down for order/run note count lookups
  // These are notes attached to orders or runs (not cells)
  const allNotesForLookup = schedulerNotes

  // Determine which week is the "current" week (index 2, the anchor week)
  const currentWeekIdx = 2

  return (
    <div className="p-4 space-y-6 overflow-y-auto h-full bg-gray-100">
      {weeks.map((weekDays, weekIdx) => (
        <div
          key={weekIdx}
          ref={weekIdx === currentWeekIdx ? currentWeekRef : undefined}
          className="bg-white border border-gray-200 shadow-sm overflow-x-auto"
        >
          {/* Week Header Row */}
          <div
            className="grid border-b border-gray-200 bg-gray-50 text-xs text-gray-500 font-medium"
            style={{ gridTemplateColumns: '140px repeat(5, minmax(0, 1fr))', minWidth: '800px' }}
          >
            <div className="px-2 py-1 border-r border-gray-200 flex items-center justify-center sticky left-0 bg-gray-50 z-10">
              <span className="text-[10px] uppercase tracking-wider text-gray-400">
                Week of {format(weekDays[0], 'MMM d')}
              </span>
            </div>
            {weekDays.map((day) => (
              <div
                key={day.toISOString()}
                className={cn(
                  'px-1 py-0.5 border-r border-gray-200 text-center flex flex-col justify-center',
                  isToday(day) && 'bg-blue-50 text-blue-600 font-bold'
                )}
              >
                <span className="uppercase text-[10px]">{format(day, 'EEE')}</span>
                <span className="text-xs font-medium">{format(day, 'd')}</span>
              </div>
            ))}
          </div>

          {/* Inbound/Receiving Row for POs - First */}
          <div
            className={cn(
              'grid border-b border-gray-200 transition-colors',
              draggingOrderType === 'PO' && 'bg-green-100/50 ring-2 ring-inset ring-green-400'
            )}
            style={{ gridTemplateColumns: '140px repeat(5, minmax(0, 1fr))', minWidth: '800px' }}
          >
            <div className={cn(
              'sticky left-0 z-10 border-r border-green-100 px-2 py-1 text-xs font-bold flex items-center gap-1',
              draggingOrderType === 'PO' ? 'bg-green-100' : 'bg-white'
            )}>
              <Package className="h-3.5 w-3.5 text-green-500 shrink-0" />
              <span className="text-green-700 uppercase tracking-wide text-[10px] truncate">
                Inbound
              </span>
            </div>
            {weekDays.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd')
              return (
                <CalendarCell
                  key={`inbound-${weekIdx}-${day.toISOString()}`}
                  date={dateStr}
                  truckId={null}
                  orders={getOrdersForCell(null, day)}
                  notes={getNotesForCell(null, day)}
                  allNotes={allNotesForLookup}
                  isToday={isToday(day)}
                  onOrderClick={onOrderClick}
                  onStatusChange={onStatusChange}
                  onNoteUpdate={onNoteUpdate}
                  onNoteDelete={onNoteDelete}
                  onAddNote={(pos) => onAddNote?.({ type: 'cell', date: dateStr, truckId: null }, pos)}
                  onAddNoteToOrder={(order, pos) => onAddNote?.({ type: 'order', order }, pos)}
                  onAddNoteToRun={(run, pos) => onAddNote?.({ type: 'run', run }, pos)}
                  onViewNotes={onViewNotes}
                  variant="inbound"
                  isValidDropTarget={draggingOrderType === 'PO'}
                  isDragActive={isDragActive}
                  hoveredCellId={hoveredCellId}
                  allOrdersLookup={allOrdersLookup}
                  expandedContainers={expandedContainers}
                  onToggleExpanded={onToggleExpanded}
                />
              )
            })}
          </div>

          {/* Truck Rows for SOs */}
          {trucks.map((truck) => (
            <div
              key={truck.id}
              className={cn(
                'grid border-b border-gray-100 group transition-colors',
                draggingOrderType === 'SO' && 'bg-blue-50/50 ring-2 ring-inset ring-blue-400'
              )}
              style={{ gridTemplateColumns: '140px repeat(5, minmax(0, 1fr))', minWidth: '800px' }}
            >
              <div className={cn(
                'sticky left-0 z-10 border-r border-gray-200 px-2 py-1 text-xs font-bold text-gray-700 flex items-center gap-1 group-hover:bg-gray-50',
                draggingOrderType === 'SO' ? 'bg-blue-50' : 'bg-white'
              )}>
                <TruckIcon className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span className="truncate text-xs">{truck.name}</span>
                {truck.capacity_pallets && (
                  <span className="text-[9px] text-gray-400 font-normal shrink-0">
                    ({truck.capacity_pallets})
                  </span>
                )}
              </div>
              {weekDays.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd')
                return (
                  <CalendarCell
                    key={`${truck.id}-${weekIdx}-${day.toISOString()}`}
                    date={dateStr}
                    truckId={truck.id}
                    orders={getOrdersForCell(truck.id, day)}
                    notes={getNotesForCell(truck.id, day)}
                    allNotes={allNotesForLookup}
                    deliveryRuns={deliveryRuns}
                    isToday={isToday(day)}
                    onOrderClick={onOrderClick}
                    onStatusChange={onStatusChange}
                    onNoteUpdate={onNoteUpdate}
                    onNoteDelete={onNoteDelete}
                    onAddNote={(pos) => onAddNote?.({ type: 'cell', date: dateStr, truckId: truck.id }, pos)}
                    onAddNoteToOrder={(order, pos) => onAddNote?.({ type: 'order', order }, pos)}
                    onAddNoteToRun={(run, pos) => onAddNote?.({ type: 'run', run }, pos)}
                    onViewNotes={onViewNotes}
                    onDissolveRun={onDissolveRun}
                    isValidDropTarget={draggingOrderType === 'SO'}
                    isDragActive={isDragActive}
                    hoveredCellId={hoveredCellId}
                    allOrdersLookup={allOrdersLookup}
                    expandedContainers={expandedContainers}
                    onToggleExpanded={onToggleExpanded}
                  />
                )
              })}
            </div>
          ))}
        </div>
      ))}

      {/* Spacer at bottom */}
      <div className="h-20" />
    </div>
  )
}
