import type { CSSProperties } from 'react'

export const outlineBtnClass = 'inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-md text-[13px] font-medium transition-all cursor-pointer'
export const outlineBtnStyle: CSSProperties = { border: '1px solid var(--so-border)', background: 'var(--so-surface)', color: 'var(--so-text-secondary)' }
export const primaryBtnClass = 'inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-md text-[13px] font-medium text-white transition-all cursor-pointer'
export const primaryBtnStyle: CSSProperties = { background: 'var(--so-accent)', border: '1px solid var(--so-accent)' }
