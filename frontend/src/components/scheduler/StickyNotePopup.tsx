import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NoteColor } from '@/types/api'

interface StickyNotePopupProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: { content: string; color: NoteColor }) => void
  position?: { x: number; y: number } | null
}

const colorOptions: { value: NoteColor; bgClass: string; borderClass: string }[] = [
  { value: 'yellow', bgClass: 'bg-yellow-200', borderClass: 'border-yellow-400' },
  { value: 'blue', bgClass: 'bg-blue-200', borderClass: 'border-blue-400' },
  { value: 'green', bgClass: 'bg-green-200', borderClass: 'border-green-400' },
  { value: 'red', bgClass: 'bg-red-200', borderClass: 'border-red-400' },
  { value: 'purple', bgClass: 'bg-purple-200', borderClass: 'border-purple-400' },
  { value: 'orange', bgClass: 'bg-orange-200', borderClass: 'border-orange-400' },
]

const colorBgClasses: Record<NoteColor, string> = {
  yellow: 'bg-yellow-100',
  blue: 'bg-blue-100',
  green: 'bg-green-100',
  red: 'bg-red-100',
  purple: 'bg-purple-100',
  orange: 'bg-orange-100',
}

export default function StickyNotePopup({
  isOpen,
  onClose,
  onSubmit,
  position,
}: StickyNotePopupProps) {
  const [content, setContent] = useState('')
  const [color, setColor] = useState<NoteColor>('yellow')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isOpen])

  const handleSubmit = () => {
    if (!content.trim()) return

    onSubmit({
      content: content.trim(),
      color,
    })

    // Reset form
    setContent('')
    setColor('yellow')
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter or Ctrl/Cmd + Enter to submit
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    // Escape to close
    if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className={cn(
        'fixed z-50 w-64 rounded-lg shadow-2xl border-2 overflow-hidden',
        colorBgClasses[color],
        'border-gray-300'
      )}
      style={{
        top: position?.y ?? 100,
        left: position?.x ?? window.innerWidth - 300,
      }}
    >
      {/* Header with close button */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200/50">
        <span className="text-xs font-medium text-gray-600">New Note</span>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 hover:bg-white/50 rounded text-gray-500 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content textarea */}
      <div className="p-3">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full h-24 p-2 text-sm text-gray-900 bg-white border border-gray-300 rounded resize-none focus:outline-none focus:ring-2 focus:ring-gray-400 placeholder:text-gray-400"
          placeholder="Type your note..."
        />
      </div>

      {/* Footer with color picker and add button */}
      <div className="px-3 pb-3 flex items-center justify-between">
        {/* Color picker */}
        <div className="flex gap-1.5">
          {colorOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setColor(opt.value)}
              className={cn(
                'w-5 h-5 rounded-full border-2 transition-all',
                opt.bgClass,
                color === opt.value ? `${opt.borderClass} ring-2 ring-offset-1 ring-gray-400` : 'border-transparent'
              )}
              title={opt.value}
            />
          ))}
        </div>

        {/* Add button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!content.trim()}
          className="px-3 py-1 text-xs font-medium bg-gray-800 text-white rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>

      {/* Keyboard hint */}
      <div className="px-3 pb-2 text-[10px] text-gray-400">
        Enter to add, Shift+Enter for new line
      </div>
    </div>
  )
}
