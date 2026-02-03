import { useEffect } from 'react'

/**
 * Sets the document title with RAVEN prefix
 * @param title - The page/module name (e.g., "Scheduler", "Dashboard")
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = `RAVEN | ${title}`

    return () => {
      document.title = previousTitle
    }
  }, [title])
}
