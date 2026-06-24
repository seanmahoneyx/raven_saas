import { MessageSquare } from 'lucide-react'

interface CommentCountBadgeProps {
  count: number
  /** Optional click handler (e.g. navigate to the record's comment thread). */
  onClick?: () => void
}

/**
 * Compact comment-count affordance for list rows. Shows a MessageSquare icon +
 * count. When there are no comments it renders a muted icon-only hint so the
 * column stays visually consistent without drawing attention.
 */
export function CommentCountBadge({ count, onClick }: CommentCountBadgeProps) {
  const hasComments = count > 0

  const content = (
    <span
      className="inline-flex items-center gap-1 text-[12.5px] font-medium"
      style={{ color: hasComments ? 'var(--so-text-secondary)' : 'var(--so-text-muted)' }}
      title={hasComments ? `${count} comment${count === 1 ? '' : 's'}` : 'No comments'}
    >
      <MessageSquare className="h-3.5 w-3.5" />
      {hasComments ? count : ''}
    </span>
  )

  if (!onClick) return content

  return (
    <button
      type="button"
      className="inline-flex items-center rounded-md px-1.5 py-0.5 transition-colors hover:bg-[var(--so-surface-raised)]"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {content}
    </button>
  )
}
