import { useState, useMemo } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Check, X } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { primaryBtnClass, primaryBtnStyle, outlineBtnClass, outlineBtnStyle } from '@/components/ui/button-styles'
import { PageHeader } from '@/components/page'
import {
  useOtherNames,
  useCreateOtherName,
  useUpdateOtherName,
  useDeleteOtherName,
  type OtherName,
} from '@/api/otherNames'

const emptyForm = {
  name: '',
  company_name: '',
  print_name: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  phone: '',
  email: '',
  is_1099: false,
  is_active: true,
  notes: '',
}

type FormData = typeof emptyForm

export default function OtherNames() {
  usePageTitle('Other Names')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<OtherName | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  const { data, isLoading, isError } = useOtherNames()
  const createOtherName = useCreateOtherName()
  const updateOtherName = useUpdateOtherName()
  const deleteOtherName = useDeleteOtherName()

  const rows: OtherName[] = useMemo(() => data ?? [], [data])

  const handleAddNew = () => {
    setEditingItem(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const handleRowClick = (row: OtherName) => {
    setEditingItem(row)
    setForm({
      name: row.name ?? '',
      company_name: row.company_name ?? '',
      print_name: row.print_name ?? '',
      address_line1: row.address_line1 ?? '',
      address_line2: row.address_line2 ?? '',
      city: row.city ?? '',
      state: row.state ?? '',
      postal_code: row.postal_code ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
      is_1099: row.is_1099 ?? false,
      is_active: row.is_active ?? true,
      notes: row.notes ?? '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (editingItem) {
      await updateOtherName.mutateAsync({ id: editingItem.id, ...form })
    } else {
      await createOtherName.mutateAsync(form)
    }
    setDialogOpen(false)
  }

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return
    await deleteOtherName.mutateAsync(pendingDeleteId)
    setDeleteDialogOpen(false)
    setPendingDeleteId(null)
    setDialogOpen(false)
  }

  const isSaving = createOtherName.isPending || updateOtherName.isPending

  const columns: ColumnDef<OtherName>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="font-medium" style={{ color: 'var(--so-text-primary)' }}>
            {row.getValue('name')}
          </span>
        ),
      },
      {
        accessorKey: 'company_name',
        header: 'Company',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-secondary)' }}>
            {row.getValue('company_name') || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'print_name',
        header: 'Print Name',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-secondary)' }}>
            {row.getValue('print_name') || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'phone',
        header: 'Phone',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-tertiary)' }}>
            {row.getValue('phone') || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => (
          <span style={{ color: 'var(--so-text-tertiary)' }}>
            {row.getValue('email') || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'is_1099',
        header: '1099',
        cell: ({ row }) =>
          row.getValue('is_1099') ? (
            <Check className="h-4 w-4" style={{ color: 'var(--so-success-text)' }} />
          ) : (
            <X className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
          ),
      },
      {
        accessorKey: 'is_active',
        header: 'Active',
        cell: ({ row }) =>
          row.getValue('is_active') ? (
            <Check className="h-4 w-4" style={{ color: 'var(--so-success-text)' }} />
          ) : (
            <X className="h-4 w-4" style={{ color: 'var(--so-text-tertiary)' }} />
          ),
      },
    ],
    []
  )

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16">

        {/* Header */}
        <PageHeader
          title="Other Names"
          description="Manage non-vendor payees for checks"
          primary={{ label: 'New Other Name', icon: Plus, onClick: handleAddNew }}
        />

        {/* DataTable Card */}
        <div className="rounded-[14px] overflow-hidden animate-in delay-2"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
          <div className="px-6 py-4 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--so-border-light)', background: 'var(--so-surface-raised)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--so-text-primary)' }}>
              Other Names
            </span>
            <span className="text-xs" style={{ color: 'var(--so-text-tertiary)' }}>
              {rows.length} {rows.length === 1 ? 'record' : 'records'}
            </span>
          </div>
          <div className="p-4">
            {isError && (
              <div className="rounded-[10px] px-4 py-3 text-[13px]" style={{ background: 'var(--so-danger-bg)', color: 'var(--so-danger-text)' }}>
                Failed to load other names. Please try again.
              </div>
            )}
            {isLoading ? (
              <TableSkeleton columns={7} rows={6} />
            ) : (
              <DataTable
                columns={columns}
                data={rows}
                searchColumn="name"
                searchPlaceholder="Search by name..."
                storageKey="other-names"
                onRowClick={handleRowClick}
              />
            )}
          </div>
        </div>

      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingItem(null) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Other Name' : 'New Other Name'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Full name"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Company Name</Label>
                <Input
                  value={form.company_name}
                  onChange={(e) => setForm(f => ({ ...f, company_name: e.target.value }))}
                  placeholder="Company (optional)"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Print Name</Label>
              <Input
                value={form.print_name}
                onChange={(e) => setForm(f => ({ ...f, print_name: e.target.value }))}
                placeholder="Name as it should appear on check"
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Address Line 1</Label>
              <Input
                value={form.address_line1}
                onChange={(e) => setForm(f => ({ ...f, address_line1: e.target.value }))}
                placeholder="Street address"
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Address Line 2</Label>
              <Input
                value={form.address_line2}
                onChange={(e) => setForm(f => ({ ...f, address_line2: e.target.value }))}
                placeholder="Suite, unit, etc."
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>State</Label>
                <Input
                  value={form.state}
                  onChange={(e) => setForm(f => ({ ...f, state: e.target.value }))}
                  maxLength={2}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Postal Code</Label>
                <Input
                  value={form.postal_code}
                  onChange={(e) => setForm(f => ({ ...f, postal_code: e.target.value }))}
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="(555) 000-0000"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="email@example.com"
                  style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <textarea
                className="w-full rounded-md border px-3 py-2 text-sm resize-none"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Additional notes..."
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-primary)' }}
              />
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_1099"
                  checked={form.is_1099}
                  onCheckedChange={(checked) => setForm(f => ({ ...f, is_1099: !!checked }))}
                />
                <Label htmlFor="is_1099" className="cursor-pointer">1099 Vendor</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_active"
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm(f => ({ ...f, is_active: !!checked }))}
                />
                <Label htmlFor="is_active" className="cursor-pointer">Active</Label>
              </div>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between">
            <div>
              {editingItem && (
                <button
                  className={outlineBtnClass}
                  style={{ ...outlineBtnStyle, color: 'var(--so-danger-text)', borderColor: 'var(--so-danger-text)' }}
                  onClick={() => { setPendingDeleteId(editingItem.id); setDeleteDialogOpen(true) }}
                >
                  Delete
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                className={outlineBtnClass}
                style={outlineBtnStyle}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                className={primaryBtnClass}
                style={primaryBtnStyle}
                onClick={handleSave}
                disabled={isSaving || !form.name.trim()}
              >
                {isSaving ? 'Saving...' : editingItem ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Other Name"
        description="Are you sure you want to delete this other name? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        loading={deleteOtherName.isPending}
      />
    </div>
  )
}
