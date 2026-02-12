import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ArrowLeft, Check, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useJournalEntry, usePostJournalEntry, useReverseJournalEntry } from '@/api/accounting'
import type { JournalEntryStatus } from '@/types/api'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
}

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

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!entry) {
    return (
      <div className="p-8">
        <div className="text-center py-8 text-muted-foreground">Entry not found</div>
      </div>
    )
  }

  const statusVariants: Record<JournalEntryStatus, string> = {
    draft: 'secondary',
    posted: 'success',
    reversed: 'destructive',
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => navigate('/journal-entries')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Journal Entries
        </Button>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold">{entry.entry_number}</h1>
          <Badge variant={statusVariants[entry.status] as any}>
            {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
          </Badge>
          <span className="text-muted-foreground">
            {new Date(entry.date + 'T00:00:00').toLocaleDateString()}
          </span>
        </div>
        <div className="flex gap-2">
          {entry.status === 'draft' && (
            <Button onClick={() => setPostDialogOpen(true)} disabled={postMutation.isPending}>
              <Check className="h-4 w-4 mr-2" />
              Post Entry
            </Button>
          )}
          {entry.status === 'posted' && (
            <Button variant="outline" onClick={() => setReverseDialogOpen(true)} disabled={reverseMutation.isPending}>
              <Undo2 className="h-4 w-4 mr-2" />
              Reverse Entry
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Entry Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-muted-foreground">Date:</span>
                <p className="font-medium">{new Date(entry.date + 'T00:00:00').toLocaleDateString()}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Entry Type:</span>
                <p className="font-medium">{entry.entry_type.charAt(0).toUpperCase() + entry.entry_type.slice(1)}</p>
              </div>
              {entry.reference_number && (
                <div>
                  <span className="text-sm text-muted-foreground">Reference #:</span>
                  <p className="font-medium">{entry.reference_number}</p>
                </div>
              )}
              <div>
                <span className="text-sm text-muted-foreground">Balanced:</span>
                <p className={entry.is_balanced ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                  {entry.is_balanced ? 'Yes' : 'No'}
                </p>
              </div>
              {entry.posted_at && (
                <div>
                  <span className="text-sm text-muted-foreground">Posted At:</span>
                  <p className="font-medium">{new Date(entry.posted_at).toLocaleString()}</p>
                </div>
              )}
              <div>
                <span className="text-sm text-muted-foreground">Created At:</span>
                <p className="font-medium">{new Date(entry.created_at).toLocaleString()}</p>
              </div>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Memo:</span>
              <p className="font-medium">{entry.memo}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lines</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Account Code</th>
                    <th className="text-left p-2">Account Name</th>
                    <th className="text-left p-2">Description</th>
                    <th className="text-right p-2">Debit</th>
                    <th className="text-right p-2">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.lines?.map((line) => (
                    <tr key={line.id} className="border-b">
                      <td className="p-2 font-mono">{line.account_code}</td>
                      <td className="p-2">{line.account_name}</td>
                      <td className="p-2">{line.description}</td>
                      <td className="p-2 text-right">
                        {line.debit !== '0.00' ? formatCurrency(line.debit) : '-'}
                      </td>
                      <td className="p-2 text-right">
                        {line.credit !== '0.00' ? formatCurrency(line.credit) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-bold">
                    <td colSpan={3} className="p-2 text-right">
                      Totals:
                    </td>
                    <td className="p-2 text-right">{formatCurrency(entry.total_debit)}</td>
                    <td className="p-2 text-right">{formatCurrency(entry.total_credit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

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
