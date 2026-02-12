import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAccounts } from '@/api/accounting'
import { useCreateJournalEntry } from '@/api/accounting'
import { toast } from 'sonner'

interface LineForm {
  account: string
  description: string
  debit: string
  credit: string
}

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
}

export default function CreateJournalEntry() {
  usePageTitle('New Journal Entry')
  const navigate = useNavigate()

  const { data: accountsData } = useAccounts({ is_active: true })
  const createMutation = useCreateJournalEntry()

  const [date, setDate] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [memo, setMemo] = useState('')
  const [entryType, setEntryType] = useState('standard')
  const [lines, setLines] = useState<LineForm[]>([
    { account: '', description: '', debit: '', credit: '' },
    { account: '', description: '', debit: '', credit: '' },
  ])

  const handleLineChange = (index: number, field: keyof LineForm, value: string) => {
    const newLines = [...lines]
    newLines[index][field] = value

    // Mutually exclusive debit/credit
    if (field === 'debit' && value !== '') {
      newLines[index].credit = ''
    } else if (field === 'credit' && value !== '') {
      newLines[index].debit = ''
    }

    setLines(newLines)
  }

  const handleAddLine = () => {
    setLines([...lines, { account: '', description: '', debit: '', credit: '' }])
  }

  const handleDeleteLine = (index: number) => {
    if (lines.length > 1) {
      setLines(lines.filter((_, i) => i !== index))
    }
  }

  const calculateTotals = () => {
    let totalDebit = 0
    let totalCredit = 0
    lines.forEach((line) => {
      if (line.debit) totalDebit += parseFloat(line.debit) || 0
      if (line.credit) totalCredit += parseFloat(line.credit) || 0
    })
    return { totalDebit, totalCredit, isBalanced: totalDebit === totalCredit && totalDebit > 0 }
  }

  const { totalDebit, totalCredit, isBalanced } = calculateTotals()

  const handleSave = async () => {
    if (!date || !memo) {
      toast.error('Date and memo are required')
      return
    }

    if (!isBalanced) {
      toast.error('Entry must be balanced (total debits must equal total credits)')
      return
    }

    const payload = {
      date,
      memo,
      reference_number: referenceNumber,
      entry_type: entryType as 'standard' | 'adjusting',
      lines: lines
        .filter((line) => line.account && (line.debit || line.credit))
        .map((line) => ({
          account: parseInt(line.account),
          description: line.description,
          debit: line.debit || '0.00',
          credit: line.credit || '0.00',
        })),
    }

    try {
      await createMutation.mutateAsync(payload)
      toast.success('Journal entry created successfully')
      navigate('/journal-entries')
    } catch (error) {
      console.error('Failed to create journal entry:', error)
      toast.error('Failed to create journal entry')
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => navigate('/journal-entries')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Journal Entries
        </Button>
      </div>

      <h1 className="text-3xl font-bold mb-6">New Journal Entry</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Entry Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="reference">Reference #</Label>
                <Input
                  id="reference"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="memo">Memo *</Label>
              <Textarea
                id="memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Enter memo..."
                required
              />
            </div>

            <div>
              <Label htmlFor="entry-type">Entry Type</Label>
              <Select value={entryType} onValueChange={setEntryType}>
                <SelectTrigger id="entry-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="adjusting">Adjusting</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Entry Lines</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Account</th>
                    <th className="text-left p-2">Description</th>
                    <th className="text-right p-2">Debit</th>
                    <th className="text-right p-2">Credit</th>
                    <th className="text-center p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-2">
                        <Select
                          value={line.account}
                          onValueChange={(value) => handleLineChange(index, 'account', value)}
                        >
                          <SelectTrigger className="w-[250px]">
                            <SelectValue placeholder="Select account..." />
                          </SelectTrigger>
                          <SelectContent>
                            {accountsData?.results.map((account) => (
                              <SelectItem key={account.id} value={account.id.toString()}>
                                {account.code} - {account.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Input
                          value={line.description}
                          onChange={(e) => handleLineChange(index, 'description', e.target.value)}
                          placeholder="Description..."
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={line.debit}
                          onChange={(e) => handleLineChange(index, 'debit', e.target.value)}
                          className="text-right"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={line.credit}
                          onChange={(e) => handleLineChange(index, 'credit', e.target.value)}
                          className="text-right"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteLine(index)}
                          disabled={lines.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-bold">
                    <td colSpan={2} className="p-2 text-right">
                      Totals:
                    </td>
                    <td className="p-2 text-right">{formatCurrency(totalDebit)}</td>
                    <td className="p-2 text-right">{formatCurrency(totalCredit)}</td>
                    <td className="p-2 text-center">
                      {isBalanced ? (
                        <span className="text-green-600 font-bold">✓</span>
                      ) : (
                        <span className="text-red-600 font-bold">✗</span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-4">
              <Button variant="outline" onClick={handleAddLine}>
                <Plus className="h-4 w-4 mr-2" />
                Add Line
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!isBalanced || createMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Save as Draft
          </Button>
        </div>
      </div>
    </div>
  )
}
