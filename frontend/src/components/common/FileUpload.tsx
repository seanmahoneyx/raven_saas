import { useRef, useState, useCallback } from 'react'
import { Upload, X, FileText, Image, File, Trash2, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAttachments, useUploadAttachment, useDeleteAttachment } from '@/api/attachments'
import { format } from 'date-fns'

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt',
])
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

function getExtension(filename: string): string {
  return filename.slice(filename.lastIndexOf('.')).toLowerCase()
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ filename }: { filename: string }) {
  const ext = getExtension(filename)
  if (IMAGE_EXTENSIONS.has(ext)) return <Image className="h-4 w-4 text-blue-500" />
  if (ext === '.pdf') return <FileText className="h-4 w-4 text-red-500" />
  return <File className="h-4 w-4 text-muted-foreground" />
}

interface Props {
  appLabel: string
  modelName: string
  objectId: number
}

export default function FileUpload({ appLabel, modelName, objectId }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  const { data: attachments = [], isLoading } = useAttachments(appLabel, modelName, objectId)
  const upload = useUploadAttachment(appLabel, modelName, objectId)
  const deleteAttachment = useDeleteAttachment(appLabel, modelName, objectId)

  const validateFile = (file: File): string | null => {
    const ext = getExtension(file.name)
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return `File type not allowed. Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is 10MB (this file is ${formatFileSize(file.size)})`
    }
    return null
  }

  const handleFileSelect = (file: File) => {
    setValidationError(null)
    const error = validateFile(file)
    if (error) {
      setValidationError(error)
      return
    }
    setPendingFile(file)
  }

  const handleUpload = async () => {
    if (!pendingFile) return
    await upload.mutateAsync({ file: pendingFile, description })
    setPendingFile(null)
    setDescription('')
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileSelect(file)
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  const handleDelete = (id: number) => {
    deleteAttachment.mutate(id)
    setDeleteConfirmId(null)
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
        }`}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">Drop a file here or click to browse</p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, images, Office docs, CSV, TXT — max 10MB
        </p>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={Array.from(ALLOWED_EXTENSIONS).join(',')}
          onChange={handleInputChange}
        />
      </div>

      {/* Validation error */}
      {validationError && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <X className="h-4 w-4 flex-shrink-0" />
          {validationError}
        </div>
      )}

      {/* Pending file confirmation */}
      {pendingFile && (
        <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
          <div className="flex items-center gap-2">
            <FileIcon filename={pendingFile.name} />
            <span className="text-sm font-medium truncate flex-1">{pendingFile.name}</span>
            <span className="text-xs text-muted-foreground">{formatFileSize(pendingFile.size)}</span>
            <button
              onClick={() => setPendingFile(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Image preview */}
          {IMAGE_EXTENSIONS.has(getExtension(pendingFile.name)) && (
            <img
              src={URL.createObjectURL(pendingFile)}
              alt="Preview"
              className="max-h-32 rounded border object-contain"
            />
          )}
          <Input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="text-sm"
          />
          <Button
            size="sm"
            onClick={handleUpload}
            disabled={upload.isPending}
            className="w-full"
          >
            {upload.isPending ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      )}

      {/* Attachment list */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground text-center py-4">Loading attachments...</div>
      ) : attachments.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-4">No attachments yet</div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{attachments.length} attachment{attachments.length !== 1 ? 's' : ''}</p>
          {attachments.map((att) => (
            <div key={att.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
              <FileIcon filename={att.filename} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{att.filename}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatFileSize(att.file_size)}</span>
                  {att.description && <span>· {att.description}</span>}
                  <span>· {format(new Date(att.created_at), 'MMM d, yyyy')}</span>
                  {att.uploaded_by_name && <span>· {att.uploaded_by_name}</span>}
                </div>
              </div>

              {/* Thumbnail for images */}
              {IMAGE_EXTENSIONS.has(getExtension(att.filename)) && att.download_url && (
                <img
                  src={att.download_url}
                  alt={att.filename}
                  className="h-10 w-10 rounded object-cover flex-shrink-0"
                />
              )}

              <div className="flex items-center gap-1">
                {att.download_url && (
                  <a
                    href={att.download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Download"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                )}
                {deleteConfirmId === att.id ? (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleDelete(att.id)}
                      disabled={deleteAttachment.isPending}
                    >
                      Delete
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setDeleteConfirmId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirmId(att.id)}
                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
