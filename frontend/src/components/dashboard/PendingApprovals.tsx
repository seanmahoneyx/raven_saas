import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { ShieldCheck, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { useMyPendingApprovals, useApproveRequest, useRejectRequest } from '@/api/approvals'
import type { ApprovalRequest } from '@/api/approvals'

function formatCurrency(value: string | number | null) {
  if (!value) return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(num)
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

function RuleBadge({ code }: { code: string }) {
  const colorMap: Record<string, string> = {
    'po_amount_threshold': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    'so_low_margin': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    'credit_limit_exceeded': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  }
  const labelMap: Record<string, string> = {
    'po_amount_threshold': 'High Value PO',
    'so_low_margin': 'Low Margin',
    'credit_limit_exceeded': 'Credit Limit',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorMap[code] || 'bg-muted text-foreground'}`}>
      {labelMap[code] || code}
    </span>
  )
}

export default function PendingApprovals() {
  const navigate = useNavigate()
  const { data: approvals, isLoading } = useMyPendingApprovals()
  const approveMutation = useApproveRequest()
  const rejectMutation = useRejectRequest()

  const [rejectDialog, setRejectDialog] = useState<ApprovalRequest | null>(null)
  const [rejectNote, setRejectNote] = useState('')

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

  const getOrderLink = (approval: ApprovalRequest) => {
    if (approval.order_type === 'purchaseorder') return `/purchase-orders/${approval.order_id}`
    if (approval.order_type === 'salesorder') return `/orders/${approval.order_id}`
    return '#'
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Pending Approvals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    )
  }

  const pending = approvals || []

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Pending Approvals
            {pending.length > 0 && (
              <Badge variant="destructive" className="ml-auto">{pending.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <div className="text-sm text-green-600 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              No pending approvals
            </div>
          ) : (
            <div className="space-y-3 max-h-[280px] overflow-y-auto">
              {pending.map((approval) => (
                <div
                  key={approval.id}
                  className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <RuleBadge code={approval.rule_code} />
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeUntil(approval.expires_at)}
                      </span>
                    </div>
                    <p
                      className="text-sm truncate cursor-pointer hover:text-primary"
                      onClick={() => navigate(getOrderLink(approval))}
                      title={approval.rule_description}
                    >
                      {approval.order_display}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(approval.amount)} &middot; by {approval.requestor_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => handleApprove(approval.id)}
                      disabled={approveMutation.isPending}
                      title="Approve"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setRejectDialog(approval)}
                      disabled={rejectMutation.isPending}
                      title="Reject"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reject Confirmation Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={() => { setRejectDialog(null); setRejectNote('') }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Approval</DialogTitle>
            <DialogDescription>
              {rejectDialog?.rule_description}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection (optional)"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialog(null); setRejectNote('') }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRejectConfirm}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
