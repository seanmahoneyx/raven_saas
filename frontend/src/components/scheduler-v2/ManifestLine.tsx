import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSchedulerStore, selectOrder, type Order } from './useSchedulerStore'

// ─── Status Visual Maps ──────────────────────────────────────────────────────

const STATUS_DOT: Record<Order['status'], string> = {
  unscheduled: 'bg-gray-400',
  picked: 'bg-yellow-400',
  packed: 'bg-green-400',
  shipped: 'bg-blue-400',
  invoiced: 'bg-violet-400',
}

const STATUS_ROW_BG: Record<Order['status'], string> = {
  unscheduled: 'bg-gray-50',
  picked: 'bg-yellow-50',
  packed: 'bg-green-50',
  shipped: 'bg-blue-50',
  invoiced: 'bg-violet-50',
}

// ─── Collapsed Customer Group ────────────────────────────────────────────────

export interface CollapsedGroup {
  customerCode: string
  orderCount: number
  totalPallets: number
}

// ─── ManifestLine ────────────────────────────────────────────────────────────

interface ManifestLineProps {
  orderId: string
  collapsed?: CollapsedGroup
  isLoose?: boolean
}

export const ManifestLine = memo(function ManifestLine({ orderId, collapsed, isLoose }: ManifestLineProps) {
  const order = useSchedulerStore(selectOrder(orderId))

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: orderId,
    disabled: order?.isReadOnly || order?.type === 'PO',
    data: { type: 'order', orderId },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    cursor: order?.isReadOnly ? 'default' : 'grab',
  }

  if (!order) return null

  // Collapsed multi-order line
  if (collapsed) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}
        className="flex items-center gap-1.5 px-1.5 py-[3px] rounded text-xs select-none bg-slate-100 border border-slate-200"
      >
        <div className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
        <span className="font-bold text-slate-700 truncate">[{collapsed.customerCode}]</span>
        <span className="text-slate-500">({collapsed.orderCount})</span>
        <span className="ml-auto tabular-nums text-slate-600 font-medium shrink-0">{collapsed.totalPallets}P</span>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`
        flex items-center gap-1.5 px-1.5 py-[3px] rounded text-xs select-none
        border border-transparent hover:border-slate-300
        ${STATUS_ROW_BG[order.status]}
        ${isDragging ? 'shadow-lg ring-2 ring-blue-400 z-50' : ''}
        ${order.isReadOnly ? 'opacity-60' : ''}
        ${isLoose ? 'border-l-2 border-l-amber-400' : ''}
      `}
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[order.status]}`} />
      <span className="font-mono font-semibold text-slate-800 truncate min-w-0">{order.orderNumber}</span>
      <span className="font-bold text-slate-600 truncate">{order.customerCode}</span>
      <span className="ml-auto tabular-nums text-slate-700 font-medium shrink-0">{order.palletCount}P</span>
      {order.notes && (
        <div className="w-3 h-3 rounded-full bg-amber-300 flex items-center justify-center shrink-0" title={order.notes}>
          <span className="text-[8px] text-amber-900 font-bold">!</span>
        </div>
      )}
    </div>
  )
})
