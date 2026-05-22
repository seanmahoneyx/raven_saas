import { toast } from 'sonner'

/**
 * Extract a user-friendly error message from an API error response.
 * Handles Axios error shapes, DRF validation error trees, and falls back
 * to a generic message.
 *
 * Handles these DRF shapes:
 *   { detail: 'string' }
 *   { error: 'string' }
 *   { non_field_errors: ['string'] }
 *   { field_name: ['error msg', ...] }
 *   { lines: [{ item: ['Required.'] }, { quantity: ['Must be > 0.'] }] }
 *   { field: { sub_field: ['error'] } }
 *   Plain string body (non-JSON 400)
 *   Network errors / no response (uses err.message or fallback)
 */
const MAX_LEN = 300

function snakeToFriendly(s: string): string {
  if (!s) return s
  const spaced = s.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * Recursively walk a DRF error tree and emit "path: message" strings.
 * - Arrays of strings: emit each string under the current path.
 * - Arrays of objects: recurse with `path[i]` prefix.
 * - Objects: recurse with `path.field` prefix.
 * - Strings: emit directly.
 */
function walkErrorTree(node: unknown, path: string, out: string[]): void {
  if (out.length > 20) return // safety cap on number of collected messages

  if (node == null) return

  if (typeof node === 'string') {
    const trimmed = node.trim()
    if (!trimmed) return
    out.push(path ? `${path}: ${trimmed}` : trimmed)
    return
  }

  if (typeof node === 'number' || typeof node === 'boolean') {
    out.push(path ? `${path}: ${String(node)}` : String(node))
    return
  }

  if (Array.isArray(node)) {
    // If array of strings, treat as a list of messages for current path.
    const allStrings = node.every((x) => typeof x === 'string')
    if (allStrings) {
      for (const msg of node as string[]) {
        const trimmed = msg.trim()
        if (!trimmed) continue
        out.push(path ? `${path}: ${trimmed}` : trimmed)
        if (out.length > 20) return
      }
      return
    }
    // Otherwise recurse with index suffix.
    for (let i = 0; i < node.length; i++) {
      const child = node[i]
      if (child == null) continue
      if (typeof child === 'object' && Object.keys(child as object).length === 0) continue
      walkErrorTree(child, path ? `${path}[${i}]` : `[${i}]`, out)
      if (out.length > 20) return
    }
    return
  }

  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>
    for (const key of Object.keys(obj)) {
      // non_field_errors and __all__: emit without the noisy prefix.
      const isNonFieldKey = key === 'non_field_errors' || key === '__all__'
      const childPath = isNonFieldKey ? path : path ? `${path}.${key}` : key
      walkErrorTree(obj[key], childPath, out)
      if (out.length > 20) return
    }
    return
  }
}

function friendlyifyPath(path: string): string {
  // Convert snake_case segments to friendly form, preserving [i] indices and dots.
  // e.g. "lines[0].quantity" -> "Lines[0].Quantity"
  return path
    .split('.')
    .map((segment) => {
      // Pull off any trailing [i] indices.
      const match = segment.match(/^([^[]+)(\[.*\])?$/)
      if (!match) return segment
      const name = match[1]
      const idx = match[2] ?? ''
      return snakeToFriendly(name) + idx
    })
    .join('.')
}

function formatMessages(messages: string[]): string {
  if (messages.length === 0) return ''
  // Friendlyify the "path:" portion of each message.
  const formatted = messages.map((m) => {
    const colonIdx = m.indexOf(': ')
    if (colonIdx <= 0) return m // no path, just a message
    const path = m.slice(0, colonIdx)
    const rest = m.slice(colonIdx + 2)
    return `${friendlyifyPath(path)}: ${rest}`
  })
  let joined = formatted.join(' ')
  if (joined.length > MAX_LEN) {
    joined = joined.slice(0, MAX_LEN - 1).trimEnd() + '…'
  }
  return joined
}

export function getApiErrorMessage(err: unknown, fallback = 'An error occurred'): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, any>
    const data = e.response?.data

    // Plain string body (non-JSON 400 or text response).
    if (typeof data === 'string' && data.trim()) {
      const trimmed = data.trim()
      return trimmed.length > MAX_LEN ? trimmed.slice(0, MAX_LEN - 1) + '…' : trimmed
    }

    if (data && typeof data === 'object') {
      // Preserve original behavior: prefer top-level detail/error string.
      const detail = data.detail
      if (typeof detail === 'string' && detail.trim()) return detail
      const errorStr = data.error
      if (typeof errorStr === 'string' && errorStr.trim()) return errorStr

      // Walk the rest of the tree.
      const collected: string[] = []
      walkErrorTree(data, '', collected)
      const formatted = formatMessages(collected)
      if (formatted) return formatted
    }

    // Standard Error / network error.
    if (typeof e.message === 'string' && e.message !== '') return e.message
  }
  return fallback
}

/**
 * Convenience: extracts the message and toasts it as an error.
 */
export function toastApiError(err: unknown, fallback = 'An error occurred'): void {
  toast.error(getApiErrorMessage(err, fallback))
}
