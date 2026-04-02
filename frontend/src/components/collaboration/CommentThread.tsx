import { useState } from 'react'
import { MessageSquare, Trash2, Reply } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useComments, useCreateComment, useDeleteComment, type Comment } from '@/api/collaboration'
import { useAuth } from '@/hooks/useAuth'
import { getInitials } from '@/lib/utils'
import { MentionInput } from './MentionInput'

// Regex to render mention markup as styled chips
const USER_MENTION_RE = /@\[user:(\d+)\]/g
const GROUP_MENTION_RE = /@\[group:([^\]]+)\]/g

function renderBody(body: string): React.ReactNode[] {
  // Split body into parts: text and mentions
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const combined = new RegExp(`${USER_MENTION_RE.source}|${GROUP_MENTION_RE.source}`, 'g')
  let match: RegExpExecArray | null

  while ((match = combined.exec(body)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(body.slice(lastIndex, match.index))
    }
    // User mention: @[user:ID]
    if (match[1]) {
      parts.push(
        <span
          key={match.index}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[12px] font-medium"
          style={{ background: 'rgba(74,144,92,0.1)', color: 'var(--so-success, #4a905c)' }}
        >
          @user:{match[1]}
        </span>
      )
    }
    // Group mention: @[group:Name]
    else if (match[2]) {
      parts.push(
        <span
          key={match.index}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[12px] font-medium"
          style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}
        >
          @{match[2]}
        </span>
      )
    }
    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < body.length) {
    parts.push(body.slice(lastIndex))
  }

  return parts
}

interface CommentItemProps {
  comment: Comment
  contentType: string
  objectId: number
  isReply?: boolean
}

function CommentItem({ comment, contentType, objectId, isReply }: CommentItemProps) {
  const { user } = useAuth()
  const [showReplyInput, setShowReplyInput] = useState(false)
  const createComment = useCreateComment()
  const deleteComment = useDeleteComment()

  const handleReply = (body: string) => {
    createComment.mutate(
      { content_type: contentType, object_id: objectId, body, parent: comment.id },
      { onSuccess: () => setShowReplyInput(false) }
    )
  }

  const initials = getInitials(comment.author_name || 'U')

  return (
    <div className={isReply ? 'ml-8' : ''}>
      <div className="flex gap-2.5 py-2.5">
        {/* Avatar */}
        <div
          className="shrink-0 flex items-center justify-center h-7 w-7 rounded-full text-[10px] font-bold uppercase"
          style={{ background: 'var(--so-border-light)', color: 'var(--so-text-secondary)' }}
        >
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-primary)' }}>
              {comment.author_name}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
          </div>

          {/* Body */}
          <div className="text-[13px] mt-0.5 whitespace-pre-wrap" style={{ color: comment.is_deleted ? 'var(--so-text-tertiary)' : 'var(--so-text-secondary)' }}>
            {comment.is_deleted ? '[deleted]' : renderBody(comment.body)}
          </div>

          {/* Actions */}
          {!comment.is_deleted && (
            <div className="flex items-center gap-3 mt-1">
              {!isReply && (
                <button
                  className="flex items-center gap-1 text-[11px] hover:opacity-70"
                  style={{ color: 'var(--so-text-tertiary)' }}
                  onClick={() => setShowReplyInput(!showReplyInput)}
                >
                  <Reply className="h-3 w-3" />
                  Reply
                </button>
              )}
              {user?.id === comment.author && (
                <button
                  className="flex items-center gap-1 text-[11px] hover:opacity-70"
                  style={{ color: 'var(--so-text-tertiary)' }}
                  onClick={() => deleteComment.mutate(comment.id)}
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              )}
            </div>
          )}

          {/* Reply input */}
          {showReplyInput && (
            <div className="mt-2">
              <MentionInput
                onSubmit={handleReply}
                placeholder="Write a reply..."
                loading={createComment.isPending}
              />
            </div>
          )}
        </div>
      </div>

      {/* Replies */}
      {comment.replies?.map(reply => (
        <CommentItem
          key={reply.id}
          comment={reply}
          contentType={contentType}
          objectId={objectId}
          isReply
        />
      ))}
    </div>
  )
}

interface CommentThreadProps {
  contentType: string
  objectId: number
}

export function CommentThread({ contentType, objectId }: CommentThreadProps) {
  const { data, isLoading } = useComments(contentType, objectId)
  const createComment = useCreateComment()

  const comments = data?.results ?? []

  const handleSubmit = (body: string) => {
    createComment.mutate({ content_type: contentType, object_id: objectId, body })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-auto px-3 py-2" style={{ minHeight: 0 }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</span>
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <MessageSquare className="h-8 w-8" style={{ color: 'var(--so-text-tertiary)', opacity: 0.4 }} />
            <span className="text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>
              No messages yet. Start a conversation.
            </span>
          </div>
        ) : (
          <div className="space-y-1">
            {comments.map(comment => (
              <CommentItem
                key={comment.id}
                comment={comment}
                contentType={contentType}
                objectId={objectId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-2" style={{ borderTop: '1px solid var(--so-border-light)' }}>
        <MentionInput onSubmit={handleSubmit} loading={createComment.isPending} />
      </div>
    </div>
  )
}
