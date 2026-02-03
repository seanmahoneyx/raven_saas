import { memo, useState, useCallback, useMemo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSchedulerStore, selectNote, type NoteColor } from './useSchedulerStore'
import { useUpdateNote, useDeleteNote } from '@/api/scheduling'

const NOTE_COLORS: Record<NoteColor, { bg: string; border: string; text: string; ring: string }> = {
  yellow: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-800', ring: 'ring-amber-400' },
  blue: { bg: 'bg-sky-50', border: 'border-sky-300', text: 'text-sky-800', ring: 'ring-sky-400' },
  green: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', ring: 'ring-emerald-400' },
  red: { bg: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-800', ring: 'ring-rose-400' },
  purple: { bg: 'bg-violet-50', border: 'border-violet-300', text: 'text-violet-800', ring: 'ring-violet-400' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-800', ring: 'ring-orange-400' },
}

interface NoteCardProps {
  noteId: string
  originalCellId?: string // To detect cross-cell moves
}

export const NoteCard = memo(function NoteCard({ noteId, originalCellId }: NoteCardProps) {
  const selectNoteMemo = useMemo(() => selectNote(noteId), [noteId])
  const note = useSchedulerStore(selectNoteMemo)
  const updateNoteStore = useSchedulerStore((s) => s.updateNote)
  const deleteNoteStore = useSchedulerStore((s) => s.deleteNote)

  const updateNoteMutation = useUpdateNote()
  const deleteNoteMutation = useDeleteNote()

  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `note:${noteId}`,
    data: { type: 'note', noteId, originalCellId },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!note) return
    setEditContent(note.content)
    setMenuPos({ x: e.clientX, y: e.clientY })
    setShowMenu(true)
  }, [note])

  const handleEdit = useCallback(() => {
    setIsEditing(true)
  }, [])

  const handleSave = useCallback(() => {
    if (!note) return
    updateNoteStore(noteId, { content: editContent })
    updateNoteMutation.mutate({
      noteId: parseInt(noteId, 10),
      content: editContent,
    })
    setIsEditing(false)
    setShowMenu(false)
  }, [noteId, editContent, note, updateNoteStore, updateNoteMutation])

  const handleDelete = useCallback(() => {
    deleteNoteStore(noteId)
    deleteNoteMutation.mutate(parseInt(noteId, 10))
    setShowMenu(false)
  }, [noteId, deleteNoteStore, deleteNoteMutation])

  const handleCancel = useCallback(() => {
    setIsEditing(false)
    setShowMenu(false)
  }, [])

  if (!note) return null

  const colors = NOTE_COLORS[note.color] || NOTE_COLORS.yellow

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onContextMenu={handleContextMenu}
        className={`
          group flex items-start gap-1.5 px-2 py-1.5 rounded-lg text-[10px] select-none cursor-grab
          border shadow-sm transition-all duration-150
          ${colors.bg} ${colors.border} ${colors.text}
          ${isDragging ? `shadow-lg ring-2 ${colors.ring} z-50 scale-[1.02]` : 'hover:shadow-md'}
        `}
      >
        {/* Note icon */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 shrink-0 opacity-50 mt-0.5">
          <path d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4Zm4.5 2a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Zm0 2.5a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Zm0 2.5a.5.5 0 0 0 0 1h1.5a.5.5 0 0 0 0-1h-1.5Z" />
        </svg>

        {/* Pin indicator */}
        {note.isPinned && (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 shrink-0 opacity-70">
            <path d="M10.618 10.26c-.361.223-.618.598-.618 1.022v2.968a.75.75 0 1 1-1.5 0v-2.968c0-.424-.257-.799-.618-1.021A4.242 4.242 0 0 1 6 6.5V3c0-.298.095-.546.228-.758.137-.217.248-.4.248-.53a.204.204 0 0 0-.066-.15A.202.202 0 0 0 6.262 1.5H4a.75.75 0 0 1 0-1.5h8a.75.75 0 0 1 0 1.5h-2.262c-.056 0-.11.023-.148.062a.204.204 0 0 0-.066.15c0 .13.11.313.248.53.133.212.228.46.228.758v3.5a4.242 4.242 0 0 1-1.882 3.76Z" />
          </svg>
        )}
        <span className="truncate flex-1 font-medium leading-tight">{note.content}</span>
      </div>

      {/* Context Menu */}
      {showMenu && (
        <div
          className="fixed inset-0 z-[9999]"
          onClick={() => setShowMenu(false)}
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); setShowMenu(false) }}
        >
          <div
            className="absolute bg-white rounded-xl shadow-xl border border-slate-200 p-3 w-64"
            style={{ left: menuPos.x, top: menuPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {isEditing ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-6 h-6 rounded-lg ${colors.bg} ${colors.border} border flex items-center justify-center`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`w-3.5 h-3.5 ${colors.text}`}>
                      <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.76 9.766a4.5 4.5 0 0 0-1.197 2.059l-.461 1.849a.75.75 0 0 0 .914.914l1.848-.46a4.5 4.5 0 0 0 2.06-1.197l7.252-7.253a1.75 1.75 0 0 0 0-2.475l-.688-.688Z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-slate-700">Edit Note</span>
                </div>
                <textarea
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs resize-none h-20 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-colors text-slate-900 bg-white placeholder:text-slate-400"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSave()
                    } else if (e.key === 'Escape') {
                      handleCancel()
                    }
                  }}
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors"
                    onClick={handleCancel}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs bg-slate-800 text-white rounded-lg hover:bg-slate-700 font-medium transition-colors"
                    onClick={handleSave}
                  >
                    Save
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-6 h-6 rounded-lg ${colors.bg} ${colors.border} border flex items-center justify-center`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`w-3.5 h-3.5 ${colors.text}`}>
                      <path d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4Zm4.5 2a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Zm0 2.5a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Zm0 2.5a.5.5 0 0 0 0 1h1.5a.5.5 0 0 0 0-1h-1.5Z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-slate-700">Note</span>
                  {note.isPinned && (
                    <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">Pinned</span>
                  )}
                </div>
                <div className={`text-xs ${colors.text} mb-3 line-clamp-4 p-2 rounded-lg ${colors.bg} border ${colors.border}`}>
                  {note.content}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium transition-colors"
                    onClick={handleEdit}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                      <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.76 9.766a4.5 4.5 0 0 0-1.197 2.059l-.461 1.849a.75.75 0 0 0 .914.914l1.848-.46a4.5 4.5 0 0 0 2.06-1.197l7.252-7.253a1.75 1.75 0 0 0 0-2.475l-.688-.688Z" />
                    </svg>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs bg-red-50 text-red-700 rounded-lg hover:bg-red-100 font-medium transition-colors"
                    onClick={handleDelete}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                      <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd" />
                    </svg>
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
})
