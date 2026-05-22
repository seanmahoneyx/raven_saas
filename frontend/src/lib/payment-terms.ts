/**
 * Map backend PAYMENT_TERMS_CHOICES enum value to a human-readable display string.
 * Backend choices live in apps/invoicing/models.py:116-124 and apps/parties/models.py.
 */
export type PaymentTermsValue = 'NET30' | 'NET15' | 'NET45' | 'NET60' | 'DUE_ON_RECEIPT' | 'COD'

const DISPLAY_MAP: Record<string, string> = {
  NET30: 'Net 30',
  NET15: 'Net 15',
  NET45: 'Net 45',
  NET60: 'Net 60',
  DUE_ON_RECEIPT: 'Due on Receipt',
  COD: 'COD',
}

/**
 * Convert a backend payment_terms enum value to its display string.
 * Falls back to the raw value (or the provided fallback) if unrecognized.
 */
export function formatPaymentTerms(value: string | null | undefined, fallback = 'Net 30'): string {
  if (!value) return fallback
  return DISPLAY_MAP[value] ?? value
}
