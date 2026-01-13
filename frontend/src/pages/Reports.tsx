import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Play, FileText, Clock, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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

export default function Reports() {
  const [activeTab, setActiveTab] = useState<Tab>('reports')

  const { data: definitionsData } = useReportDefinitions()
  const { data: savedData } = useSavedReports()
  const { data: schedulesData } = useReportSchedules()
  const executeReport = useExecuteReport()

  const savedColumns: ColumnDef<SavedReport>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue('name')}</span>
        ),
      },
      {
        accessorKey: 'report_name',
        header: 'Report',
      },
      {
        accessorKey: 'executed_at',
        header: 'Executed',
        cell: ({ row }) => format(new Date(row.getValue('executed_at')), 'MMM d, yyyy HH:mm'),
      },
      {
        accessorKey: 'executed_by_name',
        header: 'By',
      },
      {
        accessorKey: 'row_count',
        header: 'Rows',
        cell: ({ row }) => (
          <span className="text-gray-600">{row.getValue('row_count')}</span>
        ),
      },
      {
        accessorKey: 'file_format',
        header: 'Format',
        cell: ({ row }) => (
          <Badge variant="outline">{(row.getValue('file_format') as string).toUpperCase()}</Badge>
        ),
      },
      {
        id: 'download',
        header: '',
        cell: () => (
          <Button size="sm" variant="ghost">
            Download
          </Button>
        ),
      },
    ],
    []
  )

  const scheduleColumns: ColumnDef<ReportSchedule>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Schedule',
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue('name')}</span>
        ),
      },
      {
        accessorKey: 'report_name',
        header: 'Report',
      },
      {
        accessorKey: 'frequency',
        header: 'Frequency',
        cell: ({ row }) => (
          <Badge variant="outline">
            {(row.getValue('frequency') as string).charAt(0).toUpperCase() + (row.getValue('frequency') as string).slice(1)}
          </Badge>
        ),
      },
      {
        accessorKey: 'time_of_day',
        header: 'Time',
      },
      {
        accessorKey: 'last_run',
        header: 'Last Run',
        cell: ({ row }) => {
          const date = row.getValue('last_run') as string | null
          return date ? format(new Date(date), 'MMM d, HH:mm') : 'Never'
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
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={row.getValue('is_active') ? 'success' : 'secondary'}>
            {row.getValue('is_active') ? 'Active' : 'Paused'}
          </Badge>
        ),
      },
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
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-muted-foreground">
          Run and schedule business reports
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {Object.entries(reportsByCategory).map(([category, reports]) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle>{category}</CardTitle>
                <CardDescription>{reports.length} report(s)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {reports.map((report) => (
                    <div
                      key={report.id}
                      className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-medium">{report.name}</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            {report.description || 'No description'}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => executeReport.mutate({ reportId: report.id })}
                          disabled={!report.is_active || executeReport.isPending}
                        >
                          <Play className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {Object.keys(reportsByCategory).length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                No reports available. Connect to the API to see available reports.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <Card>
          <CardHeader>
            <CardTitle>Report History</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={savedColumns}
              data={savedData?.results ?? []}
              searchColumn="name"
              searchPlaceholder="Search reports..."
            />
          </CardContent>
        </Card>
      )}

      {activeTab === 'schedules' && (
        <Card>
          <CardHeader>
            <CardTitle>Scheduled Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={scheduleColumns}
              data={schedulesData?.results ?? []}
              searchColumn="name"
              searchPlaceholder="Search schedules..."
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
