import api from '@/api/client'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/errors'

/**
 * Normalize a URL for use with the apiClient.
 * - If absolute (http/https): pass through unchanged.
 * - If it starts with /api/v1/: strip that prefix (apiClient baseURL handles it).
 * - Otherwise ensure it has a leading slash.
 */
function normalizeUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/api/v1/')) return url.slice('/api/v1'.length)
  if (url.startsWith('api/v1/')) return '/' + url.slice('api/v1'.length + 1)
  return url.startsWith('/') ? url : `/${url}`
}

/**
 * Fetch a blob from an authenticated endpoint via the axios apiClient,
 * so the Bearer token / cookie auth interceptor applies.
 */
async function fetchBlob(url: string): Promise<Blob> {
  const normalized = normalizeUrl(url)
  const response = await api.get<Blob>(normalized, { responseType: 'blob' })
  return response.data
}

/**
 * Download a file from an authenticated endpoint.
 * Uses the axios apiClient so the Bearer token / cookie auth interceptor applies.
 * Returns true on success, false on failure (and surfaces a toast).
 *
 * @param url      - Endpoint relative to /api/v1 (e.g. '/invoices/123/pdf/') OR absolute
 * @param filename - Suggested filename for the download (e.g. 'invoice-INV-001.pdf')
 */
export async function downloadAuthed(url: string, filename: string): Promise<boolean> {
  try {
    const blob = await fetchBlob(url)
    const blobUrl = URL.createObjectURL(blob)

    const anchor = document.createElement('a')
    anchor.href = blobUrl
    anchor.download = filename
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)

    // Revoke after a short delay so the browser has time to start the download.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)

    return true
  } catch (err) {
    toast.error(getApiErrorMessage(err, 'Download failed'))
    return false
  }
}

/**
 * Open an authenticated URL in a new tab. Fetches via apiClient to get the blob
 * (with auth applied), creates an object URL, and opens it in window. The new
 * tab inherits the blob URL (no auth header needed for blob: URLs).
 *
 * Use this for print preview / inline PDF view. Use downloadAuthed for save-to-disk.
 */
export async function openAuthedInTab(url: string): Promise<boolean> {
  try {
    const blob = await fetchBlob(url)
    const blobUrl = URL.createObjectURL(blob)

    window.open(blobUrl, '_blank')

    // Revoke after ~60 seconds so the user has time to view the resource.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)

    return true
  } catch (err) {
    toast.error(getApiErrorMessage(err, 'Could not open file'))
    return false
  }
}
