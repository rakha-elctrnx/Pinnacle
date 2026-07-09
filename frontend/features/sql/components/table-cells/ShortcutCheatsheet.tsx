/**
 * ShortcutCheatsheet — overlay listing keyboard shortcuts for the table grid.
 * Opens via `?` (when not editing) or a toolbar button.
 */

import { useEffect, useRef } from 'react'
import { ActionButton } from '../../../_shared/components/ui/ActionButton'
import { X } from 'lucide-react'

interface ShortcutCheatsheetProps {
  open: boolean
  onClose: () => void
}

interface ShortcutRow {
  keys: string
  action: string
}

const SHORTCUTS: ShortcutRow[] = [
  { keys: '↑ ↓ ← →', action: 'Move active cell' },
  { keys: 'Shift + Arrow', action: 'Extend selection' },
  { keys: 'Cmd/Ctrl + A', action: 'Select all cells' },
  { keys: 'Cmd/Ctrl + Home', action: 'Go to first cell' },
  { keys: 'Cmd/Ctrl + End', action: 'Go to last cell' },
  { keys: 'Home / End', action: 'First/last cell in row' },
  { keys: 'Enter / F2', action: 'Edit active cell' },
  { keys: 'Tab / Shift+Tab', action: 'Next/previous cell' },
  { keys: 'Escape', action: 'Cancel edit / clear selection' },
  { keys: 'Delete / Backspace', action: 'Stage row(s) for deletion' },
  { keys: 'Cmd/Ctrl + Enter', action: 'Commit pending changes' },
  { keys: 'Cmd/Ctrl + Z', action: 'Undo last action' },
  { keys: 'Cmd/Ctrl + Shift + Z', action: 'Redo' },
  { keys: '?', action: 'Toggle this cheatsheet' },
]

export function ShortcutCheatsheet({ open, onClose }: ShortcutCheatsheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    dialogRef.current?.focus()
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="min-w-[340px] max-w-md rounded-xl bg-bg-base p-5 shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">
            Keyboard shortcuts
          </h3>
          <ActionButton
            icon={<X size={14} />}
            aria-label="Close shortcuts"
            variant="default"
            onClick={onClose}
          />
        </div>
        <ul className="space-y-1.5">
          {SHORTCUTS.map((row) => (
            <li
              key={row.keys}
              className="flex items-center justify-between gap-4 text-xs"
            >
              <span className="text-text-muted">{row.action}</span>
              <kbd className="rounded border border-border-default bg-bg-muted px-1.5 py-0.5 font-mono text-micro text-text-secondary">
                {row.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
