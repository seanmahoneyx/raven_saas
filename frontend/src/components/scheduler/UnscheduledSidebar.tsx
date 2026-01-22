import { useMemo, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import type { CalendarOrder, OrderStatus } from '@/types/api'
import OrderCard from './OrderCard'
import { Truck, ArrowUpDown } from 'lucide-react'
import { parseISO, compareAsc } from 'date-fns'

type SortOption = 'customer' | 'dueDate'

interface UnscheduledSidebarProps {
  orders: CalendarOrder[]
  onOrderClick?: (order: CalendarOrder) => void
  onStatusChange?: (order: CalendarOrder, newStatus: OrderStatus) => void
  /** Callback when clicking the yellow note indicator to view notes */
  onViewNotes?: (order: CalendarOrder) => void
}

// Sort function for orders
const sortOrders = (orders: CalendarOrder[], sortBy: SortOption): CalendarOrder[] => {
  return [...orders].sort((a, b) => {
    if (sortBy === 'customer') {
      return a.party_name.localeCompare(b.party_name)
    } else {
      // Sort by due date (requested_date)
      // Orders without a due date go to the end
      if (!a.requested_date && !b.requested_date) return 0
      if (!a.requested_date) return 1
      if (!b.requested_date) return -1
      return compareAsc(parseISO(a.requested_date), parseISO(b.requested_date))
    }
  })
}

export default function UnscheduledSidebar({ orders, onOrderClick, onStatusChange, onViewNotes }: UnscheduledSidebarProps) {
  const [sortBy, setSortBy] = useState<SortOption>('dueDate')

  const { setNodeRef, isOver } = useDroppable({
    id: 'unscheduled',
    data: { date: null, truckId: null },
  })

  // Only show SOs in unscheduled sidebar
  // POs will populate on the schedule when users receive confirmed dates from vendors
  const salesOrders = useMemo(() => {
    const sos = orders.filter((o) => o.order_type === 'SO')
    return sortOrders(sos, sortBy)
  }, [orders, sortBy])

  const toggleSort = () => {
    setSortBy((prev) => (prev === 'customer' ? 'dueDate' : 'customer'))
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'w-56 bg-white border-r flex flex-col shrink-0 z-10 shadow-lg h-full relative',
        isOver && 'ring-2 ring-inset ring-blue-500 bg-blue-50'
      )}
    >
      {/* Drop zone overlay indicator */}
      {isOver && (
        <div className="absolute inset-0 bg-blue-100/50 z-20 flex items-center justify-center pointer-events-none">
          <div className="bg-blue-500 text-white px-3 py-2 rounded-lg shadow-lg text-sm font-medium">
            Drop to unschedule
          </div>
        </div>
      )}

      <div className="p-2 border-b bg-gray-50">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-700 text-xs uppercase tracking-wide">Unscheduled</h2>
          <span className="font-mono text-[10px] bg-gray-200 px-1 rounded">{salesOrders.length}</span>
        </div>
        {/* Sort toggle */}
        <button
          type="button"
          onClick={toggleSort}
          className="mt-1 w-full flex items-center justify-center gap-1 px-2 py-1 text-[10px] text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
          title={`Sort by ${sortBy === 'customer' ? 'due date' : 'customer'}`}
        >
          <ArrowUpDown className="h-3 w-3" />
          <span>Sort: {sortBy === 'customer' ? 'Customer' : 'Due Date'}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50/50">
        {salesOrders.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            All orders scheduled
          </div>
        ) : (
          <div>
            <div className="px-2 py-1 bg-blue-50 flex items-center gap-1 sticky top-0 z-10">
              <Truck className="h-3 w-3 text-blue-600" />
              <span className="text-[10px] font-semibold text-blue-700 uppercase">
                Outbound SOs
              </span>
              <span className="ml-auto text-[10px] text-blue-600 font-mono">
                {salesOrders.length}
              </span>
            </div>
            <div className="p-1">
              {salesOrders.map((order) => (
                <OrderCard
                  key={`${order.order_type}-${order.id}`}
                  order={order}
                  onClick={() => onOrderClick?.(order)}
                  onStatusChange={onStatusChange}
                  onViewNotes={onViewNotes}
                  showRequestedDate
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
