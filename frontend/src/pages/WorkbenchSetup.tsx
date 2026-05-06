import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useItem, useTransitionItem } from '@/api/items'
import ItemFormShell from '@/components/items/ItemFormShell'
import { primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { CheckCircle2 } from 'lucide-react'

const LIFECYCLE_NEXT: Record<string, { next: string; label: string }> = {
  draft: { next: 'in_design', label: 'Mark In Design' },
  pending_design: { next: 'in_design', label: 'Start Design' },
  in_design: { next: 'pending_approval', label: 'Submit for Approval' },
  design_complete: { next: 'pending_approval', label: 'Submit for Approval' },
  pending_approval: { next: 'active', label: 'Approve & Activate' },
}

export default function WorkbenchSetup() {
  usePageTitle('Item Setup')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const itemId = parseInt(id || '0', 10)
  const { data: item, isLoading } = useItem(itemId)
  const transition = useTransitionItem()

  if (isLoading || !item) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[860px] mx-auto px-4 md:px-8 py-7">
          <p className="text-[13px]" style={{ color: 'var(--so-text-muted)' }}>Loading...</p>
        </div>
      </div>
    )
  }

  const transition_info = LIFECYCLE_NEXT[item.lifecycle_status]

  const handleApprove = async () => {
    if (!transition_info) return
    await transition.mutateAsync({ id: item.id, lifecycle_status: transition_info.next })
    navigate('/items/workbench')
  }

  const approveButton = transition_info && (
    <button
      type="button"
      className={primaryBtnClass + (transition.isPending ? ' opacity-50 pointer-events-none' : '')}
      style={{ ...primaryBtnStyle, background: 'var(--so-success, #4a905c)', borderColor: 'var(--so-success, #4a905c)' }}
      onClick={handleApprove}
      disabled={transition.isPending}
    >
      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
      {transition.isPending ? 'Updating...' : transition_info.label}
    </button>
  )

  return (
    <ItemFormShell
      mode="setup"
      initialItem={item}
      pageTitle={`Setup: ${item.sku || item.name}`}
      pageDescription={`Complete item specifications · Status: ${item.lifecycle_status.replace(/_/g, ' ')}`}
      extraActions={approveButton}
      onSuccess={() => navigate('/items/workbench')}
    />
  )
}
