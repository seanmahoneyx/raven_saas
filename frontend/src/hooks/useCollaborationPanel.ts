import { useState, useCallback } from 'react'

export function useCollaborationPanel() {
  const [panelOpen, setPanelOpen] = useState(false)

  const togglePanel = useCallback(() => {
    setPanelOpen(prev => !prev)
  }, [])

  const closePanel = useCallback(() => {
    setPanelOpen(false)
  }, [])

  return { panelOpen, togglePanel, closePanel }
}
