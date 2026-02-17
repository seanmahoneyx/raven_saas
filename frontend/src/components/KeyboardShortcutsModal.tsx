import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SHORTCUT_DEFINITIONS } from '@/hooks/useKeyboardShortcuts'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function KeyboardShortcutsModal({ open, onOpenChange }: Props) {
  // Group shortcuts by category
  const categories = SHORTCUT_DEFINITIONS.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) acc[shortcut.category] = []
    acc[shortcut.category].push(shortcut)
    return acc
  }, {} as Record<string, typeof SHORTCUT_DEFINITIONS>)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {Object.entries(categories).map(([category, shortcuts]) => (
            <div key={category}>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {category}
              </h3>
              <div className="space-y-1">
                {shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.key + (shortcut.ctrl ? '-ctrl' : '') + (shortcut.shift ? '-shift' : '')}
                    className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50"
                  >
                    <span className="text-sm text-foreground">{shortcut.description}</span>
                    <kbd className="inline-flex items-center gap-1 rounded border border-border bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
                      {shortcut.ctrl && <span>Ctrl+</span>}
                      {shortcut.shift && <span>Shift+</span>}
                      <span>{shortcut.key}</span>
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-mono">Esc</kbd> to close
        </p>
      </DialogContent>
    </Dialog>
  )
}
