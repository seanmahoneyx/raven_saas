import { useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { GripVertical } from 'lucide-react'
import type { CalendarOrder, DeliveryRun, OrderStatus } from '@/types/api'
import OrderCard from './OrderCard'

interface DeliveryRunGroupProps {
  run: DeliveryRun
  orders: CalendarOrder[]
  onOrderClick?: (order: CalendarOrder) => void
  onStatusChange?: (order: CalendarOrder, newStatus: OrderStatus) => void
  isDragActive?: boolean
  isFirst?: boolean
}

export default function DeliveryRunGroup({
  run,
  orders,
  onOrderClick,
  onStatusChange,
  isDragActive,
  isFirst = true,
}: DeliveryRunGroupProps) {
  const groupId = `run-${run.id}`

  // Calculate total pallets for this run
  const totalPallets = useMemo(() => {
    return orders.reduce((sum, order) => {
      return sum + (order.total_pallets ?? order.total_quantity ?? 0)
    }, 0)
  }, [orders])

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: groupId,
    data: {
      type: 'run',
      run,
      orders,
    },
  })

  // Make the run group droppable so other orders/runs can be dropped on it
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `run-drop-${run.id}`,
    data: {
      type: 'run',
      run,
      orders,
    },
  })

  // Combine refs
  const setNodeRef = (node: HTMLElement | null) => {
    setSortableRef(node)
    setDroppableRef(node)
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Use inline style to override the global * { border-color } rule
    borderColor: isOver && isDragActive ? '#7c3aed' : '#a855f7', // purple-600 when hover, purple-500 otherwise
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-md border-2 bg-purple-50/50 flex',
        !isFirst && 'mt-1.5',
        isDragging && 'opacity-50 ring-2 ring-purple-500 ring-offset-2',
        isOver && isDragActive && 'ring-2 ring-purple-600 ring-offset-1 bg-purple-100'
      )}
    >
      {/* Drag handle on the left - only this triggers group drag */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center w-5 bg-purple-200/50 rounded-l cursor-move hover:bg-purple-300/50 shrink-0"
        title="Drag to move entire run"
      >
        <GripVertical className="h-4 w-4 text-purple-600" />
      </div>

      {/* Orders container - orders can be individually manipulated */}
      <div className="flex-1 p-0.5 min-w-0">
        {orders.map((order) => (
          <OrderCard
            key={`${order.order_type}-${order.id}`}
            order={order}
            onClick={() => onOrderClick?.(order)}
            onStatusChange={onStatusChange}
            isDragActive={isDragActive}
          />
        ))}
      </div>

      {/* Pallet count on the right side */}
      <div
        className="flex items-center justify-center w-5 bg-purple-500 rounded-r shrink-0"
        title={`Total: ${totalPallets} pallets`}
      >
        <span className="text-[10px] font-bold text-white">{totalPallets}</span>
      </div>
    </div>
  )
}
