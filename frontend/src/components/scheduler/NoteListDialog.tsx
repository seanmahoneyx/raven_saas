import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { format, parseISO } from 'date-fns'
import { StickyNote, Pin, Trash2, Edit2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SchedulerNote, NoteColor, CalendarOrder, DeliveryRun } from '@/types/api'

// Color classes (matching NoteCard.tsx)
const noteBackgroundColors: Record<NoteColor, string> = {
  yellow: 'bg-yellow-100',
  blue: 'bg-blue-100',
  green: 'bg-green-100',
  red: 'bg-red-100',
  purple: 'bg-purple-100',
  orange: 'bg-orange-100',
}

const noteBorderColors: Record<NoteColor, string> = {
  yellow: 'border-yellow-400',
  blue: 'border-blue-400',
  green: 'border-green-400',
  red: 'border-red-400',
  purple: 'border-purple-400',
  orange: 'border-orange-400',
}

export type ViewNotesTarget =
  | { type: 'order'; order: CalendarOrder }
  | { type: 'run'; run: DeliveryRun }

interface NoteListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  notes: SchedulerNote[]
  target: ViewNotesTarget | null
  onNoteUpdate?: (noteId: number, updates: { content?: string; color?: NoteColor; isPinned?: boolean }) => void
  onNoteDelete?: (noteId: number) => void
  onAddNote?: () => void
}

export default function NoteListDialog({
  open,
  onOpenChange,
  notes,
  target,
  onNoteUpdate,
  onNoteDelete,
  onAddNote,
}: NoteListDialogProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')

  // Get title based on target
  const title = target?.type === 'order'
    ? `Notes for ${target.order.order_type} ${target.order.number}`
    : target?.type === 'run'
    ? `Notes for ${target.run.name}`
    : 'Notes'

  // Sort notes: pinned first, then by date descending
  const sortedNotes = [...notes].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const handleStartEdit = (note: SchedulerNote) => {
    setEditingId(note.id)
    setEditContent(note.content)
  }

  const handleSaveEdit = (noteId: number) => {
    if (editContent.trim()) {
      onNoteUpdate?.(noteId, { content: editContent.trim() })
    }
    setEditingId(null)
    setEditContent('')
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditContent('')
  }

  const handleDelete = (noteId: number) => {
    if (window.confirm('Delete this note?')) {
      onNoteDelete?.(noteId)
    }
  }

  const handleTogglePin = (note: SchedulerNote) => {
    onNoteUpdate?.(note.id, { isPinned: !note.is_pinned })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StickyNote className="h-5 w-5 text-yellow-600" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 py-4 min-h-[200px]">
          {sortedNotes.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No notes yet</p>
          ) : (
            sortedNotes.map((note) => (
              <div
                key={note.id}
                className={cn(
                  'p-3 rounded-lg border',
                  noteBackgroundColors[note.color],
                  noteBorderColors[note.color],
                  note.is_pinned && 'ring-1 ring-gray-400'
                )}
              >
                {editingId === note.id ? (
                  // Edit mode
                  <div className="space-y-2">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full p-2 border rounded text-sm resize-none bg-white"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(note.id)}
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  // View mode
                  <>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                      <span>
                        {note.created_by_username && `${note.created_by_username} - `}
                        {format(parseISO(note.created_at), 'MMM d, h:mm a')}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleTogglePin(note)}
                          className={cn(
                            'p-1 rounded hover:bg-white/50',
                            note.is_pinned ? 'text-gray-700' : 'text-gray-400'
                          )}
                          title={note.is_pinned ? 'Unpin' : 'Pin'}
                        >
                          <Pin className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(note)}
                          className="p-1 rounded text-gray-400 hover:bg-white/50 hover:text-gray-600"
                          title="Edit"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(note.id)}
                          className="p-1 rounded text-red-400 hover:bg-red-100 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Add note button */}
        <div className="pt-2 border-t">
          <button
            type="button"
            onClick={onAddNote}
            className="w-full px-4 py-2 text-sm bg-yellow-100 text-yellow-800 rounded-md hover:bg-yellow-200 border border-yellow-300 flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Note
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
