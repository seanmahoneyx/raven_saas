import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'

/**
 * Canonical transaction pipeline (Epic 6). A document's position in this
 * sequence drives the progress ledger shown inside each record view.
 */
export const PIPELINE_STAGES = [
  { key: 'estimate', label: 'Estimate' },
  { key: 'contract', label: 'Contract' },
  { key: 'sales_order', label: 'Sales Order' },
  { key: 'pick_ticket', label: 'Pick Ticket' },
  { key: 'bol', label: 'BOL' },
  { key: 'invoice', label: 'Invoice' },
  { key: 'payment', label: 'Payment' },
  { key: 'deposit', label: 'Deposit' },
] as const

export type PipelineStageKey = (typeof PIPELINE_STAGES)[number]['key']

export interface PipelineNode {
  /** Which stage this realized document occupies. */
  stage: PipelineStageKey
  /** Human label, e.g. "EST-1042". */
  docNumber?: string
  /** SPA route to open this document, e.g. "/estimates/12". */
  route?: string
}

interface PipelineProgressProps {
  /** Documents that actually exist in this chain, keyed by stage. */
  nodes: PipelineNode[]
  /** The stage of the record currently being viewed (gets the "current" ring). */
  currentStage: PipelineStageKey
  className?: string
}

type Resolved = {
  key: PipelineStageKey
  label: string
  state: 'done' | 'current' | 'pending'
  node?: PipelineNode
}

/**
 * Horizontal stepper showing the lifecycle of a transaction
 * (Estimate -> Contract -> ... -> Deposit). Stages with a realized document
 * are clickable and rendered as "done"; the viewed record is "current";
 * downstream stages are "pending".
 */
export default function PipelineProgress({ nodes, currentStage, className }: PipelineProgressProps) {
  const navigate = useNavigate()
  const byStage = new Map(nodes.map((n) => [n.stage, n]))
  const currentIdx = PIPELINE_STAGES.findIndex((s) => s.key === currentStage)

  const resolved: Resolved[] = PIPELINE_STAGES.map((s, idx) => {
    const node = byStage.get(s.key)
    let state: Resolved['state']
    if (s.key === currentStage) state = 'current'
    else if (node || idx < currentIdx) state = 'done'
    else state = 'pending'
    return { key: s.key, label: s.label, state, node }
  })

  const colorFor = (state: Resolved['state']) => {
    if (state === 'done') return { dot: 'var(--so-success-text)', bg: 'var(--so-success-bg)', text: 'var(--so-text)' }
    if (state === 'current') return { dot: 'var(--so-info-text)', bg: 'var(--so-info-bg)', text: 'var(--so-text)' }
    return { dot: 'var(--so-text-tertiary)', bg: 'var(--so-bg)', text: 'var(--so-text-tertiary)' }
  }

  return (
    <div
      className={`flex items-stretch overflow-x-auto ${className ?? ''}`}
      role="list"
      aria-label="Transaction pipeline progress"
    >
      {resolved.map((r, idx) => {
        const c = colorFor(r.state)
        const clickable = !!r.node?.route
        const connectorDone = idx > 0 && (resolved[idx - 1].state === 'done' || resolved[idx - 1].state === 'current')
        return (
          <div key={r.key} role="listitem" className="flex items-center min-w-0">
            {idx > 0 && (
              <span
                aria-hidden
                className="h-px w-5 shrink-0 sm:w-8"
                style={{ background: connectorDone ? 'var(--so-success-text)' : 'var(--so-border)' }}
              />
            )}
            <button
              type="button"
              disabled={!clickable}
              onClick={() => r.node?.route && navigate(r.node.route)}
              title={r.node?.docNumber ? `${r.label} — ${r.node.docNumber}` : r.label}
              className="flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors disabled:cursor-default"
              style={{
                background: c.bg,
                border: r.state === 'current' ? '1.5px solid var(--so-info-text)' : '1px solid transparent',
                cursor: clickable ? 'pointer' : 'default',
              }}
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                style={{ background: r.state === 'pending' ? 'transparent' : c.dot, border: `1.5px solid ${c.dot}` }}
              >
                {r.state === 'done' && <Check className="h-2.5 w-2.5" style={{ color: 'var(--so-surface)' }} strokeWidth={3} />}
              </span>
              <span className="flex flex-col items-start leading-tight">
                <span className="text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: c.text }}>
                  {r.label}
                </span>
                {r.node?.docNumber && (
                  <span className="text-[10.5px] font-mono" style={{ color: 'var(--so-text-tertiary)' }}>
                    {r.node.docNumber}
                  </span>
                )}
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
