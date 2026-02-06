import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'

interface PermissionGuardProps {
  /** Required roles (user must have at least one) */
  roles?: string[]
  /** Required permissions (user must have at least one) */
  permissions?: string[]
  /** If true, require ALL roles/permissions instead of any */
  requireAll?: boolean
  /** Fallback content when access denied (defaults to nothing) */
  fallback?: ReactNode
  children: ReactNode
}

/**
 * Guard component that conditionally renders children based on user roles/permissions.
 *
 * Usage:
 *   <PermissionGuard roles={['Admin', 'Sales']}>
 *     <SensitiveContent />
 *   </PermissionGuard>
 */
export default function PermissionGuard({
  roles,
  permissions,
  requireAll = false,
  fallback = null,
  children,
}: PermissionGuardProps) {
  const { user } = useAuth()

  if (!user) return <>{fallback}</>

  // Superusers bypass all checks
  if (user.is_superuser) return <>{children}</>

  const userRoles = user.roles || []
  const userPermissions = user.permissions || []

  let hasAccess = true

  if (roles && roles.length > 0) {
    if (requireAll) {
      hasAccess = roles.every((role) => userRoles.includes(role))
    } else {
      hasAccess = roles.some((role) => userRoles.includes(role))
    }
  }

  if (hasAccess && permissions && permissions.length > 0) {
    if (requireAll) {
      hasAccess = permissions.every((perm) => userPermissions.includes(perm))
    } else {
      hasAccess = permissions.some((perm) => userPermissions.includes(perm))
    }
  }

  return <>{hasAccess ? children : fallback}</>
}
