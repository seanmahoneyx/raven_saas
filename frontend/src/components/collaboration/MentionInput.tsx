import { useState, useRef, useEffect, useCallback } from 'react'
import { Send } from 'lucide-react'
import { useMentionableUsers } from '@/api/collaboration'

interface MentionInputProps {
  onSubmit: (body: string) => void
  placeholder?: string
  loading?: boolean
}

export function MentionInput({ onSubmit, placeholder = 'Type a message... Use @ to mention', loading }: MentionInputProps) {
  const [value, setValue] = useState('')
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState(-1)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { data: mentionData } = useMentionableUsers(mentionQuery ?? undefined)

  const allSuggestions = [
    ...(mentionData?.users?.map(u => ({ type: 'user' as const, id: u.id, label: u.name || u.username, username: u.username })) ?? []),
    ...(mentionData?.groups?.map(g => ({ type: 'group' as const, id: g.id, label: g.name, username: g.name })) ?? []),
  ]

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    const cursor = e.target.selectionStart ?? text.length
    setValue(text)

    // Detect @ trigger
    const beforeCursor = text.slice(0, cursor)
    const atMatch = beforeCursor.match(/@(\w*)$/)
    if (atMatch) {
      setMentionQuery(atMatch[1])
      setMentionStart(cursor - atMatch[0].length)
      setSelectedIndex(0)
    } else {
      setMentionQuery(null)
      setMentionStart(-1)
    }
  }

  const insertMention = useCallback((suggestion: typeof allSuggestions[0]) => {
    if (mentionStart < 0) return
    const before = value.slice(0, mentionStart)
    const after = value.slice(
      mentionStart + (mentionQuery?.length ?? 0) + 1 // +1 for the @
    )
    const markup = suggestion.type === 'user'
      ? `@[user:${suggestion.id}]`
      : `@[group:${suggestion.label}]`
    const newValue = before + markup + ' ' + after
    setValue(newValue)
    setMentionQuery(null)
    setMentionStart(-1)
    textareaRef.current?.focus()
  }, [value, mentionStart, mentionQuery])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionQuery !== null && allSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, allSuggestions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(allSuggestions[selectedIndex])
        return
      }
      if (e.key === 'Escape') {
        setMentionQuery(null)
        setMentionStart(-1)
        return
      }
    }

    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey && mentionQuery === null) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || loading) return
    onSubmit(trimmed)
    setValue('')
  }

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
  }, [value])

  return (
    <div className="relative">
      {/* Mention dropdown */}
      {mentionQuery !== null && allSuggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border overflow-auto z-50"
          style={{
            background: 'var(--so-surface)',
            borderColor: 'var(--so-border)',
            maxHeight: 200,
            boxShadow: '0 -4px 16px rgba(0,0,0,0.10)',
          }}
        >
          {allSuggestions.map((s, i) => (
            <button
              key={`${s.type}-${s.id}`}
              className="w-full text-left px-3 py-2 flex items-center gap-2 text-[13px]"
              style={{
                background: i === selectedIndex ? 'var(--so-border-light)' : 'transparent',
                borderBottom: '1px solid var(--so-border-light)',
              }}
              onMouseDown={(e) => {
                e.preventDefault()
                insertMention(s)
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span
                className="flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold uppercase"
                style={{
                  background: s.type === 'group' ? 'rgba(59,130,246,0.1)' : 'rgba(74,144,92,0.1)',
                  color: s.type === 'group' ? '#3b82f6' : 'var(--so-success, #4a905c)',
                }}
              >
                {s.type === 'group' ? 'G' : s.label.charAt(0)}
              </span>
              <div className="flex-1 min-w-0">
                <span className="font-medium" style={{ color: 'var(--so-text-primary)' }}>
                  {s.type === 'group' ? `@${s.label}` : s.label}
                </span>
                {s.type === 'user' && (
                  <span className="ml-1.5 text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
                    @{s.username}
                  </span>
                )}
              </div>
              <span className="text-[10px] uppercase font-medium" style={{ color: 'var(--so-text-tertiary)' }}>
                {s.type}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div
        className="flex items-end gap-2 rounded-lg border px-3 py-2"
        style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          className="flex-1 bg-transparent outline-none text-[13px] resize-none"
          style={{ color: 'var(--so-text-primary)', minHeight: 24, maxHeight: 120 }}
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || loading}
          className="shrink-0 flex items-center justify-center h-7 w-7 rounded-md transition-colors"
          style={{
            background: value.trim() ? 'var(--so-accent)' : 'transparent',
            color: value.trim() ? '#fff' : 'var(--so-text-tertiary)',
            opacity: loading ? 0.5 : 1,
          }}
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
