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
}

// Stable empty array to avoid creating new references
const EMPTY_IDS: string[] = []

export const ManifestCell = memo(function ManifestCell({ cellId, isInbound, isUnassigned }: ManifestCellProps) {
  // Parse cellId to get truckId and date
  const [truckId, date] = cellId.split('|')

  // Use stable selectors - get cell data once, then extract arrays
  const cell = useSchedulerStore((s) => s.cells[cellId])
  const noteToCell = useSchedulerStore((s) => s.noteToCell)
  const isLocked = useSchedulerStore((s) => s.blockedDates.has(date))

  // Memoize arrays to prevent re-renders
  const runIds = useMemo(() => cell?.runIds ?? EMPTY_IDS, [cell?.runIds])
  const looseOrderIds = useMemo(() => cell?.looseOrderIds ?? EMPTY_IDS, [cell?.looseOrderIds])
  const noteIds = useMemo(() => {
    const ids: string[] = []
    for (const [noteId, noteCellId] of Object.entries(noteToCell)) {
      if (noteCellId === cellId) ids.push(noteId)
    }
    return ids.length > 0 ? ids : EMPTY_IDS
  }, [noteToCell, cellId])
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

  // Sortable IDs for notes (prefixed with "note:")
  const sortableNoteIds = useMemo(
    () => noteIds.map((id) => `note:${id}`),
    [noteIds]
  )

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

    const truckIdNum = truckId === 'unassigned' || truckId === 'inbound' ? null : parseInt(truckId, 10)

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
          ? 'bg-rose-50/50 border-rose-100'
          : isUnassigned
            ? 'bg-cyan-50/50 border-cyan-100'
            : 'bg-white border-slate-200'
        }
        ${isLocked && !isInbound
          ? 'bg-[repeating-linear-gradient(-45deg,transparent,transparent_6px,rgba(239,68,68,0.08)_6px,rgba(239,68,68,0.08)_8px)]'
          : ''
        }
        ${isOver ? 'ring-2 ring-inset ring-amber-400 bg-amber-50/30' : ''}
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

      {/* Separator (only if runs exist) */}
      {runIds.length > 0 && looseOrderIds.length > 0 && (
        <div className="border-t border-dashed border-slate-200 my-1" />
      )}

      {/* Section B: Notes */}
      {noteIds.length > 0 && (
        <div className="space-y-0.5 mb-1">
          <SortableContext items={sortableNoteIds} strategy={verticalListSortingStrategy}>
            {noteIds.map((noteId) => (
              <NoteCard key={noteId} noteId={noteId} originalCellId={cellId} />
            ))}
          </SortableContext>
        </div>
      )}

      {/* Section C: Loose Orders Drop Zone (always visible for non-inbound) */}
      {!isInbound && (
        <div className="flex-1 flex flex-col space-y-0.5">
          <SortableContext items={looseOrderIds} strategy={verticalListSortingStrategy}>
            {looseOrderIds.map((orderId) => (
              <ManifestLine key={orderId} orderId={orderId} isLoose />
            ))}
          </SortableContext>
          {/* Always show a drop slot below orders - same height as an order line */}
          <div className={`min-h-[28px] rounded-md transition-colors ${isOver ? 'border border-dashed border-amber-300 bg-amber-50/50' : ''}`} />
        </div>
      )}

      {/* Footer: Add Run Button (not for inbound or unassigned) */}
      {!isInbound && !isUnassigned && (
        <button
          type="button"
          onClick={handleAddRun}
          className="
            w-full mt-1 py-1 text-[9px] text-slate-400 font-medium
            hover:text-slate-600 hover:bg-slate-100 rounded-md
            border border-dashed border-transparent hover:border-slate-300
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
            className="absolute bg-white rounded-xl shadow-xl border border-slate-200 p-3 w-64"
            style={{ left: menuPos.x, top: menuPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-amber-500">
                <path d="M3 4.75a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM6.25 3a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7ZM6.25 7.25a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7ZM6.25 11.5a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7ZM4 12.25a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM3 8.75a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
              </svg>
              <span className="text-xs font-semibold text-slate-700">Add Note</span>
            </div>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs resize-none h-20 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-colors"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
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
                className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors"
                onClick={() => setShowNoteDialog(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs bg-slate-800 text-white rounded-lg hover:bg-slate-700 font-medium transition-colors disabled:opacity-50"
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
