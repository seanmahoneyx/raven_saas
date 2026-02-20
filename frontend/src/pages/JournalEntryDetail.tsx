import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ArrowLeft, Check, Undo2 } from 'lucide-react'
import { useJournalEntry, usePostJournalEntry, useReverseJournalEntry } from '@/api/accounting'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import PrintForm from '@/components/common/PrintForm'

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
}

/* ── Status badge helper ─────────────────────────────── */
const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    draft:    { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    posted:   { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    reversed: { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)'  },
  }
  const c = configs[status] || configs.draft
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ background: c.text }} />
      {status}
    </span>
  )
}

/* ── Shared button styles ────────────────────────────── */
const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

/* ═══════════════════════════════════════════════════════ */
export default function JournalEntryDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: entry, isLoading } = useJournalEntry(parseInt(id!))
  const postMutation = usePostJournalEntry()
  const reverseMutation = useReverseJournalEntry()

  const [postDialogOpen, setPostDialogOpen] = useState(false)
  const [reverseDialogOpen, setReverseDialogOpen] = useState(false)

  usePageTitle(entry ? `Entry ${entry.entry_number}` : 'Journal Entry')

  const handleConfirmPost = async () => {
    if (!entry) return
    try {
      await postMutation.mutateAsync(entry.id)
      toast.success('Journal entry posted successfully')
      setPostDialogOpen(false)
    } catch (error) {
      console.error('Failed to post entry:', error)
      toast.error('Failed to post entry')
    }
  }

  const handleConfirmReverse = async () => {
    if (!entry) return
    try {
      await reverseMutation.mutateAsync({ id: entry.id })
      toast.success('Journal entry reversed successfully')
      setReverseDialogOpen(false)
    } catch (error) {
      console.error('Failed to reverse entry:', error)
      toast.error('Failed to reverse entry')
    }
  }

  /* ── Loading / Not Found ───────────────────────── */
  if (isLoading) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!entry) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Entry not found</div>
        </div>
      </div>
    )
  }

  const totalDebit = parseFloat(entry.total_debit) || 0
  const totalCredit = parseFloat(entry.total_credit) || 0
  const lineCount = entry.lines?.length ?? 0

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      {/* Print Form (hidden on screen, visible in print) */}
      <PrintForm
        title="Journal Entry"
        documentNumber={entry.entry_number}
        status={entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
        fields={[
          { label: 'Date', value: new Date(entry.date + 'T00:00:00').toLocaleDateString() },
          { label: 'Entry Type', value: entry.entry_type.charAt(0).toUpperCase() + entry.entry_type.slice(1) },
          { label: 'Reference #', value: entry.reference_number || null },
          { label: 'Balanced', value: entry.is_balanced ? 'Yes' : 'No' },
          { label: 'Memo', value: entry.memo },
          { label: 'Posted At', value: entry.posted_at ? new Date(entry.posted_at).toLocaleString() : null },
        ]}
        columns={[
          { header: 'Account Code' },
          { header: 'Account Name' },
          { header: 'Description' },
          { header: 'Debit', align: 'right' },
          { header: 'Credit', align: 'right' },
        ]}
        rows={entry.lines?.map(line => [
          line.account_code,
          line.account_name,
          line.description,
          line.debit !== '0.00' ? formatCurrency(line.debit) : '—',
          line.credit !== '0.00' ? formatCurrency(line.credit) : '—',
        ]) || []}
        totals={[
          { label: 'Totals:', value: `${formatCurrency(entry.total_debit)} / ${formatCurrency(entry.total_credit)}` },
        ]}
      />

      {/* ── Main content ──────────────────────────── */}
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16" data-print-hide>

        {/* ── Breadcrumb ─────────────────────────── */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate('/journal-entries')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Journal Entries
          </button>
          <span style={{ color: 'var(--so-border)' }} className="text-[13px]">/</span>
          <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>{entry.entry_number}</span>
        </div>

        {/* ── Title row ──────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-7 animate-in delay-1">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>{entry.entry_number}</h1>
              {getStatusBadge(entry.status)}
            </div>
            <div className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>
              {new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {entry.status === 'draft' && (
              <button
                className={primaryBtnClass}
                style={primaryBtnStyle}
                onClick={() => setPostDialogOpen(true)}
                disabled={postMutation.isPending}
              >
                <Check className="h-3.5 w-3.5" />
                {postMutation.isPending ? 'Posting...' : 'Post Entry'}
              </button>
            )}
            {entry.status === 'posted' && (
              <button
                className={outlineBtnClass}
                style={outlineBtnStyle}
                onClick={() => setReverseDialogOpen(true)}
                disabled={reverseMutation.isPending}
              >
                <Undo2 className="h-3.5 w-3.5" />
                {reverseMutation.isPending ? 'Reversing...' : 'Reverse Entry'}
              </button>
            )}
          </div>
        </div>

        {/* ── Entry Details Card ─────────────────── */}
        <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          {/* Card header */}
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Entry Details</span>
          </div>

          {/* Detail grid — Row 1: Date | Entry Type | Reference # | Balanced */}
          <div className="grid grid-cols-4">
            {/* Date */}
            <div
              className="px-5 py-4"
              style={{ borderRight: '1px solid var(--so-border-light)', borderBottom: '1px solid var(--so-border-light)' }}
            >
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Date
              </div>
              <div className="text-sm font-medium" style={{ color: 'var(--so-text-primary)' }}>
                {new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>

            {/* Entry Type */}
            <div
              className="px-5 py-4"
              style={{ borderRight: '1px solid var(--so-border-light)', borderBottom: '1px solid var(--so-border-light)' }}
            >
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Entry Type
              </div>
              <div className="text-sm font-medium" style={{ color: 'var(--so-text-primary)' }}>
                {entry.entry_type.charAt(0).toUpperCase() + entry.entry_type.slice(1)}
              </div>
            </div>

            {/* Reference # */}
            <div
              className="px-5 py-4"
              style={{ borderRight: '1px solid var(--so-border-light)', borderBottom: '1px solid var(--so-border-light)' }}
            >
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Reference #
              </div>
              <div
                className="text-sm font-medium font-mono"
                style={{ color: entry.reference_number ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)', fontStyle: entry.reference_number ? 'normal' : 'italic' }}
              >
                {entry.reference_number || 'None'}
              </div>
            </div>

            {/* Balanced */}
            <div
              className="px-5 py-4"
              style={{ borderBottom: '1px solid var(--so-border-light)' }}
            >
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Balanced
              </div>
              <div
                className="text-sm font-semibold"
                style={{ color: entry.is_balanced ? 'var(--so-success-text)' : 'var(--so-danger-text)' }}
              >
                {entry.is_balanced ? 'Yes' : 'No'}
              </div>
            </div>

            {/* Memo — spans 2 cols */}
            <div
              className="px-5 py-4 col-span-2"
              style={{ borderRight: '1px solid var(--so-border-light)' }}
            >
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Memo
              </div>
              <div
                className="text-sm font-medium"
                style={{ color: entry.memo ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)', fontStyle: entry.memo ? 'normal' : 'italic' }}
              >
                {entry.memo || 'No memo'}
              </div>
            </div>

            {/* Posted At */}
            <div
              className="px-5 py-4"
              style={{ borderRight: '1px solid var(--so-border-light)' }}
            >
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Posted At
              </div>
              <div
                className="text-sm font-medium"
                style={{ color: entry.posted_at ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)', fontStyle: entry.posted_at ? 'normal' : 'italic' }}
              >
                {entry.posted_at ? new Date(entry.posted_at).toLocaleString() : 'Not posted'}
              </div>
            </div>

            {/* Created At */}
            <div className="px-5 py-4">
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>
                Created At
              </div>
              <div className="text-sm font-medium" style={{ color: 'var(--so-text-primary)' }}>
                {new Date(entry.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* ── Journal Lines Card ─────────────────── */}
        <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          {/* Card header */}
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Journal Lines</span>
            <span className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>
              {lineCount} {lineCount === 1 ? 'line' : 'lines'}
            </span>
          </div>

          {entry.lines && entry.lines.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[
                      { label: 'Account Code', align: 'text-left', cls: 'pl-6' },
                      { label: 'Account Name', align: 'text-left', cls: '' },
                      { label: 'Description', align: 'text-left', cls: '' },
                      { label: 'Debit', align: 'text-right', cls: '' },
                      { label: 'Credit', align: 'text-right', cls: 'pr-6' },
                    ].map((col) => (
                      <th
                        key={col.label}
                        className={`text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 ${col.align} ${col.cls}`}
                        style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)' }}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entry.lines.map((line) => (
                    <tr key={line.id} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                      {/* Account Code */}
                      <td className="py-3.5 px-4 pl-6 font-mono text-[13px]" style={{ color: 'var(--so-text-primary)' }}>
                        {line.account_code}
                      </td>
                      {/* Account Name */}
                      <td className="py-3.5 px-4" style={{ color: 'var(--so-text-primary)' }}>
                        {line.account_name}
                      </td>
                      {/* Description */}
                      <td className="py-3.5 px-4" style={{ color: 'var(--so-text-secondary)' }}>
                        {line.description || <span style={{ color: 'var(--so-text-tertiary)', fontStyle: 'italic' }}>—</span>}
                      </td>
                      {/* Debit */}
                      <td className="py-3.5 px-4 text-right font-mono" style={{ color: 'var(--so-text-primary)' }}>
                        {line.debit !== '0.00' ? formatCurrency(line.debit) : <span style={{ color: 'var(--so-text-tertiary)' }}>-</span>}
                      </td>
                      {/* Credit */}
                      <td className="py-3.5 px-4 text-right font-mono pr-6" style={{ color: 'var(--so-text-primary)' }}>
                        {line.credit !== '0.00' ? formatCurrency(line.credit) : <span style={{ color: 'var(--so-text-tertiary)' }}>-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--so-text-primary)' }}>
                    <td colSpan={3} className="py-3.5 px-4 pl-6 text-right">
                      <span className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--so-text-secondary)' }}>
                        Totals
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold" style={{ color: 'var(--so-text-primary)' }}>
                      {totalDebit > 0 ? formatCurrency(totalDebit) : <span style={{ color: 'var(--so-text-tertiary)' }}>-</span>}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold pr-6" style={{ color: 'var(--so-text-primary)' }}>
                      {totalCredit > 0 ? formatCurrency(totalCredit) : <span style={{ color: 'var(--so-text-tertiary)' }}>-</span>}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
              No journal lines
            </div>
          )}
        </div>

      </div>

      {/* ── Confirm Dialogs ────────────────────────── */}
      <ConfirmDialog
        open={postDialogOpen}
        onOpenChange={setPostDialogOpen}
        title="Post Journal Entry"
        description="Are you sure you want to post this entry? This action cannot be undone."
        confirmLabel="Post Entry"
        variant="default"
        onConfirm={handleConfirmPost}
        loading={postMutation.isPending}
      />

      <ConfirmDialog
        open={reverseDialogOpen}
        onOpenChange={setReverseDialogOpen}
        title="Reverse Journal Entry"
        description="Are you sure you want to reverse this entry? This will create a reversing entry."
        confirmLabel="Reverse Entry"
        variant="destructive"
        onConfirm={handleConfirmReverse}
        loading={reverseMutation.isPending}
      />
    </div>
  )
}
