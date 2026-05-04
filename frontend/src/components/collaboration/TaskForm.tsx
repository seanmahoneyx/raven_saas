import { useState } from 'react'
import { useCreateTask } from '@/api/collaboration'
import { useUsers } from '@/api/users'

interface TaskFormProps {
  contentType: string
  objectId: number
  onDone: () => void
}

export function TaskForm({ contentType, objectId, onDone }: TaskFormProps) {
  const [title, setTitle] = useState('')
  const [assignedTo, setAssignedTo] = useState<number | null>(null)
  const [priority, setPriority] = useState('normal')
  const [dueDate, setDueDate] = useState('')

  const createTask = useCreateTask()
  const { data: usersData } = useUsers()
  const users = usersData ?? []

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    createTask.mutate(
      {
        content_type: contentType,
        object_id: objectId,
        title: title.trim(),
        assigned_to: assignedTo,
        priority,
        due_date: dueDate || null,
      },
      { onSuccess: () => { onDone(); setTitle(''); setAssignedTo(null); setPriority('normal'); setDueDate('') } }
    )
  }

  const inputStyle = {
    background: 'var(--so-bg)',
    borderColor: 'var(--so-border)',
    color: 'var(--so-text-primary)',
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Task title..."
        className="w-full px-2.5 py-1.5 rounded-md border text-[13px] outline-none"
        style={inputStyle}
        autoFocus
      />
      <div className="flex items-center gap-2">
        <select
          value={assignedTo ?? ''}
          onChange={e => setAssignedTo(e.target.value ? Number(e.target.value) : null)}
          className="flex-1 px-2 py-1 rounded-md border text-[12px] outline-none"
          style={inputStyle}
        >
          <option value="">Unassigned</option>
          {(Array.isArray(users) ? users : []).map((u: { id: number; username: string; name?: string }) => (
            <option key={u.id} value={u.id}>{u.name || u.username}</option>
          ))}
        </select>
        <select
          value={priority}
          onChange={e => setPriority(e.target.value)}
          className="px-2 py-1 rounded-md border text-[12px] outline-none"
          style={inputStyle}
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="flex-1 px-2 py-1 rounded-md border text-[12px] outline-none"
          style={inputStyle}
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onDone}
            className="px-3 py-1 rounded-md text-[12px] font-medium"
            style={{ color: 'var(--so-text-secondary)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || createTask.isPending}
            className="px-3 py-1 rounded-md text-[12px] font-medium"
            style={{
              background: 'var(--so-accent)',
              color: '#fff',
              opacity: !title.trim() || createTask.isPending ? 0.5 : 1,
            }}
          >
            Create
          </button>
        </div>
      </div>
    </form>
  )
}
