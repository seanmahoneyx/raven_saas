import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ShieldCheck, CheckCircle2, XCircle, Clock, Filter,
} from 'lucide-react'
import { useAllApprovals, useMyPendingApprovals, useApproveRequest, useRejectRequest } from '@/api/approvals'
import type { ApprovalRequest } from '@/api/approvals'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { formatDistanceToNow } from 'date-fns'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { PageHeader } from '@/components/page'
import { formatCurrency } from '@/lib/format'

const TABS = [
  { key: 'pending', label: 'Pending', icon: Clock },
  { key: 'approved', label: 'Approved', icon: CheckCircle2 },
  { key: 'rejected', label: 'Rejected', icon: XCircle },
  { key: 'all', label: 'All', icon: Filter },
] as const

type TabKey = typeof TABS[number]['key']

const ruleBadgeConfig: Record<string, { label: string; bg: string; text: string }> = {
  'po_amount_threshold': { label: 'High Value PO', bg: 'rgba(59,130,246,0.1)', text: 'rgb(59,130,246)' },
  'so_low_margin': { label: 'Low Margin', bg: 'rgba(245,158,11,0.1)', text: 'rgb(245,158,11)' },
  'credit_limit_exceeded': { label: 'Credit Limit', bg: 'rgba(239,68,68,0.1)', text: 'rgb(239,68,68)' },
  'po_send_approval': { label: 'PO Send', bg: 'rgba(139,92,246,0.1)', text: 'rgb(139,92,246)' },
  'price_list_approval': { label: 'Price List', bg: 'rgba(16,185,129,0.1)', text: 'rgb(16,185,129)' },
}

function RuleBadge({ code }: { code: string }) {
  const config = ruleBadgeConfig[code] || { label: code, bg: 'var(--so-bg)', text: 'var(--so-text-secondary)' }
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: config.bg, color: config.text }}
    >
      {config.label}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    pending: { label: 'Pending', bg: 'rgba(245,158,11,0.1)', text: 'rgb(245,158,11)' },
    approved: { label: 'Approved', bg: 'rgba(34,197,94,0.1)', text: 'rgb(34,197,94)' },
    rejected: { label: 'Rejected', bg: 'rgba(239,68,68,0.1)', text: 'rgb(239,68,68)' },
    expired: { label: 'Expired', bg: 'var(--so-bg)', text: 'var(--so-text-tertiary)' },
  }
  const config = map[status] || map.pending
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: config.bg, color: config.text }}
    >
      {config.label}
    </span>
  )
}

function timeUntil(dateStr: string) {
  const now = new Date()
  const target = new Date(dateStr)
  const diffMs = target.getTime() - now.getTime()
  if (diffMs <= 0) return 'Expired'
  const hours = Math.floor(diffMs / 3600000)
  if (hours < 1) return '<1h left'
  if (hours < 24) return `${hours}h left`
  return `${Math.floor(hours / 24)}d left`
}

function getOrderLink(approval: ApprovalRequest) {
  if (approval.order_type === 'purchaseorder') return `/purchase-orders/${approval.order_id}`
  if (approval.order_type === 'salesorder') return `/orders/${approval.order_id}`
  if (approval.order_type === 'pricelisthead') return `/price-lists/${approval.order_id}`
  return '#'
}

