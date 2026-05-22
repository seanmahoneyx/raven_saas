import { Button } from '@/components/ui/button'
import { getApiErrorMessage } from '@/lib/errors'

interface ReportErrorBlockProps {
  /** The error object from react-query (typically `error` from useQuery). */
  error: unknown
  /** Retry handler (typically `refetch` from useQuery). */
  onRetry?: () => void
  /** Optional fallback message when no detail can be extracted from the error. */
  fallback?: string
}

/**
 * Standard "report failed to load" panel used across all report pages.
 * Distinguishes a real API failure from an empty-data state so users know
 * whether to retry or that there's just nothing to show.
 */
export default function ReportErrorBlock({ error, onRetry, fallback = 'Unknown error' }: ReportErrorBlockProps) {
  return (
    <div
      className="rounded-lg border p-8 text-center"
      style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
    >
      <p className="mb-4" style={{ color: 'var(--so-text-secondary)' }}>
        Failed to load: {getApiErrorMessage(error, fallback)}
      </p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}
