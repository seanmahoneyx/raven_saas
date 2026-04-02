import { MessageSquare } from 'lucide-react'
import { useTasks, useComments } from '@/api/collaboration'

interface PanelToggleButtonProps {
  contentType: string
  objectId: number
  onClick: () => void
  isOpen: boolean
}

export function PanelToggleButton({ contentType, objectId, onClick, isOpen }: PanelToggleButtonProps) {
  const { data: commentsData } = useComments(contentType, objectId)
  const { data: tasksData } = useTasks(contentType, objectId)

  const commentCount = commentsData?.count ?? 0
  const taskCount = tasksData?.count ?? 0
  const totalCount = commentCount + taskCount

  return (
    <button
      onClick={onClick}
      className="fixed right-6 bottom-6 z-30 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all hover:shadow-xl print:hidden"
      style={{
        background: isOpen ? 'var(--so-text-primary)' : 'var(--so-accent)',
        color: '#fff',
      }}
      title="Toggle collaboration panel"
    >
      <MessageSquare className="h-4 w-4" />
      <span className="text-[13px] font-medium">
        {isOpen ? 'Close' : 'Collaborate'}
      </span>
      {!isOpen && totalCount > 0 && (
        <span
          className="flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-[10px] font-bold"
          style={{ background: 'rgba(255,255,255,0.25)' }}
        >
          {totalCount}
        </span>
      )}
    </button>
  )
}