export default function Approvals() {
  usePageTitle('Approvals')
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabKey>('pending')
  const [rejectDialog, setRejectDialog] = useState<ApprovalRequest | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const { data: pendingApprovals } = useMyPendingApprovals()
  const { data: allApprovals, isLoading } = useAllApprovals(
    activeTab === 'all' ? undefined : { status: activeTab }
  )
  const approveMutation = useApproveRequest()
  const rejectMutation = useRejectRequest()

  const displayApprovals = activeTab === 'pending' ? (pendingApprovals || []) : (allApprovals || [])
  const pendingCount = pendingApprovals?.length || 0

  const handleApprove = (id: number) => {
    approveMutation.mutate({ id })
  }

  const handleRejectConfirm = () => {
    if (rejectDialog) {
      rejectMutation.mutate({ id: rejectDialog.id, note: rejectNote })
      setRejectDialog(null)
      setRejectNote('')
    }
  }

  return (
    <div className="so-detail-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-7 pb-16">

        {/* Header */}
        <PageHeader
          title="Approvals"
          meta={pendingCount > 0 ? (
            <span
              className="inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full text-xs font-bold text-white"
              style={{ background: 'rgb(239,68,68)' }}
            >
              {pendingCount} pending
            </span>
          ) : undefined}
        />

        {/* Tabs */}
        <div className="flex gap-1 mb-6 animate-in delay-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
                style={{
                  background: isActive ? 'var(--so-accent)' : 'transparent',
                  color: isActive ? 'white' : 'var(--so-text-secondary)',
                  border: isActive ? 'none' : '1px solid var(--so-border)',
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {tab.key === 'pending' && pendingCount > 0 && (
                  <span
                    className="ml-1 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-bold"
                    style={{
                      background: isActive ? 'rgba(255,255,255,0.25)' : 'rgb(239,68,68)',
                      color: 'white',
                    }}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Approvals List */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">
              {activeTab === 'pending' ? 'Awaiting Your Decision' : activeTab === 'all' ? 'All Approvals' : `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Approvals`}
            </span>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
          ) : displayApprovals.length === 0 ? (
            <div className="text-center py-12">
              <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
                {activeTab === 'pending' ? "No pending approvals — you're all caught up!" : 'No approvals found'}
              </p>
            </div>
          ) : (
            <div>
              {displayApprovals.map((approval) => (
                <div
                  key={approval.id}
                  className="flex items-center gap-4 px-6 py-4 transition-colors"
                  style={{ borderBottom: '1px solid var(--so-border-light)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Left: Rule + Order info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <RuleBadge code={approval.rule_code} />
                      <StatusBadge status={approval.status} />
                      {approval.status === 'pending' && (
                        <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--so-text-tertiary)' }}>
                          <Clock className="h-3 w-3" />
                          {timeUntil(approval.expires_at)}
                        </span>
                      )}
                    </div>
                    <p
                      className="text-sm font-medium cursor-pointer hover:underline truncate"
                      style={{ color: 'var(--so-text-primary)' }}
                      onClick={() => navigate(getOrderLink(approval))}
                    >
                      {approval.order_display}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: 'var(--so-text-tertiary)' }}>
                      {approval.amount && <span className="font-mono font-semibold">{formatCurrency(approval.amount)}</span>}
                      <span>Requested by {approval.requestor_name}</span>
                      <span>{formatDistanceToNow(new Date(approval.created_at), { addSuffix: true })}</span>
                      {approval.approver_name && approval.status !== 'pending' && (
                        <span>Decided by {approval.approver_name}</span>
                      )}
                    </div>
                    {approval.decision_note && (
                      <p className="mt-1 text-xs italic" style={{ color: 'var(--so-text-secondary)' }}>
                        "{approval.decision_note}"
                      </p>
                    )}
                  </div>

                  {/* Right: Actions (only for pending) */}
                  {approval.status === 'pending' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        className={outlineBtnClass}
                        style={{ ...outlineBtnStyle, color: 'rgb(239,68,68)', borderColor: 'rgb(239,68,68)' }}
                        onClick={() => setRejectDialog(approval)}
                        disabled={rejectMutation.isPending}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </button>
                      <button
                        className={primaryBtnClass}
                        style={{ ...primaryBtnStyle, background: 'rgb(34,197,94)' }}
                        onClick={() => handleApprove(approval.id)}
                        disabled={approveMutation.isPending}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={() => { setRejectDialog(null); setRejectNote('') }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Approval</DialogTitle>
            <DialogDescription>{rejectDialog?.rule_description}</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection (optional)"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
          <DialogFooter>
            <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => { setRejectDialog(null); setRejectNote('') }}>
              Cancel
            </button>
            <button
              className={primaryBtnClass}
              style={{ ...primaryBtnStyle, background: 'rgb(239,68,68)' }}
              onClick={handleRejectConfirm}
            >
              Reject
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
