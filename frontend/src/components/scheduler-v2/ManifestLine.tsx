import { memo, useState, useCallback } from 'react'
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
  onExplode?: () => void
  onCollapse?: () => void
}

export const ManifestLine = memo(function ManifestLine({ orderId, collapsed, isLoose, onExplode, onCollapse }: ManifestLineProps) {
  const order = useSchedulerStore(selectOrder(orderId))
  const updateOrderNotes = useSchedulerStore((s) => s.updateOrderNotes)
  const [showNoteMenu, setShowNoteMenu] = useState(false)
  const [noteInput, setNoteInput] = useState('')
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })

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

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!order) return
    setNoteInput(order.notes || '')
    setMenuPos({ x: e.clientX, y: e.clientY })
    setShowNoteMenu(true)
  }, [order])

  const handleNoteSave = useCallback(() => {
    updateOrderNotes(orderId, noteInput || null)
    setShowNoteMenu(false)
  }, [orderId, noteInput, updateOrderNotes])

  if (!order) return null

  // Collapsed multi-order line
  if (collapsed) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}
        onContextMenu={handleContextMenu}
        onDoubleClick={onExplode}
        className="flex items-center gap-1.5 px-1.5 py-[3px] rounded text-xs select-none bg-slate-100 border border-slate-200 cursor-pointer"
        title="Double-click to expand"
      >
        <div className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
        <span className="font-bold text-slate-700 truncate">[{collapsed.customerCode}]</span>
        <span className="text-slate-500">({collapsed.orderCount})</span>
        <span className="ml-auto tabular-nums text-slate-600 font-medium shrink-0">{collapsed.totalPallets}P</span>
      </div>
    )
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onContextMenu={handleContextMenu}
        onDoubleClick={onCollapse}
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

      {/* Context Menu for Order Notes */}
      {showNoteMenu && (
        <div
          className="fixed inset-0 z-[9999]"
          onClick={() => setShowNoteMenu(false)}
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); setShowNoteMenu(false) }}
        >
          <div
            className="absolute bg-white rounded shadow-lg border border-slate-200 p-2 w-52"
            style={{ left: menuPos.x, top: menuPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Order Note — {order.orderNumber}</div>
            <textarea
              className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs resize-none h-16 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="Add a note..."
              autoFocus
            />
            <div className="flex justify-end gap-1 mt-1">
              <button
                type="button"
                className="px-2 py-0.5 text-[10px] text-slate-500 hover:text-slate-700"
                onClick={() => setShowNoteMenu(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-2 py-0.5 text-[10px] bg-indigo-500 text-white rounded hover:bg-indigo-600"
                onClick={handleNoteSave}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
})
