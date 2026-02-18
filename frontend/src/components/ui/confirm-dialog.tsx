/**
 * Reusable ConfirmDialog wrapper.
 *
 * Re-exports the ConfirmDialog from alert-dialog.tsx which is the canonical
 * implementation using Radix Dialog primitives. Import from either location:
 *
 *   import { ConfirmDialog } from '@/components/ui/confirm-dialog'
 *   import { ConfirmDialog } from '@/components/ui/alert-dialog'
 *
 * Props:
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   title: string
 *   description: string
 *   confirmLabel?: string (default: 'Confirm')
 *   cancelLabel?: string (default: 'Cancel')
 *   variant?: 'default' | 'destructive' (default: 'default')
 *   onConfirm: () => void
 *   loading?: boolean (default: false)
 *
 * Example:
 *   <ConfirmDialog
 *     open={showDelete}
 *     onOpenChange={setShowDelete}
 *     title="Delete Item?"
 *     description="This action cannot be undone."
 *     confirmLabel="Delete"
 *     variant="destructive"
 *     onConfirm={handleDelete}
 *     loading={isDeleting}
 *   />
 */
export { ConfirmDialog } from '@/components/ui/alert-dialog'
