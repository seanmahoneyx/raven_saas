import type { ReactNode } from 'react'

export interface FolderTab {
  id: string
  label: string
  icon?: ReactNode
}

interface FolderTabsProps {
  tabs: FolderTab[]
  activeTab: string
  onTabChange: (tabId: string) => void
}

export function FolderTabs({ tabs, activeTab, onTabChange }: FolderTabsProps) {
  return (
    <div className="flex gap-1" style={{ paddingBottom: 0 }}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="flex items-center gap-1.5 px-5 py-2 text-[13px] font-medium transition-all cursor-pointer"
            style={{
              background: isActive ? 'var(--so-accent)' : 'transparent',
              color: isActive ? '#fff' : 'var(--so-text-tertiary)',
              borderRadius: '8px 8px 0 0',
              border: isActive ? '1px solid var(--so-accent)' : '1px solid transparent',
              borderBottom: 'none',
              marginBottom: '-1px',
              position: 'relative',
              zIndex: isActive ? 1 : 0,
            }}
            onMouseEnter={e => {
              if (!isActive) {
                e.currentTarget.style.color = 'var(--so-text-secondary)'
                e.currentTarget.style.background = 'var(--so-bg)'
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                e.currentTarget.style.color = 'var(--so-text-tertiary)'
                e.currentTarget.style.background = 'transparent'
              }
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        )
      })}
      <div className="flex-1" style={{ borderBottom: '1px solid var(--so-border)' }} />
    </div>
  )
}
