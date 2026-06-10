/** Fallback shown while a lazy-loaded route chunk is being fetched. */
export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24" role="status" aria-label="Loading">
      <div
        className="h-7 w-7 animate-spin rounded-full border-2 border-transparent"
        style={{ borderTopColor: 'var(--so-accent)', borderRightColor: 'var(--so-accent)' }}
      />
    </div>
  )
}
