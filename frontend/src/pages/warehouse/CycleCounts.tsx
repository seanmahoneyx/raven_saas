import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  ClipboardCheck, Plus, Play, CheckCircle, Eye,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import api from '@/api/client'

interface CycleCountLine {
  id: number
  item_sku: string
  item_name: string
  location_name: string
  lot_number: string | null
  expected_quantity: string
  counted_quantity: string | null
  variance: string
  is_counted: boolean
}

interface CycleCount {
  id: number
  count_number: string
  warehouse: number
  warehouse_code: string
  warehouse_name: string
  zone: number | null
  zone_name: string | null
  status: string
  counted_by_name: string | null
  total_lines: number
  counted_lines: number
  started_at: string | null
  completed_at: string | null
  notes: string
  lines?: CycleCountLine[]
  created_at: string
}

interface Warehouse {
  id: number
  code: string
  name: string
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  draft: 'secondary',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'destructive',
}

function useCycleCounts() {
  return useQuery({
    queryKey: ['cycle-counts'],
    queryFn: async () => {
      const { data } = await api.get('/warehouse/cycle-counts/')
      return (data.results ?? data) as CycleCount[]
    },
  })
}

function useCycleCount(id: number | null) {
  return useQuery({
    queryKey: ['cycle-counts', id],
    queryFn: async () => {
      const { data } = await api.get<CycleCount>(`/warehouse/cycle-counts/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

function useWarehouses() {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data } = await api.get('/warehouses/')
      return (data.results ?? data) as Warehouse[]
    },
  })
}

export default function CycleCounts() {
  usePageTitle('Cycle Counts')
  const queryClient = useQueryClient()

  const { data: counts, isLoading } = useCycleCounts()
  const { data: warehouses } = useWarehouses()

  const [createOpen, setCreateOpen] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [selectedWarehouse, setSelectedWarehouse] = useState('')
  const [notes, setNotes] = useState('')

  const { data: detail, refetch: refetchDetail } = useCycleCount(detailId)

  // Count line editing
  const [countInputs, setCountInputs] = useState<Record<number, string>>({})

  const createCount = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/warehouse/cycle-counts/', {
        warehouse: parseInt(selectedWarehouse),
        notes,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cycle-counts'] })
      setCreateOpen(false)
      setSelectedWarehouse('')
      setNotes('')
      toast.success('Cycle count created')
    },
    onError: () => toast.error('Failed to create cycle count'),
  })

  const startCount = useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post(`/warehouse/cycle-counts/${id}/start/`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cycle-counts'] })
      refetchDetail()
      toast.success('Count started - quantities snapshotted')
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Failed to start'),
  })

  const recordLine = useMutation({
    mutationFn: async ({ countId, lineId, qty }: { countId: number; lineId: number; qty: string }) => {
      const { data } = await api.post(`/warehouse/cycle-counts/${countId}/record/`, {
        line_id: lineId,
        counted_quantity: parseFloat(qty),
      })
      return data
    },
    onSuccess: () => {
      refetchDetail()
      queryClient.invalidateQueries({ queryKey: ['cycle-counts'] })
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Failed to record'),
  })

  const finalizeCount = useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post(`/warehouse/cycle-counts/${id}/finalize/`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cycle-counts'] })
      refetchDetail()
      toast.success('Count finalized - adjustments applied')
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Failed to finalize'),
  })

  const columns: ColumnDef<CycleCount>[] = useMemo(() => [
    {
      accessorKey: 'count_number',
      header: 'Count #',
      cell: ({ row }) => (
        <button
          className="font-mono font-medium text-primary hover:underline"
          onClick={() => {
            setDetailId(row.original.id)
            setCountInputs({})
          }}
        >
          {row.getValue('count_number')}
        </button>
      ),
    },
    {
      accessorKey: 'warehouse_code',
      header: 'Warehouse',
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.getValue('status') as string
        return <Badge variant={statusVariant[s] || 'outline'}>{s.replace('_', ' ').toUpperCase()}</Badge>
      },
    },
    {
      id: 'progress',
      header: 'Progress',
      cell: ({ row }) => {
        const c = row.original
        if (c.total_lines === 0) return '-'
        return `${c.counted_lines}/${c.total_lines}`
      },
    },
    {
      accessorKey: 'counted_by_name',
      header: 'Counted By',
      cell: ({ row }) => row.getValue('counted_by_name') || '-',
    },
    {
      accessorKey: 'created_at',
      header: 'Created',
      cell: ({ row }) => format(new Date(row.getValue('created_at')), 'MMM d, yyyy'),
    },
  ], [])

  if (isLoading) {
    return <div className="p-8 text-muted-foreground">Loading cycle counts...</div>
  }

  // Detail view
  if (detailId && detail) {
    const allCounted = detail.lines?.every((l) => l.is_counted) ?? false
    const hasVariance = detail.lines?.some((l) => parseFloat(l.variance) !== 0) ?? false

    return (
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" className="mb-2" onClick={() => setDetailId(null)}>
              Back to List
            </Button>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold font-mono">{detail.count_number}</h1>
              <Badge variant={statusVariant[detail.status] || 'outline'}>
                {detail.status.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              {detail.warehouse_name} {detail.zone_name && `/ ${detail.zone_name}`}
            </p>
          </div>
          <div className="flex gap-2">
            {detail.status === 'draft' && (
              <Button onClick={() => startCount.mutate(detail.id)} disabled={startCount.isPending}>
                <Play className="h-4 w-4 mr-2" />
                {startCount.isPending ? 'Starting...' : 'Start Count'}
              </Button>
            )}
            {detail.status === 'in_progress' && allCounted && (
              <Button
                variant={hasVariance ? 'destructive' : 'default'}
                onClick={() => {
                  if (hasVariance && !confirm('There are variances. Finalize and apply adjustments?')) return
                  finalizeCount.mutate(detail.id)
                }}
                disabled={finalizeCount.isPending}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {finalizeCount.isPending ? 'Finalizing...' : 'Finalize'}
              </Button>
            )}
          </div>
        </div>

        {/* Count Lines */}
        {detail.lines && detail.lines.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Count Lines ({detail.lines.filter((l) => l.is_counted).length}/{detail.lines.length} counted)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 pr-4">SKU</th>
                      <th className="pb-2 pr-4">Item</th>
                      <th className="pb-2 pr-4">Location</th>
                      <th className="pb-2 pr-4">Lot</th>
                      <th className="pb-2 pr-4 text-right">Expected</th>
                      <th className="pb-2 pr-4 text-right">Counted</th>
                      <th className="pb-2 text-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((line) => {
                      const variance = parseFloat(line.variance)
                      return (
                        <tr key={line.id} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-mono">{line.item_sku}</td>
                          <td className="py-2 pr-4 text-muted-foreground truncate max-w-[150px]">{line.item_name}</td>
                          <td className="py-2 pr-4 font-mono">{line.location_name}</td>
                          <td className="py-2 pr-4">{line.lot_number || '-'}</td>
                          <td className="py-2 pr-4 text-right">{parseFloat(line.expected_quantity).toLocaleString()}</td>
                          <td className="py-2 pr-4 text-right">
                            {detail.status === 'in_progress' && !line.is_counted ? (
                              <div className="flex items-center gap-1 justify-end">
                                <Input
                                  type="number"
                                  className="w-24 h-8 text-right"
                                  value={countInputs[line.id] ?? ''}
                                  onChange={(e) => setCountInputs({ ...countInputs, [line.id]: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && countInputs[line.id]) {
                                      recordLine.mutate({
                                        countId: detail.id,
                                        lineId: line.id,
                                        qty: countInputs[line.id],
                                      })
                                    }
                                  }}
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2"
                                  onClick={() => {
                                    if (countInputs[line.id]) {
                                      recordLine.mutate({
                                        countId: detail.id,
                                        lineId: line.id,
                                        qty: countInputs[line.id],
                                      })
                                    }
                                  }}
                                  disabled={!countInputs[line.id] || recordLine.isPending}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : line.is_counted ? (
                              parseFloat(line.counted_quantity!).toLocaleString()
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className={`py-2 text-right font-medium ${
                            !line.is_counted ? 'text-muted-foreground'
                            : variance > 0 ? 'text-blue-600'
                            : variance < 0 ? 'text-red-600'
                            : 'text-green-600'
                          }`}>
                            {line.is_counted ? (
                              variance > 0 ? `+${variance.toLocaleString()}` : variance.toLocaleString()
                            ) : '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : detail.status === 'draft' ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Click "Start Count" to snapshot current quantities and begin counting.
            </CardContent>
          </Card>
        ) : null}
      </div>
    )
  }

  // List view
  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cycle Counts</h1>
          <p className="text-muted-foreground mt-1">Inventory audit sessions</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Count
        </Button>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {counts?.filter((c) => c.status === 'in_progress').length ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">In Progress</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">
              {counts?.filter((c) => c.status === 'completed').length ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">Completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {counts?.filter((c) => c.status === 'draft').length ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">Draft</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            All Counts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={counts ?? []}
            searchColumn="count_number"
            searchPlaceholder="Search counts..."
          />
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Cycle Count</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Warehouse</Label>
              <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse..." />
                </SelectTrigger>
                <SelectContent>
                  {warehouses?.map((wh) => (
                    <SelectItem key={wh.id} value={wh.id.toString()}>
                      {wh.code} - {wh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createCount.mutate()}
              disabled={createCount.isPending || !selectedWarehouse}
            >
              {createCount.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
