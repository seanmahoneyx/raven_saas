import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  Bell, AtSign, CheckSquare, ShieldCheck, Check, ExternalLink, MessageSquare,
} from 'lucide-react'
import { FolderTabs } from '@/components/ui/folder-tabs'
import { useNotifications, useMarkNotificationsRead, type Notification } from '@/api/notifications'
import { useMyTasks, type Task } from '@/api/collaboration'
import { useAllApprovals, useApproveRequest, useRejectRequest, type ApprovalRequest } from '@/api/approvals'
import { DirectMessages } from '@/components/collaboration/DirectMessages'
import { formatDistanceToNow } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { PageHeader } from '@/components/page'
import { PRIORITY_COLORS } from '@/lib/utils'

type HubTab = 'all' | 'mentions' | 'messages' | 'tasks' | 'approvals'

const typeColors: Record<string, { bg: string; text: string }> = {
  INFO: { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
  SUCCESS: { bg: 'rgba(34,197,94,0.1)', text: '#22c55e' },
  WARNING: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
  ERROR: { bg: 'rgba(239,68,68,0.1)', text: '#ef4444' },
  MENTION: { bg: 'rgba(139,92,246,0.1)', text: '#8b5cf6' },
  TASK: { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
  COMMENT: { bg: 'rgba(74,144,92,0.1)', text: 'var(--so-success, #4a905c)' },
}

const taskStatusConfig: Record<string, { color: string; label: string }> = {
  open: { color: 'var(--so-text-tertiary)', label: 'Open' },
  in_progress: { color: '#3b82f6', label: 'In Progress' },
  blocked: { color: '#f59e0b', label: 'Blocked' },
  complete: { color: 'var(--so-success, #4a905c)', label: 'Complete' },
  cancelled: { color: 'var(--so-text-tertiary)', label: 'Cancelled' },
}

const priorityColors = PRIORITY_COLORS

const approvalRuleBadge: Record<string, { label: string; bg: string; text: string }> = {
  po_amount_threshold: { label: 'High Value PO', bg: 'rgba(59,130,246,0.1)', text: 'rgb(59,130,246)' },
  so_low_margin: { label: 'Low Margin', bg: 'rgba(245,158,11,0.1)', text: 'rgb(245,158,11)' },
  credit_limit_exceeded: { label: 'Credit Limit', bg: 'rgba(239,68,68,0.1)', text: 'rgb(239,68,68)' },
  po_send_approval: { label: 'PO Send', bg: 'rgba(139,92,246,0.1)', text: 'rgb(139,92,246)' },
  price_list_approval: { label: 'Price List', bg: 'rgba(16,185,129,0.1)', text: 'rgb(16,185,129)' },
}

export default function NotificationHub() {
  usePageTitle('Notifications')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') as HubTab | null
  const [activeTab, setActiveTab] = useState<HubTab>(tabParam || 'all')

  // Data
  const { data: notifData } = useNotifications({ limit: 50 })
  const { data: mentionData } = useNotifications({ type: 'MENTION', limit: 50 })
  const { data: myTasksData } = useMyTasks()
  const { data: approvalsData } = useAllApprovals()
  const markRead = useMarkNotificationsRead()
  const approveRequest = useApproveRequest()
  const rejectRequest = useRejectRequest()

  // Approval dialog
  const [approvalDialog, setApprovalDialog] = useState<{ action: 'approve' | 'reject'; request: ApprovalRequest } | null>(null)
  const [decisionNote, setDecisionNote] = useState('')

  const notifications = notifData?.notifications ?? []
  const mentions = mentionData?.notifications ?? []
  const tasks = myTasksData?.results ?? []
  const approvals = approvalsData ?? []
  const unreadCount = notifData?.unread_count ?? 0

  const handleTabChange = (id: string) => {
    setActiveTab(id as HubTab)
    setSearchParams(id === 'all' ? {} : { tab: id })
  }

  const handleNotifClick = (n: Notification) => {
    if (!n.read) markRead.mutate([n.id])
    if (n.link) navigate(n.link)
  }

  const handleApprovalAction = () => {
    if (!approvalDialog) return
    const { action, request } = approvalDialog
    if (action === 'approve') {
      approveRequest.mutate({ id: request.id, note: decisionNote })
    } else {
      rejectRequest.mutate({ id: request.id, note: decisionNote })
    }
    setApprovalDialog(null)
    setDecisionNote('')
  }

  const renderNotificationRow = (n: Notification) => {
    const tc = typeColors[n.type] || typeColors.INFO
    return (
      <button
        key={n.id}
        onClick={() => handleNotifClick(n)}
        className="w-full text-left flex items-start gap-3 px-5 py-3.5 transition-colors hover:opacity-90"
        style={{
          background: n.read ? 'transparent' : 'rgba(59,130,246,0.03)',
          borderBottom: '1px solid var(--so-border-light)',
        }}
      >
        <span
          className="shrink-0 mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
          style={{ background: tc.bg, color: tc.text }}
        >
          {n.type}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium" style={{ color: n.read ? 'var(--so-text-secondary)' : 'var(--so-text-primary)' }}>
            {n.title}
          </p>
          {n.message && (
            <p className="text-[12px] mt-0.5 truncate" style={{ color: 'var(--so-text-tertiary)' }}>{n.message}</p>
          )}
          <p className="text-[11px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
          </p>
        </div>
        {n.link && <ExternalLink className="shrink-0 mt-1 h-3.5 w-3.5" style={{ color: 'var(--so-text-tertiary)' }} />}
      </button>
    )
  }

  const renderTaskRow = (t: Task) => {
    const sc = taskStatusConfig[t.status] || taskStatusConfig.open
    return (
      <div
        key={t.id}
        className="flex items-center gap-3 px-5 py-3.5"
        style={{ borderBottom: '1px solid var(--so-border-light)' }}
      >
        <span
          className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
          style={{ background: 'var(--so-bg)', color: sc.color }}
        >
          {sc.label}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium" style={{ color: 'var(--so-text-primary)' }}>{t.title}</p>
          <div className="flex items-center gap-3 mt-0.5">
            {t.priority !== 'normal' && (
              <span className="text-[11px] font-medium" style={{ color: priorityColors[t.priority] }}>
                {t.priority.toUpperCase()}
              </span>
            )}
            {t.due_date && (
              <span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>
                Due {new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
            <span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>
              {t.content_type_model} #{t.object_id}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>
              {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>
    )
  }

  const renderApprovalRow = (a: ApprovalRequest) => {
    const badge = approvalRuleBadge[a.rule_code] || { label: a.rule_code, bg: 'var(--so-bg)', text: 'var(--so-text-secondary)' }
    return (
      <div
        key={a.id}
        className="flex items-center gap-3 px-5 py-3.5"
        style={{ borderBottom: '1px solid var(--so-border-light)' }}
      >
        <span
          className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
          style={{ background: badge.bg, color: badge.text }}
        >
          {badge.label}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium" style={{ color: 'var(--so-text-primary)' }}>
            {a.rule_description}
          </p>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>
              {a.order_display}
            </span>
            {a.amount && (
              <span className="text-[11px] font-mono" style={{ color: 'var(--so-text-secondary)' }}>
                ${parseFloat(a.amount).toLocaleString()}
              </span>
            )}
            <span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>
              by {a.requestor_name} {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
        {a.status === 'pending' && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              className={primaryBtnClass + ' !py-1 !px-3 !text-[12px]'}
              style={primaryBtnStyle}
              onClick={() => setApprovalDialog({ action: 'approve', request: a })}
            >
              Approve
            </button>
            <button
              className={outlineBtnClass + ' !py-1 !px-3 !text-[12px]'}
              style={outlineBtnStyle}
              onClick={() => setApprovalDialog({ action: 'reject', request: a })}
            >
              Reject
            </button>
          </div>
        )}
        {a.status !== 'pending' && (
          <span
            className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase"
            style={{
              background: a.status === 'approved' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: a.status === 'approved' ? 'rgb(34,197,94)' : 'rgb(239,68,68)',
            }}
          >
            {a.status}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-7 pb-16">

        {/* Header */}
        <PageHeader
          title="Notifications"
          description="Messages, tasks, and approvals across all transactions"
          trailing={unreadCount > 0 ? (
            <button
              className="flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg hover:opacity-80"
              style={{ color: 'var(--so-accent)' }}
              onClick={() => markRead.mutate(undefined)}
            >
              <Check className="h-3.5 w-3.5" />
              Mark all read ({unreadCount})
            </button>
          ) : undefined}
        />

        {/* Tabs */}
        <div className="mb-5 animate-in delay-1">
          <FolderTabs
            tabs={[
              { id: 'all', label: 'All', icon: <Bell className="h-3.5 w-3.5" /> },
              { id: 'messages', label: 'Messages', icon: <MessageSquare className="h-3.5 w-3.5" /> },
              { id: 'mentions', label: 'Mentions', icon: <AtSign className="h-3.5 w-3.5" /> },
              { id: 'tasks', label: 'My Tasks', icon: <CheckSquare className="h-3.5 w-3.5" /> },
              { id: 'approvals', label: 'Approvals', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
            ]}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        </div>

        {/* Content */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          {activeTab !== 'messages' && (
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-[13px] font-semibold" style={{ color: 'var(--so-text-primary)' }}>
                {{ all: 'All Notifications', mentions: 'Mentions', messages: 'Messages', tasks: 'My Tasks', approvals: 'Approvals' }[activeTab]}
              </span>
              <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
                {{ all: notifications.length, mentions: mentions.length, messages: 0, tasks: tasks.length, approvals: approvals.length }[activeTab]} items
              </span>
            </div>
          )}

          {activeTab === 'messages' && (
            <div style={{ minHeight: 500 }}>
              <DirectMessages />
            </div>
          )}

          {activeTab === 'all' && (
            notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <Bell className="h-10 w-10" style={{ color: 'var(--so-text-tertiary)', opacity: 0.3 }} />
                <span className="text-[14px]" style={{ color: 'var(--so-text-tertiary)' }}>No notifications yet</span>
              </div>
            ) : (
              notifications.map(renderNotificationRow)
            )
          )}

          {activeTab === 'mentions' && (
            mentions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <AtSign className="h-10 w-10" style={{ color: 'var(--so-text-tertiary)', opacity: 0.3 }} />
                <span className="text-[14px]" style={{ color: 'var(--so-text-tertiary)' }}>No mentions yet</span>
              </div>
            ) : (
              mentions.map(renderNotificationRow)
            )
          )}

          {activeTab === 'tasks' && (
            tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <CheckSquare className="h-10 w-10" style={{ color: 'var(--so-text-tertiary)', opacity: 0.3 }} />
                <span className="text-[14px]" style={{ color: 'var(--so-text-tertiary)' }}>No tasks assigned to you</span>
              </div>
            ) : (
              tasks.map(renderTaskRow)
            )
          )}

          {activeTab === 'approvals' && (
            approvals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <ShieldCheck className="h-10 w-10" style={{ color: 'var(--so-text-tertiary)', opacity: 0.3 }} />
                <span className="text-[14px]" style={{ color: 'var(--so-text-tertiary)' }}>No approvals</span>
              </div>
            ) : (
              approvals.map(renderApprovalRow)
            )
          )}
        </div>
      </div>

      {/* Approval Decision Dialog */}
      <Dialog open={!!approvalDialog} onOpenChange={() => { setApprovalDialog(null); setDecisionNote('') }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {approvalDialog?.action === 'approve' ? 'Approve Request' : 'Reject Request'}
            </DialogTitle>
            <DialogDescription>
              {approvalDialog?.request.rule_description}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              value={decisionNote}
              onChange={e => setDecisionNote(e.target.value)}
              placeholder="Optional note..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <button
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={() => { setApprovalDialog(null); setDecisionNote('') }}
            >
              Cancel
            </button>
            <button
              className={primaryBtnClass}
              style={{
                ...primaryBtnStyle,
                ...(approvalDialog?.action === 'reject' ? { background: '#ef4444' } : {}),
              }}
              onClick={handleApprovalAction}
            >
              {approvalDialog?.action === 'approve' ? 'Approve' : 'Reject'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
