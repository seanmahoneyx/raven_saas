import { useState, useMemo } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Play, FileText, Clock, Calendar } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import {
  useReportDefinitions,
  useSavedReports,
  useReportSchedules,
  useExecuteReport,
  type ReportDefinition,
  type SavedReport,
  type ReportSchedule,
} from '@/api/reports'
import { format } from 'date-fns'

type Tab = 'reports' | 'history' | 'schedules'

const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

const getStatusBadge = (active: boolean) => {
  const c = active
    ? { bg: 'var(--so-success-bg)', border: 'transparent', text: 'var(--so-success-text)' }
    : { bg: 'var(--so-border-light)', border: 'transparent', text: 'var(--so-text-tertiary)' }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ background: c.text }} />
      {active ? 'Active' : 'Paused'}
    </span>
  )
}

const getFormatBadge = (fmt: string) => (
  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
    style={{ background: 'var(--so-border-light)', color: 'var(--so-text-secondary)' }}>
    {fmt.toUpperCase()}
  </span>
)

const getFrequencyBadge = (freq: string) => (
  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
    style={{ background: 'var(--so-accent-light)', color: 'var(--so-accent)' }}>
    {freq.charAt(0).toUpperCase() + freq.slice(1)}
  </span>
)

export default function Reports() {
  usePageTitle('Reports')

  const [activeTab, setActiveTab] = useState<Tab>('reports')

  const { data: definitionsData } = useReportDefinitions()
  const { data: savedData } = useSavedReports()
  const { data: schedulesData } = useReportSchedules()
  const executeReport = useExecuteReport()

  const savedColumns: ColumnDef<SavedReport>[] = useMemo(
    () => [
      { accessorKey: 'name', header: 'Name', cell: ({ row }) => <span className="font-medium">{row.getValue('name')}</span> },
      { accessorKey: 'report_name', header: 'Report' },
      { accessorKey: 'executed_at', header: 'Executed', cell: ({ row }) => format(new Date(row.getValue('executed_at')), 'MMM d, yyyy HH:mm') },
      { accessorKey: 'executed_by_name', header: 'By' },
      { accessorKey: 'row_count', header: 'Rows', cell: ({ row }) => <span style={{ color: 'var(--so-text-secondary)' }}>{row.getValue('row_count')}</span> },
      { accessorKey: 'file_format', header: 'Format', cell: ({ row }) => getFormatBadge(row.getValue('file_format') as string) },
      {
        id: 'download',
        header: '',
        cell: () => (
          <button className="text-[13px] font-medium cursor-pointer" style={{ color: 'var(--so-accent)' }}>
            Download
          </button>
        ),
      },
    ],
    []
  )

  const scheduleColumns: ColumnDef<ReportSchedule>[] = useMemo(
    () => [
      { accessorKey: 'name', header: 'Schedule', cell: ({ row }) => <span className="font-medium">{row.getValue('name')}</span> },
      { accessorKey: 'report_name', header: 'Report' },
      { accessorKey: 'frequency', header: 'Frequency', cell: ({ row }) => getFrequencyBadge(row.getValue('frequency') as string) },
      { accessorKey: 'time_of_day', header: 'Time' },
      {
        accessorKey: 'last_run',
        header: 'Last Run',
        cell: ({ row }) => {
          const date = row.getValue('last_run') as string | null
          return date ? format(new Date(date), 'MMM d, HH:mm') : <span style={{ color: 'var(--so-text-tertiary)' }}>Never</span>
        },
      },
      {
        accessorKey: 'next_run',
        header: 'Next Run',
        cell: ({ row }) => {
          const date = row.getValue('next_run') as string | null
          return date ? format(new Date(date), 'MMM d, HH:mm') : '-'
        },
      },
      { accessorKey: 'is_active', header: 'Status', cell: ({ row }) => getStatusBadge(row.getValue('is_active') as boolean) },
    ],
    []
  )

  const tabs = [
    { id: 'reports' as Tab, label: 'Available Reports', icon: FileText },
    { id: 'history' as Tab, label: 'Report History', icon: Clock },
    { id: 'schedules' as Tab, label: 'Schedules', icon: Calendar },
  ]

  // Group reports by category
  const reportsByCategory = useMemo(() => {
    const categories: Record<string, ReportDefinition[]> = {}
    definitionsData?.results.forEach((report) => {
      const cat = report.category || 'General'
      if (!categories[cat]) categories[cat] = []
      categories[cat].push(report)
    })
    return categories
  }, [definitionsData])

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-8 py-7 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Reports</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Run and schedule business reports</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mb-5 animate-in delay-1" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors relative -mb-px"
              style={{
                color: activeTab === tab.id ? 'var(--so-accent)' : 'var(--so-text-tertiary)',
                borderBottom: activeTab === tab.id ? '2px solid var(--so-accent)' : '2px solid transparent',
              }}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'reports' && (
          <div className="space-y-5 animate-in delay-2">
            {Object.entries(reportsByCategory).map(([category, reports]) => (
              <div key={category} className="rounded-[14px] border overflow-hidden" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
                <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                  <span className="text-sm font-semibold">{category}</span>
                  <span className="text-[11.5px] ml-2" style={{ color: 'var(--so-text-tertiary)' }}>{reports.length} report(s)</span>
                </div>
                <div className="px-6 py-5">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {reports.map((report) => (
                      <div key={report.id}
                        className="rounded-lg p-4 cursor-pointer transition-colors"
                        style={{ border: '1px solid var(--so-border-light)', background: 'var(--so-bg)' }}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-medium text-sm" style={{ color: 'var(--so-text-primary)' }}>{report.name}</h3>
                            <p className="text-[12px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>
                              {report.description || 'No description'}
                            </p>
                          </div>
                          <button
                            className={`${primaryBtnClass} !px-2 !py-1.5`}
                            style={primaryBtnStyle}
                            onClick={() => executeReport.mutate({ reportId: report.id })}
                            disabled={!report.is_active || executeReport.isPending}
                          >
                            <Play className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {Object.keys(reportsByCategory).length === 0 && (
              <div className="rounded-[14px] border overflow-hidden" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
                <div className="py-8 text-center text-[13px]" style={{ color: 'var(--so-text-tertiary)' }}>
                  No reports available. Connect to the API to see available reports.
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Report History</span>
            </div>
            <div className="px-6 py-5">
              <DataTable
                columns={savedColumns}
                data={savedData?.results ?? []}
                searchColumn="name"
                searchPlaceholder="Search reports..."
              />
            </div>
          </div>
        )}

        {activeTab === 'schedules' && (
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Scheduled Reports</span>
            </div>
            <div className="px-6 py-5">
              <DataTable
                columns={scheduleColumns}
                data={schedulesData?.results ?? []}
                searchColumn="name"
                searchPlaceholder="Search schedules..."
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
