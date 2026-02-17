import { useEffect, useCallback } from 'react'

interface Shortcut {
  key: string            // e.g., 'k', 'n', 's', '/'
  ctrl?: boolean         // Ctrl/Cmd
  shift?: boolean        // Shift key
  description: string    // For help modal
  category: string       // Group in help modal
  action: () => void
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger if user is typing in an input/textarea/select
    const target = e.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ) {
      // Exception: Ctrl+S should still work in inputs (save)
      if (!(e.key === 's' && (e.ctrlKey || e.metaKey))) {
        return
      }
    }

    for (const shortcut of shortcuts) {
      const ctrlMatch = shortcut.ctrl
        ? (e.ctrlKey || e.metaKey)
        : !(e.ctrlKey || e.metaKey)
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey
      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase()

      if (ctrlMatch && shiftMatch && keyMatch) {
        e.preventDefault()
        shortcut.action()
        return
      }
    }
  }, [shortcuts])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

// Export shortcut definitions for the help modal
export const SHORTCUT_DEFINITIONS = [
  { key: 'K', ctrl: true, description: 'Open Global Search', category: 'Navigation' },
  { key: 'N', ctrl: true, description: 'Create New (context dependent)', category: 'Actions' },
  { key: 'S', ctrl: true, description: 'Save current form', category: 'Actions' },
  { key: '/', shift: true, description: 'Show keyboard shortcuts', category: 'Help' },
]
