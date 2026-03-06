/**
 * Extract a user-friendly error message from an API error response.
 * Handles Axios error shapes and falls back to a generic message.
 */
export function getApiErrorMessage(err: unknown, fallback = 'An error occurred'): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, any>
    // Axios error shape: err.response.data.detail or err.response.data.error
    const detail = e.response?.data?.detail || e.response?.data?.error
    if (typeof detail === 'string') return detail
    // Standard Error
    if (typeof e.message === 'string' && e.message !== '') return e.message
  }
  return fallback
}
