import { useDraggable } from '@dnd-kit/core'
import { Package, StickyNote, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DraggableTemplateProps {
  id: string
  icon: React.ReactNode
  label: string
  color: 'purple' | 'yellow'
}

function DraggableTemplate({ id, icon, label, color }: DraggableTemplateProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type: 'template', templateType: id.replace('template-', '') },
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'relative flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed cursor-grab active:cursor-grabbing transition-all',
        'font-semibold text-sm shadow-sm hover:shadow-md hover:scale-105',
        isDragging && 'opacity-50 scale-95',
        color === 'purple' && 'bg-gradient-to-r from-purple-100 to-purple-200 border-purple-400 text-purple-700 hover:from-purple-200 hover:to-purple-300',
        color === 'yellow' && 'bg-gradient-to-r from-yellow-100 to-yellow-200 border-yellow-400 text-yellow-700 hover:from-yellow-200 hover:to-yellow-300'
      )}
      title={`Drag to create ${label}`}
    >
      <div className="shrink-0">{icon}</div>
      <span>{label}</span>
      <Plus className="w-4 h-4 ml-auto shrink-0" />
    </div>
  )
}

export default function TemplateToolbar() {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 shadow-sm">
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
        Create:
      </span>
      <DraggableTemplate
        id="template-container"
        icon={<Package className="w-4 h-4" />}
        label="Truck Run"
        color="purple"
      />
      <DraggableTemplate
        id="template-note"
        icon={<StickyNote className="w-4 h-4" />}
        label="Note"
        color="yellow"
      />
    </div>
  )
}
