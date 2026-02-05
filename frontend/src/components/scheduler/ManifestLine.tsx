import { memo, useState, useCallback, useMemo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSchedulerStore, selectOrder, selectOrderMatchesFilter, type Order } from './useSchedulerStore'
import { useUpdateNotes } from '@/api/scheduling'

// ─── Status Visual Maps ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<Order['status'], { dot: string; bg: string; border: string }> = {
  unscheduled: { dot: 'bg-slate-400', bg: 'bg-slate-50 dark:bg-slate-800', border: 'border-slate-200 dark:border-slate-700' },
  picked: { dot: 'bg-amber-400', bg: 'bg-amber-50 dark:bg-amber-950', border: 'border-amber-200 dark:border-amber-800' },
  packed: { dot: 'bg-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950', border: 'border-emerald-200 dark:border-emerald-800' },
  shipped: { dot: 'bg-sky-400', bg: 'bg-sky-50 dark:bg-sky-950', border: 'border-sky-200 dark:border-sky-800' },
  invoiced: { dot: 'bg-violet-400', bg: 'bg-violet-50 dark:bg-violet-950', border: 'border-violet-200 dark:border-violet-800' },
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
  // Memoize selectors to prevent infinite re-renders
  const selectOrderMemo = useMemo(() => selectOrder(orderId), [orderId])
  const selectMatchesMemo = useMemo(() => selectOrderMatchesFilter(orderId), [orderId])

  const order = useSchedulerStore(selectOrderMemo)
  const matchesFilter = useSchedulerStore(selectMatchesMemo)
  const updateOrderNotes = useSchedulerStore((s) => s.updateOrderNotes)
  const setSelectedOrderId = useSchedulerStore((s) => s.setSelectedOrderId)
  const updateNotesMutation = useUpdateNotes()
  const [showNoteMenu, setShowNoteMenu] = useState(false)
  const [noteInput, setNoteInput] = useState('')
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })

  // For loose orders in unified list, use prefixed ID; for orders in runs, use plain orderId
  const sortableId = isLoose ? `order:${orderId}` : orderId

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId,
    disabled: order?.isReadOnly || order?.type === 'PO',
    data: { type: 'order', orderId },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
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
    if (!order) return
    // Optimistic update in local store
    updateOrderNotes(orderId, noteInput || null)
    // Persist to API
    updateNotesMutation.mutate({
      orderType: order.type,
      orderId: parseInt(orderId, 10),
      notes: noteInput || '',
    })
    setShowNoteMenu(false)
  }, [orderId, noteInput, updateOrderNotes, updateNotesMutation, order])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    // If collapsed group, explode it
    if (collapsed && onExplode) {
      onExplode()
    // If part of an exploded group, re-collapse it
    } else if (onCollapse) {
      onCollapse()
    // Otherwise open detail modal
    } else {
      setSelectedOrderId(orderId)
    }
  }, [collapsed, onExplode, onCollapse, orderId, setSelectedOrderId])

  if (!order) return null

  const statusConfig = STATUS_CONFIG[order.status]

  // Collapsed multi-order line
  if (collapsed) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
        className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs select-none bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-150 dark:hover:bg-slate-750 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
        title="Double-click to expand"
      >
        <div className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
        <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">[{collapsed.customerCode}]</span>
        <span className="text-slate-500 dark:text-slate-400 text-[10px]">{collapsed.orderCount} orders</span>
        <span className="ml-auto tabular-nums text-slate-600 dark:text-slate-300 font-semibold text-[11px] shrink-0">{collapsed.totalPallets}P</span>
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
        onDoubleClick={handleDoubleClick}
        className={`
          group flex items-center gap-1.5 px-2 py-1 rounded-md text-xs select-none
          border transition-all duration-150 cursor-grab
          ${statusConfig.bg} ${statusConfig.border}
          ${isDragging ? 'shadow-lg ring-2 ring-amber-400 z-50 scale-[1.02]' : 'hover:shadow-sm'}
          ${order.isReadOnly ? 'opacity-50 cursor-default' : 'hover:border-slate-300 dark:hover:border-slate-600'}
          ${isLoose ? 'border-l-[3px] border-l-amber-400' : ''}
          ${!matchesFilter ? 'opacity-20 grayscale scale-95 pointer-events-none' : ''}
        `}
      >
        {/* Status dot */}
        <div className={`w-2 h-2 rounded-full shrink-0 ${statusConfig.dot}`} />

        {/* Order number */}
        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 truncate text-[11px]">{order.orderNumber}</span>

        {/* Customer code */}
        <span className="font-medium text-slate-500 dark:text-slate-400 truncate text-[10px]">{order.customerCode}</span>

        {/* Pallet count */}
        <span className="ml-auto tabular-nums text-slate-700 dark:text-slate-200 font-semibold text-[11px] shrink-0 bg-white/60 dark:bg-black/30 px-1.5 py-0.5 rounded">
          {order.palletCount}P
        </span>

        {/* Notes indicator - clickable to open note menu */}
        {order.notes && (
          <button
            type="button"
            className="w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center shrink-0 shadow-sm hover:bg-amber-500 transition-colors cursor-pointer"
            title={order.notes}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              setNoteInput(order.notes || '')
              setMenuPos({ x: e.clientX, y: e.clientY })
              setShowNoteMenu(true)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5 text-amber-900">
              <path d="M3 4.75a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM6.25 3a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7ZM6.25 7.25a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7ZM6.25 11.5a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7ZM4 12.25a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM3 8.75a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
            </svg>
          </button>
        )}

        {/* Locked indicator */}
        {order.isReadOnly && (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0">
            <path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" />
          </svg>
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
            className="absolute bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-3 w-60"
            style={{ left: menuPos.x, top: menuPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${statusConfig.dot}`} />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{order.orderNumber}</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Note</span>
            </div>
            <textarea
              className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-2 text-xs resize-none h-20 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-colors text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleNoteSave()
                } else if (e.key === 'Escape') {
                  setShowNoteMenu(false)
                }
              }}
              placeholder="Add a note..."
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium transition-colors"
                onClick={() => setShowNoteMenu(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs bg-slate-800 dark:bg-slate-600 text-white rounded-lg hover:bg-slate-700 dark:hover:bg-slate-500 font-medium transition-colors"
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
