import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import { useContact, useCreateContact, useUpdateContact, useDeleteContact } from '@/api/contacts'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { outlineBtnClass, outlineBtnStyle, primaryBtnClass, primaryBtnStyle } from '@/components/ui/button-styles'

const labelClass = 'block text-[12px] font-semibold uppercase tracking-wider mb-1.5'
const labelStyle: React.CSSProperties = { color: 'var(--so-text-tertiary)' }
const inputClass = 'w-full px-3 py-2 rounded-md text-sm'
const inputStyle: React.CSSProperties = {
  background: 'var(--so-bg)',
  border: '1px solid var(--so-border)',
  color: 'var(--so-text-primary)',
}

export default function ContactDetail() {
  usePageTitle('Contact')

  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isNew = !id
  const contactId = parseInt(id || '0', 10)
  const partyIdFromQuery = parseInt(searchParams.get('party') || '0', 10)

  const { data: existing } = useContact(contactId)
  const createContact = useCreateContact()
  const updateContact = useUpdateContact()
  const deleteContact = useDeleteContact()

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    title: '',
    email: '',
    phone: '',
    mobile: '',
    is_primary: false,
    is_active: true,
    notes: '',
  })
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  useEffect(() => {
    if (existing) {
      setForm({
        first_name: existing.first_name,
        last_name: existing.last_name,
        title: existing.title || '',
        email: existing.email || '',
        phone: existing.phone || '',
        mobile: existing.mobile || '',
        is_primary: existing.is_primary,
        is_active: existing.is_active,
        notes: existing.notes || '',
      })
    }
  }, [existing])

  const partyId = existing?.party || partyIdFromQuery

  const handleSave = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error('First name and last name are required')
      return
    }
    try {
      if (isNew) {
        if (!partyId) {
          toast.error('No party specified')
          return
        }
        await createContact.mutateAsync({ ...form, party: partyId } as any)
        navigate(-1)
      } else {
        await updateContact.mutateAsync({ id: contactId, ...form })
        toast.success('Contact updated')
      }
    } catch {
      // error handled by mutation
    }
  }

  const handleDelete = async () => {
    try {
      await deleteContact.mutateAsync(contactId)
      navigate(-1)
    } catch {
      // error handled by mutation
    }
  }

  const updateField = (field: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[720px] mx-auto px-4 md:px-8 py-7 pb-16">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-5 animate-in">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--so-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--so-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--so-text-tertiary)')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
        </div>

        {/* Title */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-7 animate-in delay-1">
          <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>
            {isNew ? 'New Contact' : `${existing?.first_name || ''} ${existing?.last_name || ''}`}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {!isNew && (
              <button
                className={outlineBtnClass}
                style={{ ...outlineBtnStyle, color: 'var(--so-danger-text)', borderColor: 'var(--so-danger-text)' }}
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            )}
            <button
              className={primaryBtnClass}
              style={primaryBtnStyle}
              onClick={handleSave}
              disabled={createContact.isPending || updateContact.isPending}
            >
              <Save className="h-3.5 w-3.5" />
              {isNew ? 'Create' : 'Save'}
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-2" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Contact Details</span>
          </div>
          <div className="px-6 py-5 space-y-5">
            {/* Name Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass} style={labelStyle}>First Name *</label>
                <input
                  className={inputClass}
                  style={inputStyle}
                  value={form.first_name}
                  onChange={e => updateField('first_name', e.target.value)}
                  placeholder="John"
                />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Last Name *</label>
                <input
                  className={inputClass}
                  style={inputStyle}
                  value={form.last_name}
                  onChange={e => updateField('last_name', e.target.value)}
                  placeholder="Smith"
                />
              </div>
            </div>

            {/* Title */}
            <div>
              <label className={labelClass} style={labelStyle}>Job Title</label>
              <input
                className={inputClass}
                style={inputStyle}
                value={form.title}
                onChange={e => updateField('title', e.target.value)}
                placeholder="e.g. Sales Manager"
              />
            </div>

            {/* Contact Info */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass} style={labelStyle}>Email</label>
                <input
                  className={inputClass}
                  style={inputStyle}
                  type="email"
                  value={form.email}
                  onChange={e => updateField('email', e.target.value)}
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Phone</label>
                <input
                  className={inputClass}
                  style={inputStyle}
                  value={form.phone}
                  onChange={e => updateField('phone', e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Mobile</label>
                <input
                  className={inputClass}
                  style={inputStyle}
                  value={form.mobile}
                  onChange={e => updateField('mobile', e.target.value)}
                  placeholder="(555) 987-6543"
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_primary}
                  onChange={e => updateField('is_primary', e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Primary Contact</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => updateField('is_active', e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm font-medium" style={{ color: 'var(--so-text-secondary)' }}>Active</span>
              </label>
            </div>

            {/* Notes */}
            <div>
              <label className={labelClass} style={labelStyle}>Notes</label>
              <textarea
                className={inputClass}
                style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                value={form.notes}
                onChange={e => updateField('notes', e.target.value)}
                placeholder="Additional notes..."
              />
            </div>
          </div>
        </div>

      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Contact"
        description="Are you sure you want to delete this contact? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleteContact.isPending}
      />
    </div>
  )
}
