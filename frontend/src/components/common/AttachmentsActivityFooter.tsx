import { format } from 'date-fns'
import { Paperclip, Clock } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import FileUpload from '@/components/common/FileUpload'

interface ActivityEntry {
  timestamp: string
  user: string
  action: string
}

interface AttachmentsActivityFooterProps {
  attachmentCount: number
  onAttachmentsOpen: () => void
  activityData?: ActivityEntry[]
}

export function AttachmentsActivityFooter({
  attachmentCount,
  onAttachmentsOpen,
  activityData,
}: AttachmentsActivityFooterProps) {
  return (
    <div className="grid grid-cols-2 gap-4 mt-4 animate-in delay-4">
      {/* Attachments Card */}
      <div className="rounded-[14px] border overflow-hidden" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
          <span className="text-sm font-semibold">Attachments</span>
          {attachmentCount > 0 && (
            <span className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>{attachmentCount} {attachmentCount === 1 ? 'file' : 'files'}</span>
          )}
        </div>
        <button
          onClick={onAttachmentsOpen}
          className="w-full text-center py-8 px-6 transition-colors cursor-pointer"
          style={{ color: 'var(--so-text-tertiary)', fontSize: '13.5px' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--so-bg)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Paperclip className="h-7 w-7 mx-auto mb-2 opacity-25" />
          {attachmentCount > 0 ? `${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}` : 'No attachments yet'}
        </button>
      </div>

      {/* Activity Card */}
      <div className="rounded-[14px] border overflow-hidden" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
          <span className="text-sm font-semibold">Activity</span>
        </div>
        {activityData && activityData.length > 0 ? (
          <div className="divide-y" style={{ borderColor: 'var(--so-border-light)' }}>
            {activityData.slice(0, 10).map((entry, idx) => (
              <div key={idx} className="px-6 py-3 text-[13px]" style={{ color: 'var(--so-text-secondary)' }}>
                <div className="flex items-center justify-between">
                  <span className="font-medium" style={{ color: 'var(--so-text-primary)' }}>{entry.action}</span>
                  <span className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>
                    {entry.timestamp ? format(new Date(entry.timestamp), 'MMM d, h:mm a') : ''}
                  </span>
                </div>
                {entry.user && <div className="text-xs mt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>{entry.user}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 px-6" style={{ color: 'var(--so-text-tertiary)', fontSize: '13.5px' }}>
            <Clock className="h-7 w-7 mx-auto mb-2 opacity-25" />
            No activity recorded
          </div>
        )}
      </div>
    </div>
  )
}

interface AttachmentsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  appLabel: string
  modelName: string
  objectId: number
}

export function AttachmentsDialog({ open, onOpenChange, appLabel, modelName, objectId }: AttachmentsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Attachments</DialogTitle>
        </DialogHeader>
        <FileUpload appLabel={appLabel} modelName={modelName} objectId={objectId} />
      </DialogContent>
    </Dialog>
  )
}
