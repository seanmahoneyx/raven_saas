import { useMemo } from 'react'
import PipelineProgress from './PipelineProgress'
import type { PipelineNode, PipelineStageKey } from './PipelineProgress'
import { useDocumentLinks, nodesFromLinks, stageForType } from '../../api/documentLinks'

interface DocumentPipelineProps {
  /** ContentType app label of the viewed record, e.g. "orders". */
  appLabel: string
  /** ContentType model name of the viewed record, e.g. "estimate". */
  modelName: string
  objectId: number
  /** "app.model" of the viewed record so its own stage is highlighted as current. */
  selfType: string
  /** This record's own number (e.g. "EST-1001") for the current node. */
  selfDocNumber?: string
  className?: string
}

/**
 * Epic 6 lineage ledger: renders the Estimate -> ... -> Deposit pipeline for a
 * record, marking realized stages (from DocumentLink edges) as done, the viewed
 * record as current, and downstream stages as pending. Hidden for records that
 * aren't part of the transaction pipeline.
 */
export default function DocumentPipeline({
  appLabel,
  modelName,
  objectId,
  selfType,
  selfDocNumber,
  className,
}: DocumentPipelineProps) {
  const { data: links } = useDocumentLinks(appLabel, modelName, objectId)
  const currentStage = stageForType(selfType)

  const nodes = useMemo<PipelineNode[]>(() => {
    const fromLinks = nodesFromLinks(links ?? [])
    if (!currentStage) return fromLinks
    // Guarantee the viewed record's own node exists (chain may have no links yet).
    if (!fromLinks.some((n) => n.stage === currentStage)) {
      fromLinks.push({ stage: currentStage, docNumber: selfDocNumber })
    }
    return fromLinks
  }, [links, currentStage, selfDocNumber])

  if (!currentStage) return null

  return (
    <div
      className={`rounded-[14px] border px-5 py-4 ${className ?? ''}`}
      style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
    >
      <div
        className="mb-3 text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--so-text-tertiary)' }}
      >
        Transaction Pipeline
      </div>
      <PipelineProgress nodes={nodes} currentStage={currentStage as PipelineStageKey} />
    </div>
  )
}
