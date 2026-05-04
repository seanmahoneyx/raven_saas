import { useState, useRef, useEffect } from 'react'
import { Send, ArrowLeft, MessageSquare, Search } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import {
  useConversations, useDirectMessages, useSendDirectMessage,
  type DirectMessage,
} from '@/api/collaboration'
import { useUsers } from '@/api/users'
import { useAuth } from '@/hooks/useAuth'
import { getInitials } from '@/lib/utils'

interface ChatViewProps {
  partnerId: number
  partnerName: string
  onBack: () => void
}

function ChatView({ partnerId, partnerName, onBack }: ChatViewProps) {
  const { user } = useAuth()
  const { data } = useDirectMessages(partnerId)
  const sendMessage = useSendDirectMessage()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const messages = data?.results ?? []

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || sendMessage.isPending) return
    sendMessage.mutate({ userId: partnerId, body: trimmed })
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const initials = getInitials

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--so-border-light)' }}
      >
        <button
          onClick={onBack}
          className="shrink-0 flex items-center justify-center h-7 w-7 rounded-md hover:opacity-70"
          style={{ color: 'var(--so-text-tertiary)' }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div
          className="shrink-0 flex items-center justify-center h-8 w-8 rounded-full text-[11px] font-bold uppercase"
          style={{ background: 'var(--so-border-light)', color: 'var(--so-text-secondary)' }}
        >
          {initials(partnerName)}
        </div>
        <span className="text-[14px] font-semibold" style={{ color: 'var(--so-text-primary)' }}>
          {partnerName}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-4 py-3" style={{ minHeight: 0 }}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <MessageSquare className="h-8 w-8" style={{ color: 'var(--so-text-tertiary)', opacity: 0.3 }} />
            <span className="text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>
              Start a conversation with {partnerName}
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg: DirectMessage) => {
              const isMe = msg.sender === user?.id
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="max-w-[75%] rounded-2xl px-3.5 py-2"
                    style={{
                      background: isMe ? 'var(--so-accent)' : 'var(--so-bg)',
                      color: isMe ? '#fff' : 'var(--so-text-primary)',
                      borderBottomRightRadius: isMe ? 4 : 16,
                      borderBottomLeftRadius: isMe ? 16 : 4,
                    }}
                  >
                    <p className="text-[13px] whitespace-pre-wrap">{msg.body}</p>
                    <p
                      className="text-[10px] mt-1"
                      style={{ opacity: 0.6 }}
                    >
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3 shrink-0" style={{ borderTop: '1px solid var(--so-border-light)' }}>
        <div
          className="flex items-end gap-2 rounded-xl border px-3 py-2"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
        >
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 bg-transparent outline-none text-[13px] resize-none"
            style={{ color: 'var(--so-text-primary)', minHeight: 24, maxHeight: 100 }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sendMessage.isPending}
            className="shrink-0 flex items-center justify-center h-7 w-7 rounded-md transition-colors"
            style={{
              background: input.trim() ? 'var(--so-accent)' : 'transparent',
              color: input.trim() ? '#fff' : 'var(--so-text-tertiary)',
            }}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function DirectMessages() {
  const { user } = useAuth()
  const { data: convData, isLoading } = useConversations()
  const { data: usersData } = useUsers()
  const [activeChat, setActiveChat] = useState<{ id: number; name: string } | null>(null)
  const [showNewChat, setShowNewChat] = useState(false)
  const [userSearch, setUserSearch] = useState('')

  const conversations = convData?.results ?? []
  const allUsers = (usersData ?? []) as Array<{ id: number; username: string; name?: string }>

  // Filter users for new chat (exclude self and existing conversations)
  const existingPartnerIds = new Set(conversations.map(c => c.user_id))
  const filteredUsers = allUsers
    .filter(u => u.id !== user?.id)
    .filter(u => {
      if (!userSearch.trim()) return !existingPartnerIds.has(u.id)
      const q = userSearch.toLowerCase()
      return (u.name?.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
    })
    .slice(0, 20)

  if (activeChat) {
    return (
      <ChatView
        partnerId={activeChat.id}
        partnerName={activeChat.name}
        onBack={() => setActiveChat(null)}
      />
    )
  }

  const initials = getInitials

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--so-border-light)' }}
      >
        <span className="text-[14px] font-semibold" style={{ color: 'var(--so-text-primary)' }}>
          Messages
        </span>
        <button
          className="text-[12px] font-medium px-2.5 py-1 rounded hover:opacity-80"
          style={{ color: 'var(--so-accent)' }}
          onClick={() => setShowNewChat(!showNewChat)}
        >
          {showNewChat ? 'Cancel' : '+ New'}
        </button>
      </div>

      {/* New chat user picker */}
      {showNewChat && (
        <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
          <div
            className="flex items-center gap-2 px-2.5 rounded-lg border"
            style={{ background: 'var(--so-bg)', borderColor: 'var(--so-border)', height: 34 }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--so-text-tertiary)' }} />
            <input
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              placeholder="Search users..."
              className="flex-1 bg-transparent outline-none text-[13px]"
              style={{ color: 'var(--so-text-primary)' }}
              autoFocus
            />
          </div>
          <div className="mt-1 max-h-40 overflow-auto">
            {filteredUsers.map(u => (
              <button
                key={u.id}
                className="w-full text-left flex items-center gap-2.5 px-2 py-1.5 rounded text-[13px] hover:opacity-80"
                style={{ color: 'var(--so-text-primary)' }}
                onClick={() => {
                  setActiveChat({ id: u.id, name: u.name || u.username })
                  setShowNewChat(false)
                  setUserSearch('')
                }}
              >
                <div
                  className="shrink-0 flex items-center justify-center h-6 w-6 rounded-full text-[9px] font-bold uppercase"
                  style={{ background: 'var(--so-border-light)', color: 'var(--so-text-secondary)' }}
                >
                  {initials(u.name || u.username)}
                </div>
                <span>{u.name || u.username}</span>
                <span className="text-[11px]" style={{ color: 'var(--so-text-tertiary)' }}>@{u.username}</span>
              </button>
            ))}
            {filteredUsers.length === 0 && (
              <p className="text-[12px] py-2 px-2" style={{ color: 'var(--so-text-tertiary)' }}>No users found</p>
            )}
          </div>
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</span>
          </div>
        ) : conversations.length === 0 && !showNewChat ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <MessageSquare className="h-10 w-10" style={{ color: 'var(--so-text-tertiary)', opacity: 0.3 }} />
            <span className="text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>
              No conversations yet
            </span>
            <button
              className="text-[12px] font-medium mt-1"
              style={{ color: 'var(--so-accent)' }}
              onClick={() => setShowNewChat(true)}
            >
              Start a conversation
            </button>
          </div>
        ) : (
          conversations.map(conv => (
            <button
              key={conv.user_id}
              className="w-full text-left flex items-center gap-3 px-4 py-3 transition-colors hover:opacity-90"
              style={{ borderBottom: '1px solid var(--so-border-light)' }}
              onClick={() => setActiveChat({ id: conv.user_id, name: conv.user_name })}
            >
              <div className="relative shrink-0">
                <div
                  className="flex items-center justify-center h-9 w-9 rounded-full text-[11px] font-bold uppercase"
                  style={{ background: 'var(--so-border-light)', color: 'var(--so-text-secondary)' }}
                >
                  {initials(conv.user_name)}
                </div>
                {conv.unread_count > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 min-w-[16px] px-0.5 rounded-full text-[9px] font-bold text-white"
                    style={{ background: '#ef4444' }}
                  >
                    {conv.unread_count}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span
                    className="text-[13px] font-medium"
                    style={{ color: conv.unread_count > 0 ? 'var(--so-text-primary)' : 'var(--so-text-secondary)' }}
                  >
                    {conv.user_name}
                  </span>
                  <span className="text-[10px] shrink-0 ml-2" style={{ color: 'var(--so-text-tertiary)' }}>
                    {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })}
                  </span>
                </div>
                <p
                  className="text-[12px] truncate mt-0.5"
                  style={{
                    color: conv.unread_count > 0 ? 'var(--so-text-secondary)' : 'var(--so-text-tertiary)',
                    fontWeight: conv.unread_count > 0 ? 500 : 400,
                  }}
                >
                  {conv.last_message}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
