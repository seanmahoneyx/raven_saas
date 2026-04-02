import { useState } from 'react'
import { CheckCircle2, Circle, Clock, AlertTriangle, Ban, Plus, ChevronDown } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useTasks, useUpdateTask, type Task } from '@/api/collaboration'
import { PRIORITY_COLORS } from '@/lib/utils'
import { TaskForm } from './TaskForm'

const statusConfig: Record<string, { icon: typeof Circle; color: string; label: string }> = {
  open: { icon: Circle, color: 'var(--so-text-tertiary)', label: 'Open' },
  in_progress: { icon: Clock, color: '#3b82f6', label: 'In Progress' },
  blocked: { icon: AlertTriangle, color: '#f59e0b', label: 'Blocked' },
  complete: { icon: CheckCircle2, color: 'var(--so-success, #4a905c)', label: 'Complete' },
  cancelled: { icon: Ban, color: 'var(--so-text-tertiary)', label: 'Cancelled' },
}

const priorityColors = PRIORITY_COLORS

interface TaskItemProps {
  task: Task
}

function TaskItem({ task }: TaskItemProps) {
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const updateTask = useUpdateTask()
  const config = statusConfig[task.status] || statusConfig.open
  const Icon = config.icon

  const handleStatusChange = (newStatus: string) => {
    updateTask.mutate({ id: task.id, status: newStatus })
    setShowStatusMenu(false)
  }

  return (
    <div
      className="flex items-start gap-2.5 py-2.5 px-3"
      style={{ borderBottom: '1px solid var(--so-border-light)' }}
    >
      {/* Status icon (clickable) */}
      <div className="relative shrink-0 mt-0.5">
        <button
          className="hover:opacity-70 transition-opacity"
          onClick={() => setShowStatusMenu(!showStatusMenu)}
        >
          <Icon className="h-4 w-4" style={{ color: config.color }} />
        </button>

        {showStatusMenu && (
          <div
            className="absolute top-full left-0 mt-1 rounded-lg border overflow-hidden z-50"
            style={{
              background: 'var(--so-surface)',
              borderColor: 'var(--so-border)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
              minWidth: 140,
            }}
          >
            {Object.entries(statusConfig).map(([key, cfg]) => {
              const StatusIcon = cfg.icon
              return (
                <button
                  key={key}
                  className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-[12px] hover:opacity-80"
                  style={{
                    background: task.status === key ? 'var(--so-border-light)' : 'transparent',
                    color: 'var(--so-text-primary)',
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleStatusChange(key)
                  }}
                >
                  <StatusIcon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
                  {cfg.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-[13px] font-medium truncate"
            style={{
              color: task.status === 'complete' || task.status === 'cancelled'
                ? 'var(--so-text-tertiary)'
                : 'var(--so-text-primary)',
              textDecoration: task.status === 'complete' ? 'line-through' : 'none',
            }}
          >
            {task.title}
          </span>
          {task.priority !== 'normal' && (
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                color: priorityColors[task.priority],
                background: task.priority === 'urgent' ? 'rgba(239,68,68,0.1)' : task.priority === 'high' ? 'rgba(245,158,11,0.1)' : 'transparent',
              }}
            >
              {task.priority}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {task.assigned_to_name && (
            <span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>
              {task.assigned_to_name}
            </span>
          )}
          {task.due_date && (
            <span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>
              Due {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          <span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>
            {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
          </span>
        </div>
      </div>
    </div>
  )
}

interface TaskListProps {
  contentType: string
  objectId: number
}

export function TaskList({ contentType, objectId }: TaskListProps) {
  const [showForm, setShowForm] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const { data, isLoading } = useTasks(contentType, objectId)

  const allTasks = data?.results ?? []
  const tasks = filterStatus ? allTasks.filter(t => t.status === filterStatus) : allTasks
  const openCount = allTasks.filter(t => t.status !== 'complete' && t.status !== 'cancelled').length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>
            {openCount} open
          </span>
          <div className="relative">
            <button
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded"
              style={{ color: 'var(--so-text-tertiary)', background: filterStatus ? 'var(--so-border-light)' : 'transparent' }}
              onClick={() => setFilterStatus(filterStatus ? null : 'open')}
            >
              {filterStatus ? statusConfig[filterStatus]?.label || 'All' : 'All'}
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        </div>
        <button
          className="flex items-center gap-1 text-[12px] font-medium px-2 py-1 rounded hover:opacity-80"
          style={{ color: 'var(--so-accent)' }}
          onClick={() => setShowForm(!showForm)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      {/* New task form */}
      {showForm && (
        <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
          <TaskForm
            contentType={contentType}
            objectId={objectId}
            onDone={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</span>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <CheckCircle2 className="h-8 w-8" style={{ color: 'var(--so-text-tertiary)', opacity: 0.4 }} />
            <span className="text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>
              {filterStatus ? 'No tasks with this status' : 'No tasks yet'}
            </span>
          </div>
        ) : (
          tasks.map(task => <TaskItem key={task.id} task={task} />)
        )}
      </div>
    </div>
  )
}
