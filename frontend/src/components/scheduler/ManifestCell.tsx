import { memo, useMemo, useState, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import {
  useSchedulerStore,
  type CellId,
  type NoteColor,
} from './useSchedulerStore'
import { RunContainer } from './RunContainer'
import { ManifestLine } from './ManifestLine'
import { NoteCard } from './NoteCard'
import { useCreateNote } from '@/api/scheduling'

const NOTE_COLOR_OPTIONS: { value: NoteColor; label: string; bg: string }[] = [
  { value: 'yellow', label: 'Yellow', bg: 'bg-yellow-400' },
  { value: 'blue', label: 'Blue', bg: 'bg-blue-400' },
  { value: 'green', label: 'Green', bg: 'bg-emerald-400' },
  { value: 'red', label: 'Red', bg: 'bg-red-400' },
  { value: 'purple', label: 'Purple', bg: 'bg-violet-400' },
  { value: 'orange', label: 'Orange', bg: 'bg-orange-400' },
]

// ─── ManifestCell ─────────────────────────────────────────────────────────────

interface ManifestCellProps {
  cellId: CellId
  isInbound: boolean
  isUnassigned?: boolean
  isPickup?: boolean
}

// Stable empty array to avoid creating new references
const EMPTY_IDS: string[] = []

export const ManifestCell = memo(function ManifestCell({ cellId, isInbound, isUnassigned, isPickup }: ManifestCellProps) {
  // Parse cellId to get truckId and date
  const [truckId, date] = cellId.split('|')

  // Use stable selectors - get cell data once, then extract arrays
  const cell = useSchedulerStore((s) => s.cells[cellId])
  const cellLooseItemOrder = useSchedulerStore((s) => s.cellLooseItemOrder[cellId])
  const isLocked = useSchedulerStore((s) => s.blockedDates.has(date))

  // Memoize arrays to prevent re-renders
  const runIds = useMemo(() => cell?.runIds ?? EMPTY_IDS, [cell?.runIds])
  // Unified loose items (notes + orders interleaved)
  const looseItems = useMemo(() => cellLooseItemOrder ?? EMPTY_IDS, [cellLooseItemOrder])
  const createRun = useSchedulerStore((s) => s.createRun)
  const addNote = useSchedulerStore((s) => s.addNote)
  const { setNodeRef, isOver } = useDroppable({ id: cellId })

  const createNoteMutation = useCreateNote()

  const [showNoteDialog, setShowNoteDialog] = useState(false)
  const [noteContent, setNoteContent] = useState('')
  const [noteColor, setNoteColor] = useState<NoteColor>('yellow')
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })

  // Sortable IDs for run reordering (prefixed with "run:")
  const sortableRunIds = useMemo(
    () => runIds.map((id) => `run:${id}`),
    [runIds]
  )

  // Loose items are already prefixed ("note:123" or "order:456")
  // They serve as their own sortable IDs

  const handleAddRun = () => {
    createRun(cellId)
  }

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setNoteContent('')
    setNoteColor('yellow')
    setMenuPos({ x: e.clientX, y: e.clientY })
    setShowNoteDialog(true)
  }, [])

  const handleCreateNote = useCallback(() => {
    if (!noteContent.trim()) return

    const truckIdNum = truckId === 'unassigned' || truckId === 'inbound' || truckId === 'pickup' ? null : parseInt(truckId, 10)

    createNoteMutation.mutate({
      content: noteContent.trim(),
      color: noteColor,
      scheduledDate: date,
      truckId: truckIdNum,
    }, {
      onSuccess: (data) => {
        // Add to local store
        addNote({
          id: data.id.toString(),
          content: data.content,
          color: data.color,
          scheduledDate: data.scheduled_date,
          truckId: data.truck_id?.toString() ?? null,
          deliveryRunId: data.delivery_run_id?.toString() ?? null,
          isPinned: data.is_pinned,
          createdBy: data.created_by_username,
        })
      }
    })

    setShowNoteDialog(false)
    setNoteContent('')
  }, [noteContent, noteColor, truckId, date, createNoteMutation, addNote])

  return (
    <div
      ref={setNodeRef}
      onContextMenu={handleContextMenu}
      className={`
        min-h-[48px] p-1 border-r border-b relative flex flex-col transition-colors
        ${isInbound
          ? 'bg-rose-100 dark:bg-rose-950 border-rose-200 dark:border-rose-800'
          : isPickup
            ? 'bg-purple-50/50 dark:bg-purple-950/30 border-purple-100 dark:border-purple-900'
            : isUnassigned
              ? 'bg-cyan-50/50 dark:bg-cyan-950/30 border-cyan-100 dark:border-cyan-900'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
        }
        ${isLocked && !isInbound
          ? 'bg-[repeating-linear-gradient(-45deg,transparent,transparent_6px,rgba(239,68,68,0.08)_6px,rgba(239,68,68,0.08)_8px)] dark:bg-[repeating-linear-gradient(-45deg,transparent,transparent_6px,rgba(239,68,68,0.15)_6px,rgba(239,68,68,0.15)_8px)]'
          : ''
        }
        ${isOver ? 'ring-2 ring-inset ring-amber-400 bg-amber-50/30 dark:bg-amber-900/30' : ''}
      `}
    >
      {/* Section A: Committed Runs */}
      <SortableContext items={sortableRunIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {runIds.map((runId) => (
            <RunContainer key={runId} runId={runId} isInbound={isInbound} />
          ))}
        </div>
      </SortableContext>

      {/* Separator (only if runs exist and there are loose items) */}
      {runIds.length > 0 && looseItems.length > 0 && (
        <div className="border-t border-dashed border-slate-200 dark:border-slate-700 my-1" />
      )}

      {/* Unified loose items section: Notes and Orders interleaved */}
      <div className="flex-1 flex flex-col space-y-0.5">
        <SortableContext items={looseItems} strategy={verticalListSortingStrategy}>
          {looseItems.map((item) => {
            if (item.startsWith('note:')) {
              const noteId = item.slice(5)
              return <NoteCard key={item} noteId={noteId} originalCellId={cellId} />
            } else if (item.startsWith('order:')) {
              const orderId = item.slice(6)
              return <ManifestLine key={item} orderId={orderId} isLoose />
            }
            return null
          })}
        </SortableContext>
        {/* Always show a drop slot below items - same height as an order line (not for inbound) */}
        {!isInbound && (
          <div className={`min-h-[28px] rounded-md transition-colors ${isOver ? 'border border-dashed border-amber-300 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-900/30' : ''}`} />
        )}
      </div>

      {/* Footer: Add Run Button (not for inbound, pickup, or unassigned) */}
      {!isInbound && !isPickup && !isUnassigned && (
        <button
          type="button"
          onClick={handleAddRun}
          className="
            w-full mt-1 py-1 text-[9px] text-slate-400 dark:text-slate-500 font-medium
            hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md
            border border-dashed border-transparent hover:border-slate-300 dark:hover:border-slate-600
            transition-all select-none flex items-center justify-center gap-1
          "
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
            <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
          </svg>
          Add Run
        </button>
      )}

      {/* Create Note Dialog */}
      {showNoteDialog && (
        <div
          className="fixed inset-0 z-[9999]"
          onClick={() => setShowNoteDialog(false)}
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); setShowNoteDialog(false) }}
        >
          <div
            className="absolute bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-3 w-64"
            style={{ left: menuPos.x, top: menuPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-amber-500">
                <path d="M3 4.75a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM6.25 3a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7ZM6.25 7.25a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7ZM6.25 11.5a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7ZM4 12.25a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM3 8.75a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
              </svg>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Add Note</span>
            </div>
            <textarea
              className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-2 text-xs resize-none h-20 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-colors text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (noteContent.trim()) handleCreateNote()
                } else if (e.key === 'Escape') {
                  setShowNoteDialog(false)
                }
              }}
              placeholder="Enter note content..."
              autoFocus
            />
            {/* Color picker */}
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] text-slate-500 font-medium">Color:</span>
              {NOTE_COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setNoteColor(opt.value)}
                  className={`
                    w-5 h-5 rounded-full ${opt.bg} transition-transform
                    ${noteColor === opt.value ? 'ring-2 ring-offset-1 ring-slate-400 scale-110' : 'hover:scale-110'}
                  `}
                  title={opt.label}
                />
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium transition-colors"
                onClick={() => setShowNoteDialog(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs bg-slate-800 dark:bg-slate-600 text-white rounded-lg hover:bg-slate-700 dark:hover:bg-slate-500 font-medium transition-colors disabled:opacity-50"
                onClick={handleCreateNote}
                disabled={!noteContent.trim()}
              >
                Add Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
