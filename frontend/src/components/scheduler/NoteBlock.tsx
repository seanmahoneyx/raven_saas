import { useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import type { SchedulerNote, NoteColor } from '@/types/api'
import { StickyNote, Pin, Trash2, GripVertical } from 'lucide-react'

interface NoteBlockProps {
  note: SchedulerNote
  onUpdate?: (noteId: number, updates: { content?: string; color?: NoteColor; isPinned?: boolean }) => void
  onDelete?: (noteId: number) => void
  isOverlay?: boolean
  disableDrag?: boolean
}

// Scratch-style color classes for note backgrounds
const noteBackgroundColors: Record<NoteColor, string> = {
  yellow: 'bg-yellow-100',
  blue: 'bg-blue-100',
  green: 'bg-green-100',
  red: 'bg-red-100',
  purple: 'bg-purple-100',
  orange: 'bg-orange-100',
}

// Border colors for notes - thicker for Scratch style
const noteBorderColors: Record<NoteColor, string> = {
  yellow: 'border-yellow-500',
  blue: 'border-blue-500',
  green: 'border-green-500',
  red: 'border-red-500',
  purple: 'border-purple-500',
  orange: 'border-orange-500',
}

// Hover colors for notes
const noteHoverColors: Record<NoteColor, string> = {
  yellow: 'hover:bg-yellow-50',
  blue: 'hover:bg-blue-50',
  green: 'hover:bg-green-50',
  red: 'hover:bg-red-50',
  purple: 'hover:bg-purple-50',
  orange: 'hover:bg-orange-50',
}

// Icon colors for notes
const noteIconColors: Record<NoteColor, string> = {
  yellow: 'text-yellow-700',
  blue: 'text-blue-700',
  green: 'text-green-700',
  red: 'text-red-700',
  purple: 'text-purple-700',
  orange: 'text-orange-700',
}

// Handle colors for drag grip
const noteHandleColors: Record<NoteColor, string> = {
  yellow: 'bg-yellow-200 hover:bg-yellow-300',
  blue: 'bg-blue-200 hover:bg-blue-300',
  green: 'bg-green-200 hover:bg-green-300',
  red: 'bg-red-200 hover:bg-red-300',
  purple: 'bg-purple-200 hover:bg-purple-300',
  orange: 'bg-orange-200 hover:bg-orange-300',
}

export default function NoteBlock({
  note,
  onUpdate,
  onDelete,
  isOverlay = false,
  disableDrag = false,
}: NoteBlockProps) {
  const noteId = `note-${note.id}`

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: noteId,
    disabled: disableDrag,
    data: {
      type: 'note',
      note,
    },
  })

  // Make the note card also droppable for drop detection
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `note-drop-${noteId}`,
    data: {
      type: 'note',
      note,
    },
  })

  // Combine both refs
  const setNodeRef = (node: HTMLElement | null) => {
    setSortableRef(node)
    setDroppableRef(node)
  }

  // Simple transform for Scratch-style (instant snap, no rubber band)
  const style = isOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition: transition || 'none',
      }

  const handleTogglePin = (e: React.MouseEvent) => {
    e.stopPropagation()
    onUpdate?.(note.id, { isPinned: !note.is_pinned })
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.confirm('Delete this note?')) {
      onDelete?.(note.id)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-note-card
      data-note-id={note.id}
      className={cn(
        // Scratch-style base: blocky, high-contrast, thicker borders
        'mb-1 rounded-lg border-2 select-none overflow-hidden flex',
        'font-family-sans font-semibold text-[11px] leading-tight transition-all duration-100',
        // Box shadow for depth
        'shadow-[0_2px_4px_rgba(0,0,0,0.2)]',
        noteBackgroundColors[note.color],
        noteBorderColors[note.color],
        noteHoverColors[note.color],
        // Dragging state
        isDragging && 'opacity-30',
        // Overlay state (being dragged)
        isOverlay && `shadow-[0_8px_16px_rgba(0,0,0,0.3)] ring-2 ${noteBorderColors[note.color]}`,
        // Hover effect - blocky lift
        !isDragging && !isOverlay && 'hover:translate-y-[-2px] hover:shadow-[0_4px_8px_rgba(0,0,0,0.3)]',
        // Pin indicator
        note.is_pinned && 'ring-1 ring-gray-500'
      )}
    >
      {/* Drag handle on the left */}
      {!disableDrag && (
        <div
          {...attributes}
          {...listeners}
          className={cn(
            'flex items-center justify-center w-5 shrink-0 cursor-grab active:cursor-grabbing transition-colors',
            'border-r-2 border-black border-opacity-10',
            noteHandleColors[note.color]
          )}
          title="Drag to move"
        >
          <GripVertical className={cn('h-3.5 w-3.5', noteIconColors[note.color])} />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 px-1.5 py-1 min-w-0">
        <div className="flex items-start gap-1.5 min-w-0">
          {/* Note icon */}
          <StickyNote className={cn('h-3 w-3 shrink-0 mt-0.5', noteIconColors[note.color])} />

          {/* Note content - truncates to 2 lines */}
          <span className="flex-1 line-clamp-2 text-gray-800 min-w-0">
            {note.content}
          </span>

          {/* Pin indicator */}
          {note.is_pinned && (
            <Pin className="h-3 w-3 shrink-0 text-gray-600" />
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={handleTogglePin}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-0.5 hover:bg-white/50 rounded transition-colors"
              title={note.is_pinned ? 'Unpin' : 'Pin'}
            >
              <Pin className={cn('h-2.5 w-2.5', note.is_pinned ? 'text-gray-700' : 'text-gray-400')} />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-0.5 hover:bg-red-100 rounded text-red-400 hover:text-red-600 transition-colors"
              title="Delete"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
