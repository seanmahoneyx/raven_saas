import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { NoteColor } from '@/types/api'

interface CreateNoteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: {
    content: string
    color: NoteColor
    scheduledDate?: string | null
    truckId?: number | null
  }) => void
  defaultDate?: string | null
  defaultTruckId?: number | null
}

const colorOptions: { value: NoteColor; label: string; bgClass: string; borderClass: string }[] = [
  { value: 'yellow', label: 'Yellow', bgClass: 'bg-yellow-200', borderClass: 'border-yellow-400' },
  { value: 'blue', label: 'Blue', bgClass: 'bg-blue-200', borderClass: 'border-blue-400' },
  { value: 'green', label: 'Green', bgClass: 'bg-green-200', borderClass: 'border-green-400' },
  { value: 'red', label: 'Red', bgClass: 'bg-red-200', borderClass: 'border-red-400' },
  { value: 'purple', label: 'Purple', bgClass: 'bg-purple-200', borderClass: 'border-purple-400' },
  { value: 'orange', label: 'Orange', bgClass: 'bg-orange-200', borderClass: 'border-orange-400' },
]

export default function CreateNoteDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultDate,
  defaultTruckId,
}: CreateNoteDialogProps) {
  const [content, setContent] = useState('')
  const [color, setColor] = useState<NoteColor>('yellow')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return

    onSubmit({
      content: content.trim(),
      color,
      scheduledDate: defaultDate,
      truckId: defaultTruckId,
    })

    // Reset form
    setContent('')
    setColor('yellow')
    onOpenChange(false)
  }

  const handleCancel = () => {
    setContent('')
    setColor('yellow')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-lg">Add Note</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Content textarea */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Note Content
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full p-2 border rounded-md text-sm resize-none"
                rows={4}
                placeholder="Enter your note..."
                autoFocus
              />
            </div>

            {/* Color picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Color
              </label>
              <div className="flex gap-2">
                {colorOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setColor(opt.value)}
                    className={cn(
                      'w-8 h-8 rounded-full border-2 transition-all',
                      opt.bgClass,
                      color === opt.value ? `${opt.borderClass} ring-2 ring-offset-2 ring-gray-400` : 'border-transparent'
                    )}
                    title={opt.label}
                  />
                ))}
              </div>
            </div>

            {/* Info about attachment */}
            {defaultDate && (
              <p className="text-xs text-gray-500">
                This note will be attached to {defaultDate}
                {defaultTruckId ? ' on the selected truck' : ' (all trucks)'}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!content.trim()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Note
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
