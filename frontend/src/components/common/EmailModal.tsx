import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Mail, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/api/client'

interface EmailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** API endpoint path, e.g. '/invoices/123/email/' */
  endpoint: string
  /** Pre-filled recipient email */
  defaultTo?: string
  /** Pre-filled subject */
  defaultSubject?: string
  /** Pre-filled body */
  defaultBody?: string
}

export default function EmailModal({
  open,
  onOpenChange,
  endpoint,
  defaultTo = '',
  defaultSubject = '',
  defaultBody = '',
}: EmailModalProps) {
  const [to, setTo] = useState(defaultTo)
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState(defaultBody)
  const [attachPdf, setAttachPdf] = useState(true)

  // Reset form when defaults change (e.g. when modal opens for different document)
  const [lastDefaults, setLastDefaults] = useState({ defaultTo, defaultSubject, defaultBody })
  if (
    defaultTo !== lastDefaults.defaultTo ||
    defaultSubject !== lastDefaults.defaultSubject ||
    defaultBody !== lastDefaults.defaultBody
  ) {
    setTo(defaultTo)
    setSubject(defaultSubject)
    setBody(defaultBody)
    setLastDefaults({ defaultTo, defaultSubject, defaultBody })
  }

  const sendEmail = useMutation({
    mutationFn: async () => {
      const recipient_list = to.split(',').map((e) => e.trim()).filter(Boolean)
      const ccList = cc ? cc.split(',').map((e) => e.trim()).filter(Boolean) : []
      const { data } = await api.post(endpoint, {
        recipient_list,
        cc: ccList,
        subject,
        body,
        attach_pdf: attachPdf,
      })
      return data
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Email sent successfully')
      onOpenChange(false)
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || error?.response?.data?.error || 'Failed to send email'
      toast.error(msg)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Send Email
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email-to">To</Label>
            <Input
              id="email-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
            />
            <p className="text-xs text-muted-foreground">Separate multiple emails with commas</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-cc">CC</Label>
            <Input
              id="email-cc"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-body">Message</Label>
            <Textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Enter your message..."
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={attachPdf}
              onCheckedChange={setAttachPdf}
            />
            <Label className="flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5" />
              Attach PDF
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => sendEmail.mutate()}
            disabled={sendEmail.isPending || !to.trim()}
          >
            <Mail className="h-4 w-4 mr-2" />
            {sendEmail.isPending ? 'Sending...' : 'Send Email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
