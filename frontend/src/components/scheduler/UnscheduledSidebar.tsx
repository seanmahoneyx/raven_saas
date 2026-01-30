import { useMemo, useState } from 'react'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import type { CalendarOrder, OrderStatus } from '@/types/api'
import OrderCard from './OrderCard'
import { Truck, ArrowUpDown, Package, StickyNote, Plus } from 'lucide-react'
import { parseISO, compareAsc } from 'date-fns'

type SortOption = 'customer' | 'dueDate'

interface UnscheduledSidebarProps {
  orders: CalendarOrder[]
  onOrderClick?: (order: CalendarOrder) => void
  onStatusChange?: (order: CalendarOrder, newStatus: OrderStatus) => void
  /** Callback when clicking the yellow note indicator to view notes */
  onViewNotes?: (order: CalendarOrder) => void
}

// Template block component (Scratch-style)
interface TemplateBlockProps {
  id: string
  icon: React.ReactNode
  label: string
  color: 'purple' | 'yellow'
}

function TemplateBlock({ id, icon, label, color }: TemplateBlockProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type: 'template', templateType: id.replace('template-', '') },
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'relative flex items-center gap-2 px-3 py-2.5 rounded-xl border-3 border-dashed cursor-grab active:cursor-grabbing transition-all',
        'font-bold text-xs shadow-[0_3px_6px_rgba(0,0,0,0.3)] hover:shadow-[0_4px_8px_rgba(0,0,0,0.35)] hover:translate-y-[-2px]',
        isDragging && 'opacity-0',
        color === 'purple' && 'bg-gradient-to-br from-purple-100 to-purple-200 border-purple-500 text-purple-800',
        color === 'yellow' && 'bg-gradient-to-br from-yellow-100 to-yellow-200 border-yellow-500 text-yellow-800'
      )}
      title={`Drag to create ${label}`}
    >
      <div className="shrink-0">{icon}</div>
      <span className="flex-1">{label}</span>
      <Plus className="w-4 h-4 shrink-0 opacity-70" />
    </div>
  )
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

      {/* Scratch-style Template Blocks */}
      <div className="p-2 border-b bg-white space-y-2">
        <div className="text-[10px] font-bold text-gray-600 uppercase tracking-wide mb-2">
          Create:
        </div>
        <TemplateBlock
          id="template-container"
          icon={<Package className="w-4 h-4" />}
          label="Truck Run"
          color="purple"
        />
        <TemplateBlock
          id="template-note"
          icon={<StickyNote className="w-4 h-4" />}
          label="Note"
          color="yellow"
        />
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
