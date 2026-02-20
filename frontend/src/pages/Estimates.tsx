import { useState, useMemo, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, MoreHorizontal, Pencil, Trash2, Send, ArrowRightLeft, FileText, AlertTriangle, FileDown, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useEstimates, useDeleteEstimate, useSendEstimate, useConvertEstimate } from '@/api/estimates'
import { EstimateDialog } from '@/components/estimates/EstimateDialog'
import type { Estimate, EstimateStatus } from '@/types/api'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { useSettings } from '@/api/settings'
import { ReportFilterModal, type ReportFilterConfig, type ReportFilterResult } from '@/components/common/ReportFilterModal'

const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; border: string; text: string }> = {
    draft:     { bg: 'var(--so-warning-bg)',  border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' },
    active:    { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    inactive:  { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    sent:      { bg: 'var(--so-info-bg)',     border: 'transparent',              text: 'var(--so-info-text)' },
    accepted:  { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    rejected:  { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
    converted: { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    received:  { bg: 'var(--so-success-bg)',  border: 'transparent',              text: 'var(--so-success-text)' },
    cancelled: { bg: 'var(--so-danger-bg)',   border: 'transparent',              text: 'var(--so-danger-text)' },
  }
  const c = configs[status] || { bg: 'var(--so-warning-bg)', border: 'var(--so-warning-border)', text: 'var(--so-warning-text)' }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ background: c.text }} />
      {status}
    </span>
  )
}

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

export default function Estimates() {
  usePageTitle('Estimates')
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEstimate, setEditingEstimate] = useState<Estimate | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const [pendingConvertId, setPendingConvertId] = useState<number | null>(null)

  // Handle URL params for action=new
  useEffect(() => {
    const action = searchParams.get('action')
    if (action === 'new') {
      setEditingEstimate(null)
      setDialogOpen(true)
      searchParams.delete('action')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const { data: estimatesData } = useEstimates()
  const { data: settings } = useSettings()
  const [printFilterOpen, setPrintFilterOpen] = useState(false)
  const [printFilters, setPrintFilters] = useState<ReportFilterResult | null>(null)

  const reportFilterConfig: ReportFilterConfig = {
    title: 'Estimates List',
    columns: [
      { key: 'estimate_number', header: 'Estimate #' },
      { key: 'customer_name', header: 'Customer' },
      { key: 'date', header: 'Date' },
      { key: 'expiration_date', header: 'Expires' },
      { key: 'status', header: 'Status' },
      { key: 'num_lines', header: 'Lines' },
      { key: 'total_amount', header: 'Total' },
    ],
    rowFilters: [
      {
        key: 'status',
        label: 'Status',
        options: ['draft', 'sent', 'accepted', 'rejected', 'converted', 'cancelled'].map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
      },
    ],
  }

  const handleFilteredPrint = (filters: ReportFilterResult) => {
    setPrintFilters(filters)
    setTimeout(() => window.print(), 100)
  }

  const deleteEstimate = useDeleteEstimate()
  const sendEstimate = useSendEstimate()
  const convertEstimate = useConvertEstimate()

  const handleAddNew = () => {
    setEditingEstimate(null)
    setDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return
    try {
      await deleteEstimate.mutateAsync(pendingDeleteId)
      toast.success('Estimate deleted successfully')
      setDeleteDialogOpen(false)
      setPendingDeleteId(null)
    } catch (error) {
      toast.error('Failed to delete estimate')
    }
  }

  const handleConfirmConvert = async () => {
    if (!pendingConvertId) return
    try {
      await convertEstimate.mutateAsync(pendingConvertId)
      toast.success('Estimate converted to Sales Order')
      setConvertDialogOpen(false)
      setPendingConvertId(null)
    } catch (error) {
      toast.error('Failed to convert estimate')
    }
  }

  const columns: ColumnDef<Estimate>[] = useMemo(
    () => [
      {
        accessorKey: 'estimate_number',
        header: 'Estimate #',
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.getValue('estimate_number')}</span>
        ),
      },
      {
        accessorKey: 'customer_name',
        header: 'Customer',
      },
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ row }) => format(new Date(row.getValue('date')), 'MMM d, yyyy'),
      },
      {
        accessorKey: 'expiration_date',
        header: 'Expires',
        cell: ({ row }) => {
          const date = row.getValue('expiration_date') as string | null
          const estimate = row.original
          if (!date) return <span style={{ color: 'var(--so-text-tertiary)' }}>-</span>
          return (
            <span className={estimate.is_expired ? 'flex items-center gap-1' : ''}
              style={estimate.is_expired ? { color: 'var(--so-danger-text)' } : undefined}>
              {estimate.is_expired && <AlertTriangle className="h-3 w-3" />}
              {format(new Date(date), 'MMM d, yyyy')}
            </span>
          )
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => getStatusBadge(row.getValue('status') as EstimateStatus),
      },
      {
        accessorKey: 'num_lines',
        header: 'Lines',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-tertiary)' }}>{row.getValue('num_lines')}</span>
        ),
      },
      {
        accessorKey: 'total_amount',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-medium">
            ${parseFloat(row.getValue('total_amount')).toFixed(2)}
          </span>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const est = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setEditingEstimate(est)
                  setDialogOpen(true)
                }}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                {est.status === 'draft' && (
                  <DropdownMenuItem onClick={() => {
                    sendEstimate.mutate({ id: est.id })
                    toast.success('Estimate sent to customer')
                  }}>
                    <Send className="mr-2 h-4 w-4" />
                    Send to Customer
                  </DropdownMenuItem>
                )}
                {(est.status === 'accepted' || est.status === 'draft' || est.status === 'sent') && (
                  <DropdownMenuItem onClick={() => {
                    setPendingConvertId(est.id)
                    setConvertDialogOpen(true)
                  }}>
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    Convert to Sales Order
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => window.open(`/api/v1/estimates/${est.id}/pdf/`, '_blank')}>
                  <FileDown className="mr-2 h-4 w-4" />
                  Download PDF
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    setPendingDeleteId(est.id)
                    setDeleteDialogOpen(true)
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [deleteEstimate, sendEstimate, convertEstimate]
  )

  const estimates = estimatesData?.results ?? []

  const printFilteredEstimates = useMemo(() => {
    let rows = estimates
    if (printFilters) {
      if (printFilters.rowFilters.status && printFilters.rowFilters.status !== 'all') {
        rows = rows.filter(r => r.status === printFilters.rowFilters.status)
      }
      // Apply date filter
      if (printFilters.dateFrom) {
        rows = rows.filter(r => r.date >= printFilters.dateFrom)
      }
      if (printFilters.dateTo) {
        rows = rows.filter(r => r.date <= printFilters.dateTo)
      }
    }
    return rows
  }, [estimates, printFilters])

  const kpiStats = [
    { label: 'Draft',     value: estimates.filter((e) => e.status === 'draft').length,     status: 'draft' },
    { label: 'Sent',      value: estimates.filter((e) => e.status === 'sent').length,      status: 'sent' },
    { label: 'Accepted',  value: estimates.filter((e) => e.status === 'accepted').length,  status: 'accepted' },
    { label: 'Rejected',  value: estimates.filter((e) => e.status === 'rejected').length,  status: 'rejected' },
    { label: 'Converted', value: estimates.filter((e) => e.status === 'converted').length, status: 'converted' },
  ]

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Estimates</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
              Create and manage customer estimates and quotes
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className={primaryBtnClass} style={primaryBtnStyle} onClick={handleAddNew}>
              <Plus className="h-4 w-4" />
              New Estimate
            </button>
          </div>
        </div>

        {/* KPI Summary */}
        <div className="rounded-[14px] border mb-6 animate-in delay-1"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="grid grid-cols-5 divide-x" style={{ borderColor: 'var(--so-border)' }}>
            {kpiStats.map((stat) => (
              <div key={stat.label} className="px-6 py-5">
                <div className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>{stat.value}</div>
                <div className="mt-1">{getStatusBadge(stat.status)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Estimates Table */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-2"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
              Estimates
              <button
                onClick={() => setPrintFilterOpen(true)}
                title="Print estimates list"
                className="inline-flex items-center opacity-40 hover:opacity-100 transition-opacity cursor-pointer"
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--so-text-tertiary)' }}
              >
                <Printer className="h-3.5 w-3.5" />
              </button>
            </span>
            <span className="text-[12px]" style={{ color: 'var(--so-text-tertiary)' }}>
              {estimates.length} total
            </span>
          </div>
          <DataTable
            storageKey="estimates"
            columns={columns}
            data={estimates}
            searchColumn="estimate_number"
            searchPlaceholder="Search estimates..."
            onRowClick={(estimate) => navigate(`/estimates/${estimate.id}`)}
          />
        </div>

      </div>

      {/* Print-only estimates list */}
      <div className="print-only" style={{ color: 'black' }}>
        {/* Letterhead */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', paddingBottom: '16px', borderBottom: '3px solid #333' }}>
          <div>
            <div style={{ fontSize: '22pt', fontWeight: 700, letterSpacing: '-0.5px' }}>
              {settings?.company_name || 'Company'}
            </div>
            {settings?.company_address && (
              <div style={{ fontSize: '9pt', color: '#555', whiteSpace: 'pre-line', marginTop: '4px' }}>
                {settings.company_address}
              </div>
            )}
            {(settings?.company_phone || settings?.company_email) && (
              <div style={{ fontSize: '9pt', color: '#555', marginTop: '2px' }}>
                {[settings?.company_phone, settings?.company_email].filter(Boolean).join(' | ')}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px' }}>
              Estimates List
            </div>
            <div style={{ fontSize: '10pt', color: '#555', marginTop: '4px' }}>
              {printFilters?.dateRangeLabel || `January 1, ${new Date().getFullYear()} \u2013 ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
            </div>
            <div style={{ fontSize: '9pt', color: '#555', marginTop: '4px', padding: '2px 10px', border: '1px solid #999', display: 'inline-block' }}>
              {printFilteredEstimates.length} estimates
            </div>
          </div>
        </div>

        {/* Estimates Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
          <thead>
            <tr>
              {[
                { key: 'estimate_number', label: 'Estimate #' },
                { key: 'customer_name', label: 'Customer' },
                { key: 'date', label: 'Date' },
                { key: 'expiration_date', label: 'Expires' },
                { key: 'status', label: 'Status' },
                { key: 'num_lines', label: 'Lines' },
                { key: 'total_amount', label: 'Total' },
              ].filter(h => !printFilters || printFilters.visibleColumns.includes(h.key)).map((h) => (
                <th key={h.label} style={{ padding: '5px 6px', border: '1px solid #ccc', background: '#f5f5f5', fontWeight: 600, textAlign: h.label === 'Total' ? 'right' : 'left' }}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {printFilteredEstimates.map((e) => {
              const showCol = (key: string) => !printFilters || printFilters.visibleColumns.includes(key)
              return (
                <tr key={e.id}>
                  {showCol('estimate_number') && <td style={{ padding: '4px 6px', border: '1px solid #ccc', fontFamily: 'monospace', fontSize: '8pt' }}>{e.estimate_number}</td>}
                  {showCol('customer_name') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{e.customer_name}</td>}
                  {showCol('date') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>}
                  {showCol('expiration_date') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{e.expiration_date ? new Date(e.expiration_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014'}</td>}
                  {showCol('status') && <td style={{ padding: '4px 6px', border: '1px solid #ccc', textTransform: 'capitalize' }}>{e.status}</td>}
                  {showCol('num_lines') && <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{e.num_lines}</td>}
                  {showCol('total_amount') && <td style={{ padding: '4px 6px', border: '1px solid #ccc', textAlign: 'right', fontFamily: 'monospace' }}>
                    ${parseFloat(e.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>}
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Footer */}
        <div style={{ marginTop: '40px', paddingTop: '12px', borderTop: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', fontSize: '8pt', color: '#999' }}>
          <span>Printed {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</span>
          <span>{settings?.company_name || ''}</span>
        </div>
      </div>

      <ReportFilterModal
        open={printFilterOpen}
        onOpenChange={setPrintFilterOpen}
        config={reportFilterConfig}
        mode="print"
        onConfirm={handleFilteredPrint}
      />

      {/* Dialogs */}
      <EstimateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        estimate={editingEstimate}
      />
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Estimate"
        description="Are you sure you want to delete this estimate? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        loading={deleteEstimate.isPending}
      />
      <ConfirmDialog
        open={convertDialogOpen}
        onOpenChange={setConvertDialogOpen}
        title="Convert to Sales Order"
        description="Convert this estimate to a Sales Order? This action cannot be undone."
        confirmLabel="Convert"
        variant="default"
        onConfirm={handleConfirmConvert}
        loading={convertEstimate.isPending}
      />
    </div>
  )
}
