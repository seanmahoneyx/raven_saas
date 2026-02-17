import { useState, useRef, useCallback } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { apiClient } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Upload, FileCheck, AlertTriangle, CheckCircle2, ArrowLeft, Loader2, FileSpreadsheet } from 'lucide-react'

interface ImportError {
  row: number
  message: string
}

interface ImportReport {
  import_type: string
  mode: string
  total: number
  valid: number
  created: number
  updated: number
  error_count: number
  errors: ImportError[]
  message?: string
}

const IMPORT_TYPES = [
  { value: 'locations', label: 'Warehouse Locations', columns: 'Name, Barcode, Warehouse, Type (optional), Zone (optional)' },
  { value: 'parties', label: 'Customers & Vendors', columns: 'Code, Name, Type, LegalName (opt), Email (opt), Phone (opt), Notes (opt)' },
  { value: 'items', label: 'Items / Products', columns: 'MSPN, Name, UOM, Description (opt), Division (opt), PurchDesc (opt), SellDesc (opt)' },
  { value: 'gl-opening-balances', label: 'GL Opening Balances', columns: 'AccountCode, Debit, Credit, Description (optional)' },
]

export default function DataImport() {
  usePageTitle('Data Import')

  const [importType, setImportType] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [step, setStep] = useState<'select' | 'upload' | 'review' | 'done'>('select')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedType = IMPORT_TYPES.find(t => t.value === importType)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped && dropped.name.endsWith('.csv')) {
      setFile(dropped)
      setStep('upload')
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setStep('upload')
    }
  }

  const runImport = async (commit: boolean) => {
    if (!file || !importType) return
    setIsLoading(true)
    setReport(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('commit', commit ? 'true' : 'false')

      const { data } = await apiClient.post<ImportReport>(
        `/admin/import/${importType}/`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      setReport(data)
      setStep(commit && data.error_count === 0 ? 'done' : 'review')
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Import failed. Check your file format.'
      setReport({
        import_type: importType,
        mode: commit ? 'commit' : 'dry_run',
        total: 0,
        valid: 0,
        created: 0,
        updated: 0,
        error_count: 1,
        errors: [{ row: 0, message }],
      })
      setStep('review')
    } finally {
      setIsLoading(false)
    }
  }

  const reset = () => {
    setFile(null)
    setReport(null)
    setStep('select')
    setImportType('')
  }

  const canCommit = report && report.error_count === 0 && report.valid > 0 && report.mode === 'dry_run'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Data Import</h1>
          <p className="text-sm text-slate-400 mt-1">Upload CSV files to bulk-import records into the system.</p>
        </div>
        {step !== 'select' && (
          <Button variant="ghost" onClick={reset} className="text-slate-400 hover:text-white">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Start Over
          </Button>
        )}
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-3">
        {['Select Type', 'Upload File', 'Review', 'Complete'].map((label, i) => {
          const stepIndex = ['select', 'upload', 'review', 'done'].indexOf(step)
          const isActive = i === stepIndex
          const isDone = i < stepIndex
          return (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                isActive ? 'bg-blue-600 text-white' : isDone ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-500'
              }`}>
                {isDone ? '✓' : i + 1}
              </div>
              <span className={`text-sm ${isActive ? 'text-white font-medium' : 'text-slate-500'}`}>{label}</span>
              {i < 3 && <div className="w-8 h-px bg-slate-700" />}
            </div>
          )
        })}
      </div>

      {/* Step 1: Select Type */}
      {step === 'select' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">What are you importing?</h2>
          <Select value={importType} onValueChange={(v) => setImportType(v)}>
            <SelectTrigger className="w-full max-w-md bg-slate-800 border-slate-700 text-white">
              <SelectValue placeholder="Select import type..." />
            </SelectTrigger>
            <SelectContent>
              {IMPORT_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedType && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 mt-4">
              <h3 className="text-sm font-medium text-slate-300 mb-2">Expected CSV Columns</h3>
              <p className="text-sm text-slate-400 font-mono">{selectedType.columns}</p>
            </div>
          )}

          <Button
            onClick={() => setStep('upload')}
            disabled={!importType}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Next: Upload File
          </Button>
        </div>
      )}

      {/* Step 2: Upload File */}
      {step === 'upload' && !report && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Upload CSV File</h2>
          <p className="text-sm text-slate-400">
            Importing: <Badge variant="outline" className="ml-1">{selectedType?.label}</Badge>
          </p>

          {/* Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-500/10'
                : file
                  ? 'border-green-500/50 bg-green-500/5'
                  : 'border-slate-700 hover:border-slate-600 bg-slate-800/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            {file ? (
              <div className="space-y-2">
                <FileSpreadsheet className="h-10 w-10 mx-auto text-green-400" />
                <p className="text-white font-medium">{file.name}</p>
                <p className="text-sm text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="h-10 w-10 mx-auto text-slate-500" />
                <p className="text-slate-300">Drag & drop your CSV file here</p>
                <p className="text-sm text-slate-500">or click to browse</p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => runImport(false)}
              disabled={!file || isLoading}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileCheck className="h-4 w-4 mr-2" />}
              Test Import (Dry Run)
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review Results */}
      {step === 'review' && report && (
        <div className="space-y-4">
          {/* Summary Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              {report.mode === 'dry_run' ? 'Dry Run Results' : 'Import Results'}
            </h2>
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-800 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-white">{report.total}</p>
                <p className="text-xs text-slate-400 mt-1">Total Rows</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-400">{report.valid}</p>
                <p className="text-xs text-slate-400 mt-1">Valid</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-red-400">{report.error_count}</p>
                <p className="text-xs text-slate-400 mt-1">Errors</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-blue-400">{report.created + report.updated}</p>
                <p className="text-xs text-slate-400 mt-1">Processed</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 mt-6">
              {canCommit && (
                <Button
                  onClick={() => runImport(true)}
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Run Import (Commit {report.valid} Records)
                </Button>
              )}
              <Button variant="outline" onClick={reset} className="border-slate-700 text-slate-300">
                Start Over
              </Button>
            </div>
          </div>

          {/* Error List */}
          {report.errors.length > 0 && (
            <div className="bg-slate-900 border border-red-900/50 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <h3 className="text-sm font-semibold text-red-400">
                  {report.errors.length} Validation Error{report.errors.length !== 1 ? 's' : ''}
                </h3>
              </div>
              <div className="max-h-80 overflow-y-auto space-y-1">
                {report.errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-3 py-2 px-3 rounded bg-slate-800/50 text-sm">
                    {err.row > 0 && (
                      <Badge variant="outline" className="shrink-0 text-xs border-red-800 text-red-400">
                        Row {err.row}
                      </Badge>
                    )}
                    <span className="text-slate-300">{err.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Done */}
      {step === 'done' && report && (
        <div className="bg-slate-900 border border-green-900/50 rounded-lg p-8 text-center">
          <CheckCircle2 className="h-16 w-16 mx-auto text-green-400 mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Import Complete</h2>
          <p className="text-slate-400 mb-1">{report.message}</p>
          <p className="text-sm text-slate-500">
            {report.created} created, {report.updated} updated out of {report.total} rows.
          </p>
          <Button onClick={reset} className="mt-6 bg-blue-600 hover:bg-blue-700">
            Import More Data
          </Button>
        </div>
      )}
    </div>
  )
}
