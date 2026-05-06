import { useState } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useUserAuditReport } from '@/api/userAudit'
import { useUsers } from '@/api/users'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { outlineBtnClass, outlineBtnStyle } from '@/components/ui/button-styles'
import { PageHeader } from '@/components/page'

const ACTION_STYLES: Record<string, { bg: string; color: string }> = {
  Created: { bg: 'rgba(74,144,92,0.1)', color: 'var(--so-success, #4a905c)' },
  Changed: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
  Deleted: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
}

export default function UserAuditReport() {
  usePageTitle('User Audit Report')

  const today = new Date().toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

  const ALL = '__all__'
  const [userId, setUserId] = useState(ALL)
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo)
  const [dateTo, setDateTo] = useState(today)
  const [modelType, setModelType] = useState(ALL)
  const [actionType, setActionType] = useState(ALL)

  const { data: users } = useUsers()
  const { data, isLoading } = useUserAuditReport({
    user_id: userId !== ALL ? parseInt(userId, 10) : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    model_types: modelType !== ALL ? modelType : undefined,
    action_types: actionType !== ALL ? actionType : undefined,
    limit: 300,
  })

  const results = data?.results ?? []
  const availableModels = data?.available_models ?? []

  const handleReset = () => {
    setUserId(ALL)
    setDateFrom(thirtyDaysAgo)
    setDateTo(today)
    setModelType(ALL)
    setActionType(ALL)
  }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-7 pb-16">

        <PageHeader
          title="User Audit Report"
          description="Track all changes made by users across the system"
        />

        {/* Filters */}
        <div className="rounded-[14px] border overflow-hidden mb-6 animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Filters</span>
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-3">
              <div>
                <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>User</div>
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger className="h-9 text-sm border rounded-md" style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                    <SelectValue placeholder="All Users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All Users</SelectItem>
                    {users?.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name || u.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>From</div>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-9 text-sm border rounded-md px-2"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
              <div>
                <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>To</div>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-9 text-sm border rounded-md px-2"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
              <div>
                <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Record Type</div>
                <Select value={modelType} onValueChange={setModelType}>
                  <SelectTrigger className="h-9 text-sm border rounded-md" style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All Types</SelectItem>
                    {availableModels.map((m) => (
                      <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Action</div>
                <Select value={actionType} onValueChange={setActionType}>
                  <SelectTrigger className="h-9 text-sm border rounded-md" style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}>
                    <SelectValue placeholder="All Actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All Actions</SelectItem>
                    <SelectItem value="created">Created</SelectItem>
                    <SelectItem value="changed">Changed</SelectItem>
                    <SelectItem value="deleted">Deleted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <button className={outlineBtnClass} style={outlineBtnStyle} onClick={handleReset}>
                Reset Filters
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">
              Audit Trail
            </span>
            <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
              {results.length} {results.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          {isLoading ? (
            <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
          ) : results.length === 0 ? (
            <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
              No audit entries found for the selected filters
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Date & Time', 'User', 'Action', 'Type', 'Record', 'Details'].map((h) => (
                      <th
                        key={h}
                        className="text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 text-left"
                        style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((entry, idx) => {
                    const actionStyle = ACTION_STYLES[entry.action] || ACTION_STYLES.Changed
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                        <td className="py-3 px-4 whitespace-nowrap" style={{ color: 'var(--so-text-secondary)' }}>
                          <div className="text-[13px]">{new Date(entry.timestamp).toLocaleDateString()}</div>
                          <div className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium" style={{ color: 'var(--so-text-primary)' }}>
                          {entry.user}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider"
                            style={{ background: actionStyle.bg, color: actionStyle.color }}
                          >
                            {entry.action}
                          </span>
                        </td>
                        <td className="py-3 px-4" style={{ color: 'var(--so-text-secondary)' }}>
                          {entry.model_label}
                        </td>
                        <td className="py-3 px-4 font-mono text-[13px]" style={{ color: 'var(--so-text-primary)' }}>
                          {entry.record_label}
                        </td>
                        <td className="py-3 px-4 text-[13px]" style={{ color: 'var(--so-text-secondary)', maxWidth: '300px' }}>
                          {entry.summary}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
