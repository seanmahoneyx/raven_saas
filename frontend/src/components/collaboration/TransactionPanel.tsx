import { useState, useEffect } from 'react'
import { X, MessageSquare, CheckSquare, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { CommentThread } from './CommentThread'
import { TaskList } from './TaskList'

type PanelTab = 'messages' | 'tasks'

interface TransactionPanelProps {
  contentType: string
  objectId: number
  open: boolean
  onClose: () => void
  label?: string
}

export function TransactionPanel({ contentType, objectId, open, onClose, label }: TransactionPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('messages')
  const navigate = useNavigate()

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.08)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col print:hidden"
        style={{
          width: 380,
          background: 'var(--so-surface)',
          borderLeft: '1px solid var(--so-border)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
          animation: 'slideInRight 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--so-border)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[14px] font-semibold truncate" style={{ color: 'var(--so-text-primary)' }}>
              {label || 'Collaboration'}
            </span>
            <button
              className="shrink-0 flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded hover:opacity-70"
              style={{ color: 'var(--so-accent)' }}
              onClick={() => {
                navigate(`/notifications?content_type=${contentType}&object_id=${objectId}`)
                onClose()
              }}
              title="View in Notification Hub"
            >
              <ExternalLink className="h-3 w-3" />
              Hub
            </button>
          </div>
          <button
            className="shrink-0 flex items-center justify-center h-7 w-7 rounded-md hover:opacity-70"
            style={{ color: 'var(--so-text-tertiary)' }}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex shrink-0"
          style={{ borderBottom: '1px solid var(--so-border-light)' }}
        >
          {([
            { id: 'messages' as PanelTab, label: 'Messages', icon: MessageSquare },
            { id: 'tasks' as PanelTab, label: 'Tasks', icon: CheckSquare },
          ]).map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-medium transition-colors"
                style={{
                  color: isActive ? 'var(--so-accent)' : 'var(--so-text-tertiary)',
                  borderBottom: isActive ? '2px solid var(--so-accent)' : '2px solid transparent',
                }}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          {activeTab === 'messages' ? (
            <CommentThread contentType={contentType} objectId={objectId} />
          ) : (
            <TaskList contentType={contentType} objectId={objectId} />
          )}
        </div>
      </div>

      {/* Animation keyframe */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @media print {
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </>
  )
}
