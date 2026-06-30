import { useQuery } from '@tanstack/react-query'
import api from './client'
import type { PipelineNode, PipelineStageKey } from '../components/pipeline/PipelineProgress'

/** One lineage edge as returned by GET /document-links/for-object/. */
export interface DocumentLink {
  id: number
  relation: string
  relation_display: string
  source_content_type: number
  source_object_id: number
  source_type: string // "app_label.model", e.g. "orders.estimate"
  source_label: string // e.g. "Estimate EST-1001"
  target_content_type: number
  target_object_id: number
  target_type: string
  target_label: string
  created_by: number | null
  created_by_name: string | null
  created_at: string
}

/**
 * Maps a backend ContentType string ("app.model") to its pipeline stage and,
 * where a detail route exists, a function building the SPA path. Stages whose
 * documents have no detail page (pick ticket, BOL, payment) get no route and
 * render as non-clickable in the ledger.
 */
const TYPE_TO_STAGE: Record<string, { stage: PipelineStageKey; route?: (id: number) => string }> = {
  'orders.estimate': { stage: 'estimate', route: (id) => `/estimates/${id}` },
  'contracts.contract': { stage: 'contract', route: (id) => `/contracts/${id}` },
  'orders.salesorder': { stage: 'sales_order', route: (id) => `/orders/sales/${id}` },
  'inventory.pickticket': { stage: 'pick_ticket' },
  'shipping.billoflading': { stage: 'bol' },
  'invoicing.invoice': { stage: 'invoice', route: (id) => `/invoices/${id}` },
  'invoicing.payment': { stage: 'payment' },
  'payments.customerpayment': { stage: 'payment' },
}

/** Resolve a ContentType string to its pipeline stage, if it's a pipeline doc. */
export function stageForType(type: string | undefined): PipelineStageKey | undefined {
  return type ? TYPE_TO_STAGE[type]?.stage : undefined
}

/** Document number is the last whitespace-delimited token of the label (doc numbers have no spaces). */
function docNumberFromLabel(label: string): string | undefined {
  const token = label?.trim().split(/\s+/).pop()
  return token || undefined
}

/**
 * Collapse all links touching a record into a deduped set of pipeline nodes
 * (one per realized document), ready to feed PipelineProgress.
 */
export function nodesFromLinks(links: DocumentLink[]): PipelineNode[] {
  const seen = new Map<string, PipelineNode>()
  const consider = (type: string, id: number, label: string) => {
    const map = TYPE_TO_STAGE[type]
    if (!map) return
    const key = `${type}:${id}`
    if (seen.has(key)) return
    seen.set(key, {
      stage: map.stage,
      docNumber: docNumberFromLabel(label),
      route: map.route ? map.route(id) : undefined,
    })
  }
  for (const link of links) {
    consider(link.source_type, link.source_object_id, link.source_label)
    consider(link.target_type, link.target_object_id, link.target_label)
  }
  return Array.from(seen.values())
}

/** Fetch the full lineage chain for a document (links where it is source OR target). */
export function useDocumentLinks(appLabel: string, modelName: string, objectId: number) {
  return useQuery({
    queryKey: ['document-links', appLabel, modelName, objectId],
    queryFn: async () => {
      const { data } = await api.get<DocumentLink[]>('/document-links/for-object/', {
        params: { app_label: appLabel, model: modelName, object_id: objectId },
      })
      return data
    },
    enabled: !!objectId,
  })
}
