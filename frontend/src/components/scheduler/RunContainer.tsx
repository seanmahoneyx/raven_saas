import { memo, useMemo, useState, useCallback } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSchedulerStore, selectRun } from './useSchedulerStore'
import { ManifestLine, type CollapsedGroup } from './ManifestLine'
import { useUpdateDeliveryRun, useDeleteDeliveryRun } from '@/api/scheduling'

// ─── RunContainer ────────────────────────────────────────────────────────────

interface RunContainerProps {
  runId: string
  isInbound: boolean
}

export const RunContainer = memo(function RunContainer({ runId, isInbound }: RunContainerProps) {
  const selectRunMemo = useMemo(() => selectRun(runId), [runId])
  const run = useSchedulerStore(selectRunMemo)
  const updateRunNotesStore = useSchedulerStore((s) => s.updateRunNotes)
  const deleteRunStore = useSchedulerStore((s) => s.deleteRun)
  const updateRunMutation = useUpdateDeliveryRun()
  const deleteRunMutation = useDeleteDeliveryRun()
  const [showNoteMenu, setShowNoteMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
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

  // Note count for the run (notes attached to this delivery run)
  const noteCount = useSchedulerStore((s) => {
    let count = 0
    for (const noteId in s.notes) {
      if (s.notes[noteId].deliveryRunId === runId) count++
    }
    return count
  })

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
    // Optimistic update
    updateRunNotesStore(runId, noteInput || null)
    // Persist to API
    updateRunMutation.mutate({
      runId: parseInt(runId, 10),
      notes: noteInput || '',
    })
    setShowNoteMenu(false)
  }, [runId, noteInput, updateRunNotesStore, updateRunMutation])

  const handleDeleteRun = useCallback(() => {
    // Check if run is empty (local state already checked in UI)
    const numericId = parseInt(runId, 10)

    // If runId is a valid number, it's from the database - call API
    // If it's NaN (e.g., "run-1234567890-1"), it's a local-only run
    if (!isNaN(numericId)) {
      // Delete from API first, then update local store
      deleteRunMutation.mutate(numericId, {
        onSuccess: () => {
          deleteRunStore(runId)
        },
      })
    } else {
      // Local-only run - just delete from store
      deleteRunStore(runId)
    }
    setShowDeleteConfirm(false)
  }, [runId, deleteRunMutation, deleteRunStore])

  // Compute all potential group keys (first order ID of each same-customer group)
  const allGroupKeys = useMemo(() => {
    if (!run || run.orderIds.length === 0) return []
    const orders = useSchedulerStore.getState().orders
    const keys: string[] = []
    let i = 0
    while (i < run.orderIds.length) {
      const order = orders[run.orderIds[i]]
      if (!order) { i++; continue }
      let j = i + 1
      while (j < run.orderIds.length) {
        const next = orders[run.orderIds[j]]
        if (!next || next.customerCode !== order.customerCode) break
        j++
      }
      const groupSize = j - i
      if (groupSize >= 2) {
        keys.push(run.orderIds[i])
      }
      i = j > i ? j : i + 1
    }
    return keys
  }, [run])

  const hasCollapsibleGroups = allGroupKeys.length > 0
  const hasExplodedGroups = allGroupKeys.some(key => explodedGroups.has(key))
  const hasCollapsedGroups = allGroupKeys.some(key => !explodedGroups.has(key))

  const handleExplodeAll = useCallback(() => {
    setExplodedGroups(new Set(allGroupKeys))
  }, [allGroupKeys])

  const handleCollapseAll = useCallback(() => {
    setExplodedGroups(new Set())
  }, [])

  if (!run) return null

  const isEmptyRun = run.orderIds.length === 0

  const sortableOrderIds = run.orderIds

  return (
    <div ref={setNodeRef} style={style} className="mb-1.5">
      {/* Run Header */}
      <div
        {...attributes}
        {...listeners}
        onContextMenu={handleRunContextMenu}
        className={`
          flex items-center gap-1.5 px-2 py-1 rounded-t-lg
          text-[10px] font-semibold uppercase tracking-wider select-none
          transition-all duration-150
          ${isInbound
            ? 'bg-gradient-to-r from-rose-500 to-rose-400 text-white shadow-sm'
            : 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-sm cursor-grab hover:from-indigo-700 hover:to-indigo-600'
          }
        `}
      >
        {/* Run icon */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 opacity-70">
          <path d="M4 3.5A1.5 1.5 0 0 1 5.5 2h5A1.5 1.5 0 0 1 12 3.5V5h.25A2.75 2.75 0 0 1 15 7.75v4.5A2.75 2.75 0 0 1 12.25 15h-8.5A2.75 2.75 0 0 1 1 12.25v-4.5A2.75 2.75 0 0 1 3.75 5H4V3.5Zm1.5 0V5h5V3.5a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 0-.5.5Z" />
        </svg>
        <span>{run.name}</span>
        {run.notes && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setNoteInput(run.notes || '')
              setMenuPos({ x: e.clientX, y: e.clientY })
              setShowNoteMenu(true)
            }}
            className="w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center shrink-0 shadow-inner hover:bg-amber-500 transition-colors cursor-pointer"
            title="Click to edit note"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5 text-amber-900">
              <path d="M3 4.75a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM6.25 3a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7ZM6.25 7.25a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7ZM6.25 11.5a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7ZM4 12.25a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM3 8.75a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
            </svg>
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="bg-white/20 px-1.5 py-0.5 rounded text-[9px] font-medium">
            {totalPallets}P
          </span>
          <span className="text-[9px] opacity-70">
            {run.orderIds.length} orders
          </span>
          {noteCount > 0 && (
            <span className="bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded-full text-[9px] font-bold min-w-[16px] text-center leading-none">
              {noteCount}
            </span>
          )}
          {/* Explode/Collapse All buttons - shown when there are collapsible groups */}
          {hasCollapsibleGroups && !isInbound && (
            <>
              {hasCollapsedGroups && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleExplodeAll()
                  }}
                  className="p-0.5 rounded hover:bg-white/20 transition-colors"
                  title="Explode all customer groups"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 opacity-70 hover:opacity-100">
                    <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
              {hasExplodedGroups && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCollapseAll()
                  }}
                  className="p-0.5 rounded hover:bg-white/20 transition-colors"
                  title="Collapse all customer groups"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 opacity-70 hover:opacity-100">
                    <path fillRule="evenodd" d="M11.78 9.78a.75.75 0 0 1-1.06 0L8 7.06 5.28 9.78a.75.75 0 0 1-1.06-1.06l3.25-3.25a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06Z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </>
          )}
          {/* Delete button - only shown for empty runs */}
          {isEmptyRun && !isInbound && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowDeleteConfirm(true)
              }}
              className="p-0.5 rounded hover:bg-white/20 transition-colors"
              title="Delete empty run"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 opacity-70 hover:opacity-100">
                <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Order List */}
      <div className={`
        rounded-b-lg px-1 py-1 min-h-[24px] space-y-0.5
        ${isInbound
          ? 'bg-rose-50/80 border border-t-0 border-rose-200'
          : 'bg-indigo-50/50 border border-t-0 border-indigo-200'
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
            className="absolute bg-white rounded-xl shadow-xl border border-slate-200 p-3 w-64"
            style={{ left: menuPos.x, top: menuPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-indigo-600">
                  <path d="M3 4.75a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM6.25 3a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7ZM6.25 7.25a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7ZM6.25 11.5a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7ZM4 12.25a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM3 8.75a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
                </svg>
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-700">Run Note</span>
                <span className="text-[10px] text-slate-400 ml-1.5">{run.name}</span>
              </div>
            </div>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs resize-none h-20 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors text-slate-900 bg-white placeholder:text-slate-400"
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
              placeholder="Add a note about this run..."
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors"
                onClick={() => setShowNoteMenu(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs bg-slate-800 text-white rounded-lg hover:bg-slate-700 font-medium transition-colors"
                onClick={handleNoteSave}
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl border border-slate-200 p-4 w-72"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5 text-red-600">
                  <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Delete Run?</h3>
                <p className="text-xs text-slate-500">{run.name}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Are you sure you want to delete this empty run? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium transition-colors"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
                onClick={handleDeleteRun}
              >
                Delete Run
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
