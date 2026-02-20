import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react'
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

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }

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
      date, memo, reference_number: referenceNumber,
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

  const inputStyle: React.CSSProperties = { borderColor: 'var(--so-border)', background: 'var(--so-surface)' }
  const labelStyle: React.CSSProperties = { color: 'var(--so-text-secondary)' }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">
        {/* Header */}
        <div className="flex items-center gap-4 mb-7 animate-in">
          <button className={outlineBtnClass + ' !px-2'} style={outlineBtnStyle} onClick={() => navigate('/journal-entries')}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>New Journal Entry</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Create a manual journal entry</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Entry Details */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Entry Details</span>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>Date *</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={inputStyle} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={labelStyle}>Reference #</Label>
                  <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Optional" style={inputStyle} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium" style={labelStyle}>Memo *</Label>
                <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Enter memo..." required style={inputStyle} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium" style={labelStyle}>Entry Type</Label>
                <Select value={entryType} onValueChange={setEntryType}>
                  <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="adjusting">Adjusting</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Entry Lines */}
          <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
              <span className="text-sm font-semibold">Entry Lines</span>
            </div>
            <div className="px-6 py-5">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                      <th className="text-left p-2 text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)', background: 'var(--so-bg)' }}>Account</th>
                      <th className="text-left p-2 text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)', background: 'var(--so-bg)' }}>Description</th>
                      <th className="text-right p-2 text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)', background: 'var(--so-bg)' }}>Debit</th>
                      <th className="text-right p-2 text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-tertiary)', background: 'var(--so-bg)' }}>Credit</th>
                      <th className="text-center p-2" style={{ background: 'var(--so-bg)' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid var(--so-border-light)' }}>
                        <td className="p-2">
                          <Select value={line.account} onValueChange={(value) => handleLineChange(index, 'account', value)}>
                            <SelectTrigger className="w-[250px]" style={inputStyle}><SelectValue placeholder="Select account..." /></SelectTrigger>
                            <SelectContent>
                              {accountsData?.results.map((account) => (
                                <SelectItem key={account.id} value={account.id.toString()}>{account.code} - {account.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          <Input value={line.description} onChange={(e) => handleLineChange(index, 'description', e.target.value)} placeholder="Description..." style={inputStyle} />
                        </td>
                        <td className="p-2">
                          <Input type="number" step="0.01" value={line.debit} onChange={(e) => handleLineChange(index, 'debit', e.target.value)} className="text-right font-mono" placeholder="0.00" style={inputStyle} />
                        </td>
                        <td className="p-2">
                          <Input type="number" step="0.01" value={line.credit} onChange={(e) => handleLineChange(index, 'credit', e.target.value)} className="text-right font-mono" placeholder="0.00" style={inputStyle} />
                        </td>
                        <td className="p-2 text-center">
                          <button onClick={() => handleDeleteLine(index)} disabled={lines.length === 1}
                            className={`inline-flex items-center justify-center h-7 w-7 rounded-md cursor-pointer ${lines.length === 1 ? 'opacity-30 pointer-events-none' : ''}`}
                            style={{ color: 'var(--so-danger-text)' }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--so-border)' }}>
                      <td colSpan={2} className="p-2 text-right text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>Totals:</td>
                      <td className="p-2 text-right font-mono text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>{formatCurrency(totalDebit)}</td>
                      <td className="p-2 text-right font-mono text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>{formatCurrency(totalCredit)}</td>
                      <td className="p-2 text-center">
                        {isBalanced
                          ? <span className="font-bold" style={{ color: 'var(--so-success-text)' }}>&#10003;</span>
                          : <span className="font-bold" style={{ color: 'var(--so-danger-text)' }}>&#10007;</span>
                        }
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-4">
                <button className={outlineBtnClass} style={outlineBtnStyle} onClick={handleAddLine}>
                  <Plus className="h-3.5 w-3.5" /> Add Line
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              className={`${primaryBtnClass} ${!isBalanced || createMutation.isPending ? 'opacity-50 pointer-events-none' : ''}`}
              style={primaryBtnStyle}
              onClick={handleSave}
              disabled={!isBalanced || createMutation.isPending}
            >
              <Save className="h-3.5 w-3.5" /> Save as Draft
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
