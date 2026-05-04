import React, { useState, useRef, useEffect } from 'react'
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
  Package,
  MoreVertical,
} from 'lucide-react'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'
import { useIsMobile } from '@/hooks/useIsMobile'

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
  // Receive PO
  onReceive?: () => void
  isReceiving?: boolean
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
  onReceive,
  isReceiving,
}: EntryToolbarProps) {
  const isMobile = useIsMobile()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dropdownOpen) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen])

  const hasNav = onPrev !== undefined || onNext !== undefined
  const hasSaveOrVoid = onSave !== undefined || onVoid !== undefined || onDelete !== undefined
  const hasRight =
    onDuplicate !== undefined ||
    onPrint !== undefined ||
    onEmail !== undefined ||
    onAttachments !== undefined ||
    onCreateInvoice !== undefined ||
    onCreatePO !== undefined ||
    onReceive !== undefined

  // Mobile: show only nav + save inline, everything else in overflow menu
  if (isMobile) {
    const overflowActions = [
      onDuplicate ? { label: 'Duplicate', icon: Copy, action: () => { setDropdownOpen(false); onDuplicate() }, destructive: false } : null,
      onPrint ? { label: 'Print', icon: Printer, action: () => { setDropdownOpen(false); onPrint() }, destructive: false } : null,
      onEmail ? { label: 'Email', icon: Mail, action: () => { setDropdownOpen(false); onEmail() }, destructive: false } : null,
      onAttachments ? { label: `Attachments${attachmentCount ? ` (${attachmentCount})` : ''}`, icon: Paperclip, action: () => { setDropdownOpen(false); onAttachments() }, destructive: false } : null,
      onCreateInvoice ? { label: 'Create Invoice', icon: FileText, action: () => { setDropdownOpen(false); onCreateInvoice() }, destructive: false } : null,
      onCreatePO ? { label: 'Create PO', icon: ShoppingCart, action: () => { setDropdownOpen(false); onCreatePO() }, destructive: false } : null,
      onReceive ? { label: isReceiving ? 'Receiving…' : 'Receive', icon: Package, action: () => { if (!isReceiving) { setDropdownOpen(false); onReceive() } }, destructive: false } : null,
      onVoid ? { label: 'Void', icon: Ban, action: () => { setDropdownOpen(false); onVoid() }, destructive: true } : null,
      onDelete ? { label: 'Delete', icon: Trash2, action: () => { setDropdownOpen(false); onDelete() }, destructive: true } : null,
    ].filter(Boolean) as { label: string; icon: React.ElementType; action: () => void; destructive: boolean }[]

    const hasOverflow = overflowActions.length > 0

    return (
      <div
        className="flex items-center gap-1 px-3 py-2 rounded-[14px] border"
        style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
      >
        {/* Nav buttons */}
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

        {/* Save button (edit mode) */}
        {onSave !== undefined && (
          <>
            {hasNav && <Divider />}
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
          </>
        )}

        {/* Overflow menu */}
        {hasOverflow && (
          <div className="relative ml-auto" ref={dropdownRef}>
            <button
              className={outlineBtnClass}
              style={outlineBtnStyle}
              onClick={() => setDropdownOpen(v => !v)}
              title="More actions"
            >
              <MoreVertical size={15} />
            </button>
            {dropdownOpen && (
              <div
                className="absolute right-0 top-full mt-1 rounded-[10px] border shadow-lg z-[60] py-1 min-w-[180px]"
                style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}
              >
                {overflowActions.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.label}
                      onClick={item.action}
                      className="w-full flex items-center gap-2.5 px-3 text-[13px] font-medium transition-colors cursor-pointer"
                      style={{
                        minHeight: 44,
                        color: item.destructive ? 'var(--so-danger-text)' : 'var(--so-text-primary)',
                        background: 'transparent',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Icon size={15} />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Desktop: original behavior
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
          {onReceive !== undefined && (
            <button
              className={`${primaryBtnClass} ${isReceiving ? disabledClass : ''}`}
              style={{ ...primaryBtnStyle, background: 'var(--so-success-text)', borderColor: 'var(--so-success-text)' }}
              onClick={onReceive}
              disabled={isReceiving}
              title="Receive purchase order"
            >
              <Package size={14} />
              {isReceiving ? 'Receiving…' : 'Receive'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
