import React from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Trash2,
  Copy,
  Printer,
  Mail,
  Paperclip,
  FileText,
  ShoppingCart,
  Ban,
} from 'lucide-react'

interface EntryToolbarProps {
  // Navigation
  onPrev?: () => void
  onNext?: () => void
  hasPrev?: boolean
  hasNext?: boolean
  // Save
  onSave?: () => void
  isSaving?: boolean
  // Void/Delete
  onVoid?: () => void
  onDelete?: () => void
  // Duplicate
  onDuplicate?: () => void
  // Print
  onPrint?: () => void
  // Email
  onEmail?: () => void
  // Attachments
  onAttachments?: () => void
  attachmentCount?: number
  // Create from SO
  onCreateInvoice?: () => void
  onCreatePO?: () => void
}

const outlineBtnClass =
  'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = {
  border: '1px solid var(--so-border)',
  background: 'var(--so-surface)',
  color: 'var(--so-text-secondary)',
}
const primaryBtnClass =
  'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--so-accent)',
  border: '1px solid var(--so-accent)',
}
const disabledClass = 'opacity-40 pointer-events-none'
const dividerStyle: React.CSSProperties = {
  width: 1,
  alignSelf: 'stretch',
  background: 'var(--so-border)',
  margin: '0 4px',
}

const Divider = () => <div style={dividerStyle} />

export function EntryToolbar({
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onSave,
  isSaving,
  onVoid,
  onDelete,
  onDuplicate,
  onPrint,
  onEmail,
  onAttachments,
  attachmentCount,
  onCreateInvoice,
  onCreatePO,
}: EntryToolbarProps) {
  const hasNav = onPrev !== undefined || onNext !== undefined
  const hasSaveOrVoid = onSave !== undefined || onVoid !== undefined || onDelete !== undefined
  const hasRight =
    onDuplicate !== undefined ||
    onPrint !== undefined ||
    onEmail !== undefined ||
    onAttachments !== undefined ||
    onCreateInvoice !== undefined ||
    onCreatePO !== undefined

  return (
    <div
      className="flex items-center gap-1 px-3 py-2 rounded-[14px] border"
      style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
    >
      {/* Left group: Navigation */}
      {hasNav && (
        <div className="flex items-center gap-1">
          {onPrev !== undefined && (
            <button
              className={`${outlineBtnClass} ${!hasPrev ? disabledClass : ''}`}
              style={outlineBtnStyle}
              onClick={onPrev}
              disabled={!hasPrev}
              title="Previous record"
            >
              <ChevronLeft size={15} />
            </button>
          )}
          {onNext !== undefined && (
            <button
              className={`${outlineBtnClass} ${!hasNext ? disabledClass : ''}`}
              style={outlineBtnStyle}
              onClick={onNext}
              disabled={!hasNext}
              title="Next record"
            >
              <ChevronRight size={15} />
            </button>
          )}
        </div>
      )}

      {hasNav && hasSaveOrVoid && <Divider />}

      {/* Center group: Save, Void, Delete */}
      {hasSaveOrVoid && (
        <div className="flex items-center gap-1">
          {onSave !== undefined && (
            <button
              className={`${primaryBtnClass} ${isSaving ? disabledClass : ''}`}
              style={primaryBtnStyle}
              onClick={onSave}
              disabled={isSaving}
              title="Save"
            >
              <Save size={14} />
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          )}
          {onVoid !== undefined && (
            <button
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={onVoid}
              title="Void"
            >
              <Ban size={14} />
              Void
            </button>
          )}
          {onDelete !== undefined && (
            <button
              className={outlineBtnClass}
              style={{ ...outlineBtnStyle, color: 'var(--so-error, #ef4444)' }}
              onClick={onDelete}
              title="Delete"
            >
              <Trash2 size={14} />
              Delete
            </button>
          )}
        </div>
      )}

      {(hasNav || hasSaveOrVoid) && hasRight && <Divider />}

      {/* Right group: Copy, Print, Email, Attachments, Create Invoice, Create PO */}
      {hasRight && (
        <div className="flex items-center gap-1 ml-auto">
          {onDuplicate !== undefined && (
            <button
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={onDuplicate}
              title="Create copy"
            >
              <Copy size={14} />
              Copy
            </button>
          )}
          {onPrint !== undefined && (
            <button
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={onPrint}
              title="Print"
            >
              <Printer size={14} />
              Print
            </button>
          )}
          {onEmail !== undefined && (
            <button
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={onEmail}
              title="Email"
            >
              <Mail size={14} />
              Email
            </button>
          )}
          {onAttachments !== undefined && (
            <button
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={onAttachments}
              title="Attachments"
            >
              <Paperclip size={14} />
              Attachments
              {attachmentCount !== undefined && attachmentCount > 0 && (
                <span
                  className="ml-0.5 inline-flex items-center justify-center rounded-full text-[11px] font-semibold leading-none px-1.5 py-0.5"
                  style={{
                    background: 'var(--so-accent)',
                    color: '#fff',
                    minWidth: 18,
                  }}
                >
                  {attachmentCount}
                </span>
              )}
            </button>
          )}
          {onCreateInvoice !== undefined && (
            <button
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={onCreateInvoice}
              title="Create invoice from sales order"
            >
              <FileText size={14} />
              Create Invoice
            </button>
          )}
          {onCreatePO !== undefined && (
            <button
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={onCreatePO}
              title="Create purchase order from sales order"
            >
              <ShoppingCart size={14} />
              Create PO
            </button>
          )}
        </div>
      )}
    </div>
  )
}
