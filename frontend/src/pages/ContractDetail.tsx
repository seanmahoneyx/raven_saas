import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  ArrowLeft, Paperclip, Clock, ChevronDown, ChevronRight,
  Plus, FileText, MoreHorizontal,
} from 'lucide-react'
import FileUpload from '@/components/common/FileUpload'
import { useAttachments } from '@/api/attachments'
import PrintForm from '@/components/common/PrintForm'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  useContract, useUpdateContract, useActivateContract, useDeactivateContract,
  useCompleteContract, useCancelContract,
} from '@/api/contracts'
import { useLocations } from '@/api/parties'
import { ReleaseDialog } from '@/components/contracts/ReleaseDialog'
import type { ContractStatus, ContractLine } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'

/* -- Status badge helper ---------------------------------------- */
const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    draft:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    active:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    complete:  { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)'    },
    cancelled: { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)'  },
    expired:   { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)'  },
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

/* -- Shared button styles --------------------------------------- */
const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }
const dangerBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const dangerBtnStyle: React.CSSProperties = { border: '1px solid var(--so-danger-text)', background: 'var(--so-danger-bg)', color: 'var(--so-danger-text)' }

/* -- Contract line row with expandable releases ----------------- */
function ContractLineRow({
  line,
  contractId,
  contractStatus,
  contractShipTo,
  contractShipToName,
}: {
  line: ContractLine
  contractId: number
  contractStatus: ContractStatus
  contractShipTo?: number | null
  contractShipToName?: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false)

  const progressPct = line.blanket_qty > 0
    ? Math.round((line.released_qty / line.blanket_qty) * 100)
    : 0

  const fmtCurrency = (val: string | number | null) => {
    if (val === null) return '\u2014'
    const num = parseFloat(String(val))
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <>
      <tr style={{ borderBottom: '1px solid var(--so-border-light)' }}>
        {/* Expand toggle */}
        <td className="py-3.5 px-2 pl-5 w-8">
          <button
            className="inline-flex items-center justify-center h-6 w-6 rounded transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </td>
        {/* MSPN + item name */}
        <td className="py-3.5 px-4">
          <div className="font-mono text-[12.5px] font-medium" style={{ color: 'var(--so-text-primary)' }}>{line.item_sku}</div>
          <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--so-text-secondary)' }}>{line.item_name}</div>
        </td>
        {/* Blanket Qty */}
        <td className="py-3.5 px-4 text-right font-mono font-semibold">
          {line.blanket_qty.toLocaleString()}
        </td>
        {/* Released */}
        <td className="py-3.5 px-4 text-right font-mono" style={{ color: 'var(--so-text-secondary)' }}>
          {line.released_qty.toLocaleString()}
        </td>
        {/* Remaining */}
        <td className="py-3.5 px-4 text-right font-mono" style={{ color: line.remaining_qty <= 0 ? 'var(--so-text-tertiary)' : 'var(--so-text-primary)' }}>
          {line.remaining_qty.toLocaleString()}
        </td>
        {/* Progress bar */}
        <td className="py-3.5 px-4">
          <div className="flex items-center gap-2">
            <div className="w-20 h-2 rounded-full overflow-hidden" style={{ background: 'var(--so-border-light)' }}>
              <div
                className="h-full transition-all rounded-full"
                style={{
                  width: `${Math.min(progressPct, 100)}%`,
                  background: progressPct >= 100 ? 'var(--so-success-text)' : 'var(--so-accent)',
                }}
              />
            </div>
            <span className="text-[12px] font-mono w-10 text-right" style={{ color: 'var(--so-text-tertiary)' }}>{progressPct}%</span>
          </div>
        </td>
        {/* Unit Price */}
        <td className="py-3.5 px-4 text-right font-mono" style={{ color: 'var(--so-text-secondary)' }}>
          {line.unit_price ? `$${fmtCurrency(line.unit_price)}` : '\u2014'}
        </td>
        {/* Actions */}
        <td className="py-3.5 px-4 pr-5">
          {contractStatus === 'active' && !line.is_fully_released ? (
            <button
              className={outlineBtnClass}
              style={{ ...outlineBtnStyle, padding: '4px 10px', fontSize: '12px' }}
              onClick={() => setReleaseDialogOpen(true)}
            >
              <Plus className="h-3 w-3" />
              Release
            </button>
          ) : line.is_fully_released ? (
            getStatusBadge('complete')
          ) : null}
        </td>
      </tr>

      {/* Expanded release history */}
      {expanded && line.releases && line.releases.length > 0 && (
        <tr>
          <td colSpan={8} className="p-0" style={{ background: 'var(--so-bg)' }}>
            <div className="px-6 py-4">
              <div className="text-[11.5px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--so-text-tertiary)' }}>
                Release History
              </div>
              <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Date', 'Order #', 'Status', 'Qty', 'Before', 'After'].map((h, i) => (
                      <th
                        key={h}
                        className={`text-[11px] font-semibold uppercase tracking-widest py-2 px-3 ${i >= 3 ? 'text-right' : 'text-left'}`}
                        style={{ color: 'var(--so-text-tertiary)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {line.releases.map((release) => (
                    <tr key={release.id} style={{ borderTop: '1px solid var(--so-border-light)' }}>
                      <td className="py-2 px-3" style={{ color: 'var(--so-text-secondary)' }}>
                        {format(new Date(release.release_date), 'MMM d, yyyy')}
                      </td>
                      <td className="py-2 px-3">
                        <span className="font-mono font-medium" style={{ color: 'var(--so-accent)' }}>
                          SO-{release.sales_order_number}
                        </span>
                      </td>
                      <td className="py-2 px-3">{getStatusBadge(release.sales_order_status)}</td>
                      <td className="py-2 px-3 text-right font-mono font-semibold">{release.quantity_ordered.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: 'var(--so-text-tertiary)' }}>
                        {release.balance_before.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: 'var(--so-text-tertiary)' }}>
                        {release.balance_after.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
      {expanded && (!line.releases || line.releases.length === 0) && (
        <tr>
          <td colSpan={8} className="py-6 text-center text-[13px]" style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)' }}>
            No releases yet
          </td>
        </tr>
      )}

      <ReleaseDialog
        open={releaseDialogOpen}
        onOpenChange={setReleaseDialogOpen}
        contractId={contractId}
        contractLine={line}
        contractShipTo={contractShipTo}
        contractShipToName={contractShipToName}
      />
    </>
  )
}

/* ================================================================ */
export default function ContractDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const contractId = parseInt(id || '0', 10)

  const { data: contract, isLoading } = useContract(contractId)
  const updateContract = useUpdateContract()
  const activateContract = useActivateContract()
  const deactivateContract = useDeactivateContract()
  const completeContract = useCompleteContract()
  const cancelContract = useCancelContract()

  const [isEditing, setIsEditing] = useState(false)
  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  const { data: attachments } = useAttachments('contracts', 'contract', contractId)
  const attachmentCount = attachments?.length ?? 0

  const [activateDialogOpen, setActivateDialogOpen] = useState(false)
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false)
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)

  const [formData, setFormData] = useState({
    blanket_po: '',
    issue_date: '',
    start_date: '',
    end_date: '',
    ship_to: '',
    notes: '',
  })

  const { data: locationsData } = useLocations()
  const locations = locationsData?.results ?? []

  usePageTitle(contract ? `Contract CTR-${contract.contract_number}` : 'Contract Detail')

  useEffect(() => {
    if (isEditing && contract) {
      setFormData({
        blanket_po: contract.blanket_po || '',
        issue_date: contract.issue_date,
        start_date: contract.start_date || '',
        end_date: contract.end_date || '',
        ship_to: contract.ship_to ? String(contract.ship_to) : '',
        notes: contract.notes || '',
      })
    }
  }, [isEditing, contract])

  const customerLocations = contract
    ? locations.filter((l) => l.party === contract.customer)
    : []

  const handleSave = async () => {
    if (!contract) return
    const payload = {
      id: contract.id,
      blanket_po: formData.blanket_po,
      issue_date: formData.issue_date,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
      ship_to: formData.ship_to ? Number(formData.ship_to) : null,
      notes: formData.notes,
    }
    try {
      await updateContract.mutateAsync(payload as any)
      setIsEditing(false)
      toast.success('Contract updated successfully')
    } catch (error) {
      console.error('Failed to save contract:', error)
      toast.error('Failed to save contract')
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
  }

  const handleConfirmActivate = async () => {
    if (!contract) return
    try {
      await activateContract.mutateAsync(contract.id)
      toast.success('Contract activated successfully')
      setActivateDialogOpen(false)
    } catch {
      toast.error('Failed to activate contract')
    }
  }

  const handleConfirmDeactivate = async () => {
    if (!contract) return
    try {
      await deactivateContract.mutateAsync(contract.id)
      toast.success('Contract deactivated successfully')
      setDeactivateDialogOpen(false)
    } catch {
      toast.error('Failed to deactivate contract')
    }
  }

  const handleConfirmComplete = async () => {
    if (!contract) return
    try {
      await completeContract.mutateAsync(contract.id)
      toast.success('Contract completed successfully')
      setCompleteDialogOpen(false)
    } catch {
      toast.error('Failed to complete contract')
    }
  }

  const handleConfirmCancel = async () => {
    if (!contract) return
    try {
      await cancelContract.mutateAsync(contract.id)
      toast.success('Contract cancelled successfully')
      setCancelDialogOpen(false)
    } catch {
      toast.error('Failed to cancel contract')
    }
  }

  /* -- Loading / Not found -------------------------------------- */
  if (isLoading) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!contract) {
    return (
      <div className="raven-page" style={{ minHeight: '100vh' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-7">
          <div className="text-center py-16 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>Contract not found</div>
        </div>
      </div>
    )
  }

  /* -- Helpers -------------------------------------------------- */
  const fmtDate = (d: string | null) => {
    if (!d) return 'Not set'
    return format(new Date(d + 'T00:00:00'), 'MMM d, yyyy')
  }

  const canEdit = contract.status === 'draft' || contract.status === 'active'
  const lineCount = contract.lines?.length ?? 0

  /* -- Detail grid data ----------------------------------------- */
  const detailItems = isEditing
    ? [
        { label: 'Customer', value: contract.customer_name, empty: false, mono: false, editable: false },
        { label: 'Issue Date', value: formData.issue_date, empty: !formData.issue_date, mono: false, editable: true, editNode: (
          <Input
            type="date"
            value={formData.issue_date}
            onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
            className="h-9 text-sm border rounded-md px-2"
            style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
          />
        )},
        { label: 'Blanket PO', value: formData.blanket_po || 'Not set', empty: !formData.blanket_po, mono: true, editable: true, editNode: (
          <Input
            value={formData.blanket_po}
            onChange={(e) => setFormData({ ...formData, blanket_po: e.target.value })}
            placeholder="PO reference"
            className="h-9 text-sm font-mono border rounded-md px-2"
            style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
          />
        )},
        { label: 'Status', value: contract.status, empty: false, mono: false, editable: false, badge: true },
        { label: 'Start Date', value: formData.start_date, empty: !formData.start_date, mono: false, editable: true, editNode: (
          <Input
            type="date"
            value={formData.start_date}
            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            className="h-9 text-sm border rounded-md px-2"
            style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
          />
        )},
        { label: 'End Date', value: formData.end_date, empty: !formData.end_date, mono: false, editable: true, editNode: (
          <Input
            type="date"
            value={formData.end_date}
            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
            className="h-9 text-sm border rounded-md px-2"
            style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
          />
        )},
        { label: 'Ship To', value: formData.ship_to, empty: !formData.ship_to, mono: false, editable: true, editNode: (
          <Select
            value={formData.ship_to}
            onValueChange={(value) => setFormData({ ...formData, ship_to: value })}
          >
            <SelectTrigger
              className="h-9 text-sm border rounded-md"
              style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
            >
              <SelectValue placeholder="Select location..." />
            </SelectTrigger>
            <SelectContent>
              {customerLocations.map((loc) => (
                <SelectItem key={loc.id} value={String(loc.id)}>
                  {loc.code} - {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )},
        { label: 'Lines', value: `${lineCount} item${lineCount !== 1 ? 's' : ''}`, empty: false, mono: false, editable: false },
      ]
    : [
        { label: 'Customer', value: contract.customer_name, empty: false, mono: false },
        { label: 'Issue Date', value: fmtDate(contract.issue_date), empty: false, mono: false },
        { label: 'Blanket PO', value: contract.blanket_po || 'Not set', empty: !contract.blanket_po, mono: true },
        { label: 'Status', value: contract.status, empty: false, mono: false, badge: true },
        { label: 'Start Date', value: fmtDate(contract.start_date), empty: !contract.start_date, mono: false },
        { label: 'End Date', value: fmtDate(contract.end_date), empty: !contract.end_date, mono: false },
        { label: 'Ship To', value: contract.ship_to_name || 'Not set', empty: !contract.ship_to_name, mono: false },
        { label: 'Lines', value: `${lineCount} item${lineCount !== 1 ? 's' : ''}`, empty: false, mono: false },
      ]

  /* -- Summary stats for detail grid ---------------------------- */
  const summaryItems = [
    { label: 'Total Committed', value: contract.total_committed_qty.toLocaleString() },
    { label: 'Released', value: contract.total_released_qty.toLocaleString() },
    { label: 'Remaining', value: contract.total_remaining_qty.toLocaleString() },
    { label: 'Completion', value: `${contract.completion_percentage}%`, pct: contract.completion_percentage },
  ]

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */
  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      {/* Print Form (hidden on screen, visible in print) */}
      <PrintForm
        title="Contract"
        documentNumber={`CTR-${contract.contract_number}`}
        status={contract.status.charAt(0).toUpperCase() + contract.status.slice(1)}
        fields={[
          { label: 'Customer', value: contract.customer_name },
          { label: 'Issue Date', value: fmtDate(contract.issue_date) },
          { label: 'Blanket PO', value: contract.blanket_po || null },
          { label: 'Start Date', value: contract.start_date ? fmtDate(contract.start_date) : null },
          { label: 'Ship To', value: contract.ship_to_name || null },
          { label: 'End Date', value: contract.end_date ? fmtDate(contract.end_date) : null },
        ]}
        summary={[
          { label: 'Total Committed', value: contract.total_committed_qty.toLocaleString() },
          { label: 'Total Released', value: contract.total_released_qty.toLocaleString() },
          { label: 'Remaining', value: contract.total_remaining_qty.toLocaleString() },
          { label: 'Completion', value: `${contract.completion_percentage}%` },
        ]}
        notes={contract.notes}
        columns={[
          { header: 'MSPN' },
          { header: 'Item Name' },
          { header: 'Blanket Qty', align: 'right' },
          { header: 'Released', align: 'right' },
          { header: 'Remaining', align: 'right' },
          { header: 'Unit Price', align: 'right' },
          { header: 'Progress', align: 'center' },
        ]}
        rows={contract.lines?.map((line) => {
          const pct = line.blanket_qty > 0 ? Math.round((line.released_qty / line.blanket_qty) * 100) : 0
          return [
            line.item_sku,
            line.item_name,
            line.blanket_qty.toLocaleString(),
            line.released_qty.toLocaleString(),
            line.remaining_qty.toLocaleString(),
            line.unit_price ? `$${parseFloat(line.unit_price).toFixed(2)}` : '\u2014',
            `${pct}%`,
          ]
        }) || []}
      />

      {/* -- Main content ---------------------------------------- */}
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16" data-print-hide>

        {/* -- Breadcrumb ---------------------------------------- */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate('/contracts')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Contracts
          </button>
          <span style={{ color: 'var(--so-border)' }} className="text-[13px]">/</span>
          <span className="text-[13px] font-medium" style={{ color: 'var(--so-text-secondary)' }}>CTR-{contract.contract_number}</span>
        </div>

        {/* -- Title row ----------------------------------------- */}
        <div className="flex items-start justify-between gap-4 mb-7 animate-in delay-1">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>CTR-{contract.contract_number}</h1>
              {getStatusBadge(contract.status)}
            </div>
            <div className="text-sm" style={{ color: 'var(--so-text-secondary)' }}>
              <strong className="font-semibold" style={{ color: 'var(--so-text-primary)' }}>{contract.customer_name}</strong>
              {contract.blanket_po && <>{' \u00b7 PO: '}{contract.blanket_po}</>}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {isEditing ? (
              <>
                <button className={outlineBtnClass} style={outlineBtnStyle} onClick={handleCancel}>
                  Cancel
                </button>
                <button className={primaryBtnClass} style={primaryBtnStyle} onClick={handleSave} disabled={updateContract.isPending}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  {updateContract.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                {/* Status-based actions */}
                {contract.status === 'draft' && (
                  <button
                    className={primaryBtnClass}
                    style={{ ...primaryBtnStyle, opacity: contract.num_lines === 0 ? 0.5 : 1 }}
                    onClick={() => setActivateDialogOpen(true)}
                    disabled={contract.num_lines === 0}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    Activate
                  </button>
                )}
                {contract.status === 'active' && (
                  <>
                    <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setDeactivateDialogOpen(true)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                      Deactivate
                    </button>
                    <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setCompleteDialogOpen(true)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                      Complete
                    </button>
                    <button className={dangerBtnClass} style={dangerBtnStyle} onClick={() => setCancelDialogOpen(true)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                      Cancel
                    </button>
                  </>
                )}
                <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setAttachmentsOpen(true)}>
                  <Paperclip className="h-3.5 w-3.5" />
                  Attach
                  {attachmentCount > 0 && (
                    <span className="ml-0.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-bold text-white" style={{ background: 'var(--so-accent)' }}>
                      {attachmentCount}
                    </span>
                  )}
                </button>
                <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => window.print()}>
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  More
                </button>
                {canEdit && (
                  <button className={primaryBtnClass} style={primaryBtnStyle} onClick={() => setIsEditing(true)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* -- Contract Details Card ----------------------------- */}
        <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          {/* Card header */}
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Contract Details</span>
          </div>

          {/* Detail grid: 4 columns */}
          <div className="grid grid-cols-4" style={{ borderTop: 'none' }}>
            {detailItems.map((item, idx) => (
              <div
                key={idx}
                className="px-5 py-4"
                style={{
                  borderRight: (idx + 1) % 4 !== 0 ? '1px solid var(--so-border-light)' : 'none',
                  borderBottom: idx < 4 ? '1px solid var(--so-border-light)' : 'none',
                }}
              >
                <div
                  className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5"
                  style={{ color: 'var(--so-text-tertiary)' }}
                >
                  {item.label}
                </div>
                {'editable' in item && item.editable && 'editNode' in item ? (
                  (item as { editNode: React.ReactNode }).editNode
                ) : item.badge ? (
                  /* Status badge inside the grid cell */
                  <div className="flex items-center gap-2">
                    {getStatusBadge(String(item.value))}
                    <span className="text-[12px] font-mono" style={{ color: 'var(--so-text-tertiary)' }}>
                      {contract.completion_percentage}%
                    </span>
                  </div>
                ) : (
                  <div
                    className={`text-sm font-medium ${item.mono ? 'font-mono' : ''}`}
                    style={{
                      color: item.empty ? 'var(--so-text-tertiary)' : 'var(--so-text-primary)',
                      fontStyle: item.empty ? 'italic' : 'normal',
                    }}
                  >
                    {item.value}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Summary row */}
          <div
            className="grid grid-cols-4"
            style={{ borderTop: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}
          >
            {summaryItems.map((si, idx) => (
              <div
                key={idx}
                className="px-5 py-3.5"
                style={{
                  borderRight: idx < 3 ? '1px solid var(--so-border-light)' : 'none',
                }}
              >
                <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1" style={{ color: 'var(--so-text-tertiary)' }}>
                  {si.label}
                </div>
                {'pct' in si ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--so-border-light)', maxWidth: '80px' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(si.pct ?? 0, 100)}%`,
                          background: (si.pct ?? 0) >= 100 ? 'var(--so-success-text)' : 'var(--so-accent)',
                        }}
                      />
                    </div>
                    <span className="font-mono text-sm font-bold" style={{ color: 'var(--so-text-primary)' }}>{si.value}</span>
                  </div>
                ) : (
                  <span className="font-mono text-sm font-bold" style={{ color: 'var(--so-text-primary)' }}>{si.value}</span>
                )}
              </div>
            ))}
          </div>

          {/* Notes section */}
          {isEditing ? (
            <div className="px-5 py-4" style={{ borderTop: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}>
              <div className="text-[11.5px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--so-text-tertiary)' }}>Notes</div>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Contract notes..."
                className="h-9 text-sm border rounded-md px-2"
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>
          ) : contract.notes ? (
            <div
              className="flex items-start gap-2.5 px-5 py-4"
              style={{ borderTop: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}
            >
              <FileText className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--so-text-tertiary)', opacity: 0.6 }} />
              <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--so-text-secondary)' }}>{contract.notes}</p>
            </div>
          ) : null}
        </div>

        {/* -- Line Items Card ----------------------------------- */}
        <div className="rounded-[14px] border overflow-hidden mb-4 animate-in delay-3" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          {/* Card header */}
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Line Items</span>
            <span className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>
              {lineCount} {lineCount === 1 ? 'item' : 'items'}
            </span>
          </div>

          {/* Line items table */}
          {contract.lines && contract.lines.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[
                      { label: '', align: 'text-left', cls: 'pl-5 w-8' },
                      { label: 'MSPN', align: 'text-left', cls: 'w-[28%]' },
                      { label: 'Blanket Qty', align: 'text-right', cls: '' },
                      { label: 'Released', align: 'text-right', cls: '' },
                      { label: 'Remaining', align: 'text-right', cls: '' },
                      { label: 'Progress', align: 'text-left', cls: '' },
                      { label: 'Unit Price', align: 'text-right', cls: '' },
                      { label: 'Actions', align: 'text-left', cls: 'pr-5' },
                    ].map((col, i) => (
                      <th
                        key={col.label || `blank-${i}`}
                        className={`text-[11px] font-semibold uppercase tracking-widest py-2.5 px-4 ${col.align} ${col.cls}`}
                        style={{ background: 'var(--so-bg)', color: 'var(--so-text-tertiary)' }}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contract.lines.map((line) => (
                    <ContractLineRow
                      key={line.id}
                      line={line}
                      contractId={contract.id}
                      contractStatus={contract.status}
                      contractShipTo={contract.ship_to}
                      contractShipToName={contract.ship_to_name}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
              No line items
            </div>
          )}
        </div>

        {/* -- Two-column: Attachments + Activity ---------------- */}
        {!isEditing && (
          <div className="grid grid-cols-2 gap-4 mt-4 animate-in delay-4">
            {/* Attachments Card */}
            <div className="rounded-[14px] border overflow-hidden" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                <span className="text-sm font-semibold">Attachments</span>
                {attachmentCount > 0 && (
                  <span className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>{attachmentCount} {attachmentCount === 1 ? 'file' : 'files'}</span>
                )}
              </div>
              <button
                onClick={() => setAttachmentsOpen(true)}
                className="w-full text-center py-8 px-6 transition-colors cursor-pointer"
                style={{ color: 'var(--so-text-tertiary)', fontSize: '13.5px' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Paperclip className="h-7 w-7 mx-auto mb-2 opacity-25" />
                {attachmentCount > 0 ? `${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}` : 'No attachments yet'}
              </button>
            </div>

            {/* Activity Card */}
            <div className="rounded-[14px] border overflow-hidden" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                <span className="text-sm font-semibold">Activity</span>
              </div>
              <div className="text-center py-8 px-6" style={{ color: 'var(--so-text-tertiary)', fontSize: '13.5px' }}>
                <Clock className="h-7 w-7 mx-auto mb-2 opacity-25" />
                No activity recorded
              </div>
            </div>
          </div>
        )}
      </div>

      {/* -- Attachments Dialog ---------------------------------- */}
      <Dialog open={attachmentsOpen} onOpenChange={setAttachmentsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Attachments</DialogTitle>
          </DialogHeader>
          <FileUpload appLabel="contracts" modelName="contract" objectId={contractId} />
        </DialogContent>
      </Dialog>

      {/* -- Confirm Dialogs ------------------------------------- */}
      <ConfirmDialog
        open={activateDialogOpen}
        onOpenChange={setActivateDialogOpen}
        title="Activate Contract"
        description="Activate this contract? It will become available for releases."
        confirmLabel="Activate"
        variant="default"
        onConfirm={handleConfirmActivate}
        loading={activateContract.isPending}
      />

      <ConfirmDialog
        open={deactivateDialogOpen}
        onOpenChange={setDeactivateDialogOpen}
        title="Deactivate Contract"
        description="Revert this contract to draft? It will no longer be available for releases."
        confirmLabel="Deactivate"
        variant="destructive"
        onConfirm={handleConfirmDeactivate}
        loading={deactivateContract.isPending}
      />

      <ConfirmDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        title="Complete Contract"
        description="Mark this contract as complete? This cannot be undone."
        confirmLabel="Complete"
        variant="default"
        onConfirm={handleConfirmComplete}
        loading={completeContract.isPending}
      />

      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title="Cancel Contract"
        description="Are you sure you want to cancel this contract? This action cannot be undone."
        confirmLabel="Cancel Contract"
        variant="destructive"
        onConfirm={handleConfirmCancel}
        loading={cancelContract.isPending}
      />
    </div>
  )
}
