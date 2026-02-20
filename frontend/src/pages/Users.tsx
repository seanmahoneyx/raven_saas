import { useState } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '@/api/users'
import type { User } from '@/api/users'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Shield, Mail, Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'

const outlineBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer'
const outlineBtnStyle: React.CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
const primaryBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const primaryBtnStyle: React.CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }
const dangerBtnClass = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
const dangerBtnStyle: React.CSSProperties = { background: '#dc2626', border: '1px solid #dc2626' }

const INITIAL_FORM = {
  username: '',
  password: '',
  email: '',
  name: '',
  is_staff: false,
  is_superuser: false,
}

export default function UsersPage() {
  usePageTitle('Users')
  const { data: users, isLoading } = useUsers()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()

  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [formData, setFormData] = useState(INITIAL_FORM)

  const openCreate = () => {
    setFormData(INITIAL_FORM)
    setCreateOpen(true)
  }

  const openEdit = (user: User) => {
    setFormData({
      username: user.username,
      password: '',
      email: user.email,
      name: user.name,
      is_staff: user.is_staff,
      is_superuser: user.is_superuser,
    })
    setEditUser(user)
  }

  const handleCreate = async () => {
    if (!formData.username.trim() || !formData.password) return
    await createUser.mutateAsync(formData)
    setFormData(INITIAL_FORM)
    setCreateOpen(false)
  }

  const handleUpdate = async () => {
    if (!editUser || !formData.username.trim()) return
    const payload: Record<string, any> = {
      id: editUser.id,
      username: formData.username,
      email: formData.email,
      name: formData.name,
      is_staff: formData.is_staff,
      is_superuser: formData.is_superuser,
    }
    if (formData.password) {
      payload.password = formData.password
    }
    await updateUser.mutateAsync(payload as any)
    setEditUser(null)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await deleteUser.mutateAsync(deleteTarget.id)
    setDeleteTarget(null)
  }

  const handleToggleActive = async (user: User) => {
    await updateUser.mutateAsync({ id: user.id, is_active: !user.is_active })
  }

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1080px] mx-auto px-8 py-7 pb-16">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-7 animate-in">
          <div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03em' }}>Users</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--so-text-tertiary)' }}>Manage team members who have access to this company.</p>
          </div>
          <button className={primaryBtnClass} style={primaryBtnStyle} onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            Create User
          </button>
        </div>

        {/* Team Members Card */}
        <div className="rounded-[14px] border overflow-hidden animate-in delay-1" style={{ background: 'var(--so-surface)', borderColor: 'var(--so-border)' }}>
          <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--so-border-light)' }}>
            <span className="text-sm font-semibold">Team Members</span>
            {users && (
              <span
                className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[11px] font-bold"
                style={{ background: 'var(--so-border-light)', color: 'var(--so-text-secondary)' }}
              >
                {users.length}
              </span>
            )}
          </div>

          <div className="px-6 py-2">
            {isLoading ? (
              <p className="text-[13px] py-4" style={{ color: 'var(--so-text-tertiary)' }}>Loading users...</p>
            ) : (
              <div>
                {users?.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between py-3.5"
                    style={{ borderBottom: '1px solid var(--so-border-light)' }}
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold shrink-0"
                        style={{ background: 'var(--so-accent)', color: '#fff', opacity: user.is_active ? 1 : 0.5 }}
                      >
                        {(user.name || user.username).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-[13.5px] font-medium" style={{ color: 'var(--so-text-primary)' }}>
                          {user.name || user.username}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5" style={{ color: 'var(--so-text-tertiary)' }}>
                          <Mail className="h-3 w-3" />
                          <span className="text-[12.5px]">{user.email || 'No email'}</span>
                          <span className="text-[12px]">@{user.username}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Role badges */}
                      {user.is_superuser && (
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
                          style={{ background: 'var(--so-info-bg)', color: 'var(--so-info-text)' }}
                        >
                          <Shield className="h-3 w-3" />
                          Admin
                        </span>
                      )}
                      {user.is_staff && !user.is_superuser && (
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
                          style={{ background: 'var(--so-border-light)', color: 'var(--so-text-secondary)' }}
                        >
                          Staff
                        </span>
                      )}
                      {/* Active / Inactive badge */}
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider"
                        style={
                          user.is_active
                            ? { background: 'var(--so-success-bg)', color: 'var(--so-success-text)' }
                            : { background: 'var(--so-danger-bg)', color: 'var(--so-danger-text)' }
                        }
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full opacity-60"
                          style={{ background: user.is_active ? 'var(--so-success-text)' : 'var(--so-danger-text)' }}
                        />
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>

                      {/* Actions dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(user)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleActive(user)}>
                            {user.is_active ? 'Deactivate' : 'Activate'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(user)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
                {users?.length === 0 && (
                  <p className="text-[13px] py-6 text-center" style={{ color: 'var(--so-text-tertiary)' }}>No users found.</p>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
            <DialogDescription>Add a new team member to your company.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="create-name" style={{ color: 'var(--so-text-secondary)' }}>Full Name</Label>
              <Input
                id="create-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="John Smith"
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-username" style={{ color: 'var(--so-text-secondary)' }}>Username *</Label>
              <Input
                id="create-username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="jsmith"
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-email" style={{ color: 'var(--so-text-secondary)' }}>Email</Label>
              <Input
                id="create-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john@example.com"
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-password" style={{ color: 'var(--so-text-secondary)' }}>Password *</Label>
              <Input
                id="create-password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="create-staff" style={{ color: 'var(--so-text-secondary)' }}>Staff access</Label>
              <Switch
                id="create-staff"
                checked={formData.is_staff}
                onCheckedChange={(checked) => setFormData({ ...formData, is_staff: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="create-admin" style={{ color: 'var(--so-text-secondary)' }}>Admin (superuser)</Label>
              <Switch
                id="create-admin"
                checked={formData.is_superuser}
                onCheckedChange={(checked) => setFormData({ ...formData, is_superuser: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button
              className={primaryBtnClass + (!formData.username.trim() || !formData.password || createUser.isPending ? ' opacity-50 pointer-events-none' : '')}
              style={primaryBtnStyle}
              onClick={handleCreate}
              disabled={!formData.username.trim() || !formData.password || createUser.isPending}
            >
              {createUser.isPending ? 'Creating...' : 'Create User'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user details. Leave password blank to keep unchanged.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name" style={{ color: 'var(--so-text-secondary)' }}>Full Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-username" style={{ color: 'var(--so-text-secondary)' }}>Username *</Label>
              <Input
                id="edit-username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-email" style={{ color: 'var(--so-text-secondary)' }}>Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-password" style={{ color: 'var(--so-text-secondary)' }}>New Password</Label>
              <Input
                id="edit-password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Leave blank to keep current"
                style={{ borderColor: 'var(--so-border)', background: 'var(--so-surface)' }}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-staff" style={{ color: 'var(--so-text-secondary)' }}>Staff access</Label>
              <Switch
                id="edit-staff"
                checked={formData.is_staff}
                onCheckedChange={(checked) => setFormData({ ...formData, is_staff: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-admin" style={{ color: 'var(--so-text-secondary)' }}>Admin (superuser)</Label>
              <Switch
                id="edit-admin"
                checked={formData.is_superuser}
                onCheckedChange={(checked) => setFormData({ ...formData, is_superuser: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setEditUser(null)}>
              Cancel
            </button>
            <button
              className={primaryBtnClass + (!formData.username.trim() || updateUser.isPending ? ' opacity-50 pointer-events-none' : '')}
              style={primaryBtnStyle}
              onClick={handleUpdate}
              disabled={!formData.username.trim() || updateUser.isPending}
            >
              {updateUser.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name || deleteTarget?.username}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button className={outlineBtnClass} style={outlineBtnStyle} onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
            <button
              className={dangerBtnClass + (deleteUser.isPending ? ' opacity-50 pointer-events-none' : '')}
              style={dangerBtnStyle}
              onClick={handleDelete}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? 'Deleting...' : 'Delete User'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
