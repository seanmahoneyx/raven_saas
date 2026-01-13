import { useMemo } from 'react'
import {
  format,
  startOfWeek,
  addDays,
  addWeeks,
  isToday,
} from 'date-fns'
import type { CalendarOrder, TruckCalendar, Truck } from '@/types/api'
import CalendarCell from './CalendarCell'
import { cn } from '@/lib/utils'

interface CalendarGridProps {
  trucks: Truck[]
  calendarData: TruckCalendar[]
  anchorDate: Date
  weeksToShow?: number
  onOrderClick?: (order: CalendarOrder) => void
}

export default function CalendarGrid({
  trucks,
  calendarData,
  anchorDate,
  weeksToShow = 8,
  onOrderClick,
}: CalendarGridProps) {
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

  return (
    <div className="overflow-auto">
      <div className="min-w-[1200px]">
        {/* Header with weeks and days */}
        <div className="sticky top-0 bg-white z-10 border-b-2 border-gray-300">
          <div className="flex">
            {/* Truck column header */}
            <div className="w-32 flex-shrink-0 p-2 font-semibold text-sm border-r border-gray-300 bg-gray-50">
              Resource
            </div>
            {/* Week headers */}
            {weeks.map((weekDays, weekIdx) => (
              <div key={weekIdx} className="flex-1 min-w-0">
                <div className="text-center text-xs font-medium py-1 bg-gray-100 border-b border-gray-200">
                  Week of {format(weekDays[0], 'MMM d')}
                </div>
                <div className="flex">
                  {weekDays.map((day) => (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        'flex-1 text-center text-xs py-1 border-r border-gray-200',
                        isToday(day) && 'bg-blue-100 font-semibold'
                      )}
                    >
                      <div>{format(day, 'EEE')}</div>
                      <div>{format(day, 'd')}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Truck rows */}
        {trucks.map((truck) => (
          <div key={truck.id} className="flex border-b border-gray-200">
            {/* Truck label */}
            <div className="w-32 flex-shrink-0 p-2 text-sm font-medium border-r border-gray-300 bg-gray-50">
              <div className="truncate">{truck.name}</div>
              {truck.capacity_pallets && (
                <div className="text-xs text-gray-500">
                  {truck.capacity_pallets} pallets
                </div>
              )}
            </div>
            {/* Calendar cells for this truck */}
            {weeks.map((weekDays) =>
              weekDays.map((day) => (
                <div key={`${truck.id}-${day.toISOString()}`} className="flex-1 min-w-0">
                  <CalendarCell
                    date={format(day, 'yyyy-MM-dd')}
                    truckId={truck.id}
                    orders={getOrdersForCell(truck.id, day)}
                    isToday={isToday(day)}
                    onOrderClick={onOrderClick}
                  />
                </div>
              ))
            )}
          </div>
        ))}

        {/* Inbound/Receiving row for POs */}
        <div className="flex border-b-2 border-gray-300">
          <div className="w-32 flex-shrink-0 p-2 text-sm font-medium border-r border-gray-300 bg-amber-50">
            <div>Inbound</div>
            <div className="text-xs text-gray-500">Purchase Orders</div>
          </div>
          {weeks.map((weekDays) =>
            weekDays.map((day) => (
              <div key={`inbound-${day.toISOString()}`} className="flex-1 min-w-0">
                <CalendarCell
                  date={format(day, 'yyyy-MM-dd')}
                  truckId={null}
                  orders={getOrdersForCell(null, day)}
                  isToday={isToday(day)}
                  onOrderClick={onOrderClick}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
