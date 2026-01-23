import { memo, useMemo, useState, useCallback } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSchedulerStore, selectRun } from './useSchedulerStore'
import { ManifestLine, type CollapsedGroup } from './ManifestLine'

// ─── RunContainer ────────────────────────────────────────────────────────────

interface RunContainerProps {
  runId: string
  isInbound: boolean
}

export const RunContainer = memo(function RunContainer({ runId, isInbound }: RunContainerProps) {
  const run = useSchedulerStore(selectRun(runId))
  const updateRunNotes = useSchedulerStore((s) => s.updateRunNotes)
  const [showNoteMenu, setShowNoteMenu] = useState(false)
  const [noteInput, setNoteInput] = useState('')
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [explodedGroups, setExplodedGroups] = useState<Set<string>>(new Set())

  // Make the run itself sortable (for reordering runs within a cell)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `run:${runId}`,
    disabled: isInbound,
    data: { type: 'run', runId },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  // Build render list: collapse same-customer groups (unless exploded)
  const renderItems = useMemo(() => {
    if (!run || run.orderIds.length === 0) return []
    const orders = useSchedulerStore.getState().orders
    const items: RenderItem[] = []
    let i = 0

    while (i < run.orderIds.length) {
      const order = orders[run.orderIds[i]]
      if (!order) { i++; continue }

      // Look ahead for same-customer consecutive orders
      let j = i + 1
      while (j < run.orderIds.length) {
        const next = orders[run.orderIds[j]]
        if (!next || next.customerCode !== order.customerCode) break
        j++
      }

      const groupSize = j - i
      const groupKey = run.orderIds[i]
      if (groupSize >= 2 && !explodedGroups.has(groupKey)) {
        let totalPallets = 0
        for (let k = i; k < j; k++) {
          const o = orders[run.orderIds[k]]
          if (o) totalPallets += o.palletCount
        }
        items.push({
          type: 'collapsed',
          orderId: groupKey,
          collapsed: { customerCode: order.customerCode, orderCount: groupSize, totalPallets },
        })
        i = j
      } else if (groupSize >= 2 && explodedGroups.has(groupKey)) {
        // Exploded group — render individually but track the groupKey
        for (let k = i; k < j; k++) {
          items.push({ type: 'order', orderId: run.orderIds[k], groupKey })
        }
        i = j
      } else {
        items.push({ type: 'order', orderId: run.orderIds[i] })
        i++
      }
    }
    return items
  }, [run, explodedGroups])

  // Total pallet count for the run
  const totalPallets = useMemo(() => {
    if (!run) return 0
    const orders = useSchedulerStore.getState().orders
    let total = 0
    for (const oid of run.orderIds) {
      const o = orders[oid]
      if (o) total += o.palletCount
    }
    return total
  }, [run])

  const handleRunContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!run) return
    setNoteInput(run.notes || '')
    setMenuPos({ x: e.clientX, y: e.clientY })
    setShowNoteMenu(true)
  }, [run])

  const handleNoteSave = useCallback(() => {
    updateRunNotes(runId, noteInput || null)
    setShowNoteMenu(false)
  }, [runId, noteInput, updateRunNotes])

  if (!run) return null

  const sortableOrderIds = run.orderIds

  return (
    <div ref={setNodeRef} style={style} className="mb-1">
      {/* Run Header */}
      <div
        {...attributes}
        {...listeners}
        onContextMenu={handleRunContextMenu}
        className={`
          flex items-center gap-1 px-1.5 py-0.5 rounded-t
          text-[10px] font-bold uppercase tracking-wide select-none
          ${isInbound
            ? 'bg-stone-700 text-stone-300'
            : 'bg-purple-600 text-white border border-b-0 border-purple-700 cursor-grab'
          }
        `}
      >
        <span>{run.name}</span>
        {run.notes && (
          <div className="w-3 h-3 rounded-full bg-amber-300 flex items-center justify-center shrink-0" title={run.notes}>
            <span className="text-[7px] text-amber-900 font-bold">!</span>
          </div>
        )}
        <span className="ml-auto font-normal text-[9px] opacity-70">
          {totalPallets}P &middot; {run.orderIds.length} orders
        </span>
      </div>

      {/* Order List */}
      <div className={`
        rounded-b px-0.5 py-0.5 min-h-[20px]
        ${isInbound
          ? 'bg-stone-200/50'
          : 'border border-t-0 border-purple-200 bg-white'
        }
      `}>
        <SortableContext items={sortableOrderIds} strategy={verticalListSortingStrategy}>
          {renderItems.map((item) => (
            <ManifestLine
              key={item.orderId}
              orderId={item.orderId}
              collapsed={item.collapsed}
              onExplode={item.collapsed ? () => {
                setExplodedGroups((prev) => new Set(prev).add(item.orderId))
              } : undefined}
              onCollapse={item.groupKey ? () => {
                setExplodedGroups((prev) => {
                  const next = new Set(prev)
                  next.delete(item.groupKey!)
                  return next
                })
              } : undefined}
            />
          ))}
        </SortableContext>
      </div>

      {/* Context Menu for Run Notes */}
      {showNoteMenu && (
        <div
          className="fixed inset-0 z-[9999]"
          onClick={() => setShowNoteMenu(false)}
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); setShowNoteMenu(false) }}
        >
          <div
            className="absolute bg-white rounded shadow-lg border border-stone-200 p-2 w-52"
            style={{ left: menuPos.x, top: menuPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] font-bold text-stone-500 uppercase mb-1">Run Note</div>
            <textarea
              className="w-full border border-stone-300 rounded px-1.5 py-1 text-xs resize-none h-16 focus:outline-none focus:ring-1 focus:ring-purple-400"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="Add a note..."
              autoFocus
            />
            <div className="flex justify-end gap-1 mt-1">
              <button
                type="button"
                className="px-2 py-0.5 text-[10px] text-stone-500 hover:text-stone-700"
                onClick={() => setShowNoteMenu(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-2 py-0.5 text-[10px] bg-purple-600 text-white rounded hover:bg-purple-700"
                onClick={handleNoteSave}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

type RenderItem = {
  type: 'order' | 'collapsed'
  orderId: string
  collapsed?: CollapsedGroup
  groupKey?: string  // set on individual orders that belong to an exploded group
}
