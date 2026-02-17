import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'
import { toast } from 'sonner'

export interface ApprovalRequest {
  id: number
  rule_code: string
  rule_description: string
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  requestor: number
  requestor_name: string
  approver: number | null
  approver_name: string | null
  order_type: string
  order_id: number
  order_display: string
  amount: string | null
  is_expired: boolean
  decided_at: string | null
  decision_note: string | null
  expires_at: string
  created_at: string
}

export function useMyPendingApprovals() {
  return useQuery<ApprovalRequest[]>({
    queryKey: ['approvals', 'my-pending'],
    queryFn: () => apiClient.get('/approvals/my-pending/').then(r => r.data),
    refetchInterval: 60 * 1000, // Poll every 60s
  })
}

export function useApproveRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) =>
      apiClient.post(`/approvals/${id}/approve/`, { note: note || '' }),
    onSuccess: () => {
      toast.success('Approval granted')
      qc.invalidateQueries({ queryKey: ['approvals'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: () => toast.error('Failed to approve'),
  })
}

export function useRejectRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) =>
      apiClient.post(`/approvals/${id}/reject/`, { note: note || '' }),
    onSuccess: () => {
      toast.success('Approval rejected')
      qc.invalidateQueries({ queryKey: ['approvals'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: () => toast.error('Failed to reject'),
  })
}
