import type { LucideIcon } from 'lucide-react'
import { MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface MenuAction {
  label: string
  onClick: () => void
  icon?: LucideIcon
  variant?: 'default' | 'destructive'
  disabled?: boolean
  /** Insert a separator before this item */
  separatorBefore?: boolean
}

interface ActionMenuProps {
  actions: MenuAction[]
  trigger?: React.ReactNode
  align?: 'start' | 'end'
}

export function ActionMenu({ actions, trigger, align = 'end' }: ActionMenuProps) {
  const visible = actions.filter(Boolean)
  if (visible.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            aria-label="More actions"
            className="h-9 w-9 inline-flex items-center justify-center rounded-md transition-colors"
            style={{
              border: '1px solid var(--so-border)',
              background: 'var(--so-surface)',
              color: 'var(--so-text-secondary)',
            }}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[180px]">
        {visible.map((a, idx) => {
          const Icon = a.icon
          return (
            <div key={idx}>
              {a.separatorBefore && idx > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={a.onClick}
                disabled={a.disabled}
                style={a.variant === 'destructive' ? { color: 'var(--so-danger-text)' } : undefined}
                className="gap-2 cursor-pointer"
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {a.label}
              </DropdownMenuItem>
            </div>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
