import { useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { usePageTitle } from '@/hooks/usePageTitle'
import { apiClient } from '@/api/client'
import { getApiErrorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024 // 5 MB
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Upload, FileCheck, AlertTriangle, CheckCircle2, ArrowLeft, Loader2, FileSpreadsheet, Download } from 'lucide-react'

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
  { value: 'warehouses', label: 'Warehouses', columns: 'Code, Name, IsDefault (opt), PalletCapacity (opt), Notes (opt)' },
  { value: 'locations', label: 'Warehouse Locations (Bins/Zones)', columns: 'Name, Barcode, Warehouse, Type (opt), Zone (opt)' },
  { value: 'customers', label: 'Customers', columns: 'Code, Name, PaymentTerms; opt: LegalName, Email, Phone, Notes, CustomerType, TaxCode, ResaleNumber, CreditLimit, ChargeFreight, Address1, Address2, City, State, PostalCode, Country' },
  { value: 'vendors', label: 'Vendors', columns: 'Code, Name, PaymentTerms; opt: LegalName, Email, Phone, Notes, VendorType, TaxCode, TaxId, CreditLimit, ChargeFreight, Address1, Address2, City, State, PostalCode, Country' },
  { value: 'parties', label: 'Parties (basic — combined customer/vendor)', columns: 'Code, Name, Type [CUSTOMER|VENDOR|BOTH|OTHER]; opt: LegalName, Email, Phone, Notes' },
  { value: 'items', label: 'Items / Products', columns: 'SKU, Name, UOM; opt: Description, Division, PurchDesc, SellDesc, SecondaryIdent, ReorderPoint, MinStock' },
  { value: 'inventory', label: 'Inventory Snapshot (Stock On Hand)', columns: 'SKU, WarehouseCode, OnHand' },
  { value: 'gl-opening-balances', label: 'GL Opening Balances', columns: 'AccountCode, Debit, Credit; opt: Description' },
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
    if (!dropped) return
    if (!dropped.name.toLowerCase().endsWith('.csv')) {
      toast.error('Only .csv files are supported')
      return
    }
    if (dropped.size > MAX_IMPORT_FILE_BYTES) {
      toast.error('File is too large. Maximum size is 5 MB.')
      return
    }
    setFile(dropped)
    setStep('upload')
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    if (!selected.name.toLowerCase().endsWith('.csv')) {
      toast.error('Only .csv files are supported')
      e.target.value = ''
      return
    }
    if (selected.size > MAX_IMPORT_FILE_BYTES) {
      toast.error('File is too large. Maximum size is 5 MB.')
      e.target.value = ''
      return
    }
    setFile(selected)
    setStep('upload')
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
      const success = commit && data.error_count === 0
      setStep(success ? 'done' : 'review')
      if (success) {
        toast.success('Import complete')
      } else if (data.error_count > 0) {
        toast.error(`${data.error_count} validation error${data.error_count === 1 ? '' : 's'} found`)
      }
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, 'Import failed. Check your file format.')
      toast.error(message)
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

  const downloadTemplate = async () => {
    if (!importType) return
    try {
      const res = await apiClient.get(`/admin/import/${importType}/template/`, { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${importType}-template.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      const message = getApiErrorMessage(err, 'Template download failed.')
      console.error('Template download failed', err)
      toast.error(message)
    }
  }

  const downloadAllTemplates = async () => {
    try {
      const res = await apiClient.get('/admin/import/templates/bundle/', { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'raven-import-templates.zip'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      const message = getApiErrorMessage(err, 'Bundle download failed.')
      console.error('Bundle download failed', err)
      toast.error(message)
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
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Data Import</h1>
          <p className="text-muted-foreground mt-1">Upload CSV files to bulk-import records into the system.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={downloadAllTemplates}>
            Download All Templates (ZIP)
          </Button>
          {step !== 'select' && (
            <Button variant="ghost" onClick={reset}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Start Over
            </Button>
          )}
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-3">
        {['Select Type', 'Upload File', 'Review', 'Complete'].map((label, i) => {
          const stepIndex = ['select', 'upload', 'review', 'done'].indexOf(step)
          const isActive = i === stepIndex
          const isDone = i < stepIndex
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={
                  isActive
                    ? { background: 'var(--so-accent)', color: '#fff' }
                    : isDone
                      ? { background: 'var(--so-success-text, #16a34a)', color: '#fff' }
                      : { background: 'var(--so-border-light)', color: 'var(--so-text-tertiary)' }
                }
              >
                {isDone ? '✓' : i + 1}
              </div>
              <span
                className="text-sm"
                style={{
                  color: isActive ? 'var(--so-text-primary)' : 'var(--so-text-tertiary)',
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                {label}
              </span>
              {i < 3 && <div className="w-8 h-px" style={{ background: 'var(--so-border)' }} />}
            </div>
          )
        })}
      </div>

      {/* Step 1: Select Type */}
      {step === 'select' && (
        <div
          className="rounded-lg p-6 space-y-4 border"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
        >
          <h2 className="text-lg font-semibold">What are you importing?</h2>
          <Select value={importType} onValueChange={(v) => setImportType(v)}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Select import type..." />
            </SelectTrigger>
            <SelectContent>
              {IMPORT_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedType && (
            <div
              className="rounded-lg p-4 mt-4 border"
              style={{ background: 'var(--so-bg)', borderColor: 'var(--so-border-light)' }}
            >
              <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--so-text-secondary)' }}>Expected CSV Columns</h3>
              <p className="text-sm font-mono" style={{ color: 'var(--so-text-tertiary)' }}>{selectedType.columns}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => setStep('upload')}
              disabled={!importType}
            >
              Next: Upload File
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={downloadTemplate}
              disabled={!importType}
            >
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Upload File */}
      {step === 'upload' && !report && (
        <div
          className="rounded-lg p-6 space-y-4 border"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
        >
          <h2 className="text-lg font-semibold">Upload CSV File</h2>
          <p className="text-sm text-muted-foreground">
            Importing: <Badge variant="outline" className="ml-1">{selectedType?.label}</Badge>
          </p>

          {/* Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors"
            style={
              isDragging
                ? { borderColor: 'var(--so-accent)', background: 'var(--so-info-bg, rgba(0,0,0,0.04))' }
                : file
                  ? { borderColor: 'var(--so-success-text, #16a34a)', background: 'var(--so-success-bg, rgba(0,0,0,0.03))' }
                  : { borderColor: 'var(--so-border)', background: 'var(--so-bg)' }
            }
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
                <FileSpreadsheet className="h-10 w-10 mx-auto" style={{ color: 'var(--so-success-text, #16a34a)' }} />
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="h-10 w-10 mx-auto" style={{ color: 'var(--so-text-tertiary)' }} />
                <p style={{ color: 'var(--so-text-secondary)' }}>Drag &amp; drop your CSV file here</p>
                <p className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>or click to browse (max 5 MB)</p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => runImport(false)}
              disabled={!file || isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileCheck className="h-4 w-4 mr-2" />}
              Test Import (Dry Run)
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={downloadTemplate}
              disabled={!importType}
            >
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review Results */}
      {step === 'review' && report && (
        <div className="space-y-4">
          {/* Summary Card */}
          <div
            className="rounded-lg p-6 border"
            style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
          >
            <h2 className="text-lg font-semibold mb-4">
              {report.mode === 'dry_run' ? 'Dry Run Results' : 'Import Results'}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-lg p-4 text-center border" style={{ background: 'var(--so-bg)', borderColor: 'var(--so-border-light)' }}>
                <p className="text-2xl font-bold">{report.total}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Total Rows</p>
              </div>
              <div className="rounded-lg p-4 text-center border" style={{ background: 'var(--so-bg)', borderColor: 'var(--so-border-light)' }}>
                <p className="text-2xl font-bold" style={{ color: 'var(--so-success-text, #16a34a)' }}>{report.valid}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Valid</p>
              </div>
              <div className="rounded-lg p-4 text-center border" style={{ background: 'var(--so-bg)', borderColor: 'var(--so-border-light)' }}>
                <p className="text-2xl font-bold" style={{ color: 'var(--so-danger-text, #dc2626)' }}>{report.error_count}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Errors</p>
              </div>
              <div className="rounded-lg p-4 text-center border" style={{ background: 'var(--so-bg)', borderColor: 'var(--so-border-light)' }}>
                <p className="text-2xl font-bold" style={{ color: 'var(--so-accent)' }}>{report.created + report.updated}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Processed</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 mt-6">
              {canCommit && (
                <Button
                  onClick={() => runImport(true)}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Run Import (Commit {report.valid} Records)
                </Button>
              )}
              <Button variant="outline" onClick={reset}>
                Start Over
              </Button>
            </div>
          </div>

          {/* Error List */}
          {report.errors.length > 0 && (
            <div
              className="rounded-lg p-6 border"
              style={{ background: 'var(--so-surface)', borderColor: 'var(--so-danger-border, var(--so-border))' }}
            >
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5" style={{ color: 'var(--so-danger-text, #dc2626)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--so-danger-text, #dc2626)' }}>
                  {report.errors.length} Validation Error{report.errors.length !== 1 ? 's' : ''}
                </h3>
              </div>
              <div className="max-h-80 overflow-y-auto space-y-1">
                {report.errors.map((err, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 py-2 px-3 rounded text-sm"
                    style={{ background: 'var(--so-bg)' }}
                  >
                    {err.row > 0 && (
                      <Badge variant="outline" className="shrink-0 text-xs">
                        Row {err.row}
                      </Badge>
                    )}
                    <span style={{ color: 'var(--so-text-secondary)' }}>{err.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Done */}
      {step === 'done' && report && (
        <div
          className="rounded-lg p-8 text-center border"
          style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
        >
          <CheckCircle2 className="h-16 w-16 mx-auto mb-4" style={{ color: 'var(--so-success-text, #16a34a)' }} />
          <h2 className="text-xl font-bold mb-2">Import Complete</h2>
          <p className="mb-1" style={{ color: 'var(--so-text-secondary)' }}>{report.message}</p>
          <p className="text-sm" style={{ color: 'var(--so-text-tertiary)' }}>
            {report.created} created, {report.updated} updated out of {report.total} rows.
          </p>
          <Button onClick={reset} className="mt-6">
            Import More Data
          </Button>
        </div>
      )}
    </div>
  )
}
