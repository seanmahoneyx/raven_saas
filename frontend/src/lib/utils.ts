import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Extract up to 2-char uppercase initials from a display name. */
export function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

/** Shared priority color map for task priority badges. */
export const PRIORITY_COLORS: Record<string, string> = {
  low: 'var(--so-text-tertiary)',
  normal: 'var(--so-text-secondary)',
  high: '#f59e0b',
  urgent: '#ef4444',
}
