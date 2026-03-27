import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Check, ExternalLink, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useNotifications, useMarkNotificationsRead, type Notification } from '@/api/notifications'
import { useMyPendingApprovals } from '@/api/approvals'
import { useNotificationSync } from '@/hooks/useRealtimeSync'
import { formatDistanceToNow } from 'date-fns'

const typeColors: Record<string, string> = {
  INFO: 'bg-blue-500',
  SUCCESS: 'bg-green-500',
  WARNING: 'bg-amber-500',
  ERROR: 'bg-red-500',
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data } = useNotifications()
  const { data: pendingApprovals } = useMyPendingApprovals()
  const markRead = useMarkNotificationsRead()
  useNotificationSync()

  const unreadCount = data?.unread_count || 0
  const approvalCount = pendingApprovals?.length || 0
  const totalBadge = unreadCount + approvalCount
  const notifications = data?.notifications || []

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleClick = (notification: Notification) => {
    if (!notification.read) {
      markRead.mutate([notification.id])
    }
    if (notification.link) {
      navigate(notification.link)
    }
    setOpen(false)
  }

  const handleMarkAllRead = () => {
    markRead.mutate(undefined)
  }

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="relative gap-1.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        onClick={() => setOpen(!open)}
        title="Notifications & Approvals"
      >
        <Mail className="h-4 w-4" />
        {totalBadge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white animate-in zoom-in">
            {totalBadge > 9 ? '9+' : totalBadge}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-lg border border-border bg-popover shadow-xl">
          {/* Approval banner */}
          {approvalCount > 0 && (
            <button
              onClick={() => { navigate('/approvals'); setOpen(false) }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 border-b border-border"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <ShieldCheck className="h-4 w-4 text-red-600 dark:text-red-400" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {approvalCount} pending approval{approvalCount !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-muted-foreground">Review and approve in your inbox</p>
              </div>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </button>
          )}

          {/* Notifications header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Check className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No notifications
              </div>
            ) : (
              notifications.slice(0, 8).map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50',
                    !n.read && 'bg-primary/5'
                  )}
                >
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', typeColors[n.type] || typeColors.INFO)} />
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm', !n.read ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                      {n.title}
                    </p>
                    {n.message && (
                      <p className="mt-0.5 text-xs text-muted-foreground truncate">{n.message}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {n.link && <ExternalLink className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
