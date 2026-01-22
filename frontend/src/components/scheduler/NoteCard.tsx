import { useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import type { SchedulerNote, NoteColor } from '@/types/api'
import { StickyNote, Pin, Trash2 } from 'lucide-react'

interface NoteCardProps {
  note: SchedulerNote
  onUpdate?: (noteId: number, updates: { content?: string; color?: NoteColor; isPinned?: boolean }) => void
  onDelete?: (noteId: number) => void
  isDragging?: boolean
  isOverlay?: boolean
  disableDrag?: boolean
  /** Whether a drag is currently active (for showing drop indicator) */
  isDragActive?: boolean
}

// Color classes for note backgrounds (similar to order status backgrounds)
const noteBackgroundColors: Record<NoteColor, string> = {
  yellow: 'bg-yellow-100',
  blue: 'bg-blue-100',
  green: 'bg-green-100',
  red: 'bg-red-100',
  purple: 'bg-purple-100',
  orange: 'bg-orange-100',
}

// Border colors for notes
const noteBorderColors: Record<NoteColor, string> = {
  yellow: 'border-yellow-400',
  blue: 'border-blue-400',
  green: 'border-green-400',
  red: 'border-red-400',
  purple: 'border-purple-400',
  orange: 'border-orange-400',
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
  yellow: 'text-yellow-600',
  blue: 'text-blue-600',
  green: 'text-green-600',
  red: 'text-red-600',
  purple: 'text-purple-600',
  orange: 'text-orange-600',
}

export default function NoteCard({
  note,
  onUpdate,
  onDelete,
  isDragging,
  isOverlay,
  disableDrag,
  isDragActive,
}: NoteCardProps) {
  const noteId = `note-${note.id}`

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging: _isSortableDragging, // Available for future use
  } = useSortable({
    id: noteId,
    disabled: disableDrag,
    data: {
      type: 'note',
      note,
    },
  })

  // Make the note card also droppable for order-on-note drops (to create groups)
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
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

  // Apply sortable transform for smooth reordering animation
  const style = isOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition: transition || undefined,
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
    <div className="relative">
      {/* Drop indicator line above card - shows when hovering during drag */}
      {isOver && isDragActive && (
        <div className="absolute -top-0.5 left-0 right-0 h-1 bg-purple-500 rounded-full z-10" />
      )}
      <div
        ref={setNodeRef}
        style={style}
        data-note-card
        data-note-id={note.id}
        {...attributes}
        {...(disableDrag ? {} : listeners)}
        className={cn(
          'transition-all duration-150',
          'mb-0.5 px-1.5 py-1 rounded border shadow-sm select-none overflow-hidden',
          'text-[11px] leading-tight',
          noteBackgroundColors[note.color],
          noteBorderColors[note.color],
          noteHoverColors[note.color],
          !disableDrag && 'cursor-move',
          disableDrag && 'cursor-default',
          isDragging && 'opacity-40',
          isOverlay && 'shadow-xl ring-2 ring-yellow-500',
          // Visual indicator when something is being dragged over this note
          isOver && isDragActive && 'ring-2 ring-purple-500 ring-offset-1 bg-purple-50',
          note.is_pinned && 'ring-1 ring-gray-400'
        )}
      >
        {/* Main content row */}
        <div className="flex items-start gap-1.5 min-w-0">
          {/* Note icon */}
          <StickyNote className={cn('h-3 w-3 shrink-0 mt-0.5', noteIconColors[note.color])} />

          {/* Note content - truncates to 2 lines */}
          <span className="flex-1 line-clamp-2 text-gray-800 min-w-0">
            {note.content}
          </span>

          {/* Pin indicator */}
          {note.is_pinned && (
            <Pin className="h-3 w-3 shrink-0 text-gray-500" />
          )}

          {/* Action buttons - always visible on right */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={handleTogglePin}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-0.5 hover:bg-white/50 rounded"
              title={note.is_pinned ? 'Unpin' : 'Pin'}
            >
              <Pin className={cn('h-2.5 w-2.5', note.is_pinned ? 'text-gray-700' : 'text-gray-400')} />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-0.5 hover:bg-red-100 rounded text-red-400 hover:text-red-600"
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
