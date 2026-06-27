/**
 * GridContextMenu — right-click context menu for the table data grid.
 *
 * Supports:
 * - Copy (TSV), Copy with headers, Copy as SQL, Copy as CSV
 * - Paste (TSV from clipboard)
 * - Set to NULL, Delete row(s)
 * - Generate SQL (opens modal)
 * - Keyboard navigation (arrow keys, Enter, Escape)
 * - Viewport boundary detection (flip on overflow)
 * - Pinnacle token theme (dark/light mode)
 *
 * Note: This menu is for the data grid cells/rows, not the sidebar tree.
 * The sidebar tree has its own ContextMenu component.
 */

import {
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type KeyboardEvent,
} from 'react'
import {
  ClipboardCopy,
  ClipboardPaste,
  FileCode,
  Ban,
  Trash2,
  Table2,
  ClipboardList,
  FileSpreadsheet,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────

export interface GridContextMenuProps {
  /** Cursor X position (client coordinates) */
  x: number
  /** Cursor Y position (client coordinates) */
  y: number
  /** Close the menu */
  onClose: () => void
  // ── Action callbacks ──────────────────────────────────────────
  onCopy: () => void
  onCopyWithHeaders: () => void
  onCopyAsSQL: () => void
  onCopyAsCSV: () => void
  onPaste: () => void
  onSetToNull: () => void
  onDeleteRows: () => void
  onGenerateSQL: () => void
}

type MenuItem = {
  label: string
  shortcut?: string
  icon: React.ReactNode
  action: () => void
  dividerAfter?: boolean
  dangerous?: boolean
}

// ── Component ──────────────────────────────────────────────────────

export function GridContextMenu({
  x,
  y,
  onClose,
  onCopy,
  onCopyWithHeaders,
  onCopyAsSQL,
  onCopyAsCSV,
  onPaste,
  onSetToNull,
  onDeleteRows,
  onGenerateSQL,
}: GridContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: y, left: x })
  const [activeIndex, setActiveIndex] = useState(0)

  // ── Menu items definition ──────────────────────────────────────
  const items = useMemo<MenuItem[]>(
    () => [
      {
        label: 'Copy',
        shortcut: 'Ctrl+C',
        icon: <ClipboardCopy size={14} />,
        action: onCopy,
      },
      {
        label: 'Copy with headers',
        shortcut: 'Ctrl+Shift+C',
        icon: <ClipboardList size={14} />,
        action: onCopyWithHeaders,
      },
      {
        label: 'Copy as SQL',
        icon: <FileCode size={14} />,
        action: onCopyAsSQL,
      },
      {
        label: 'Copy as CSV',
        icon: <FileSpreadsheet size={14} />,
        action: onCopyAsCSV,
        dividerAfter: true,
      },
      {
        label: 'Paste',
        shortcut: 'Ctrl+V',
        icon: <ClipboardPaste size={14} />,
        action: onPaste,
        dividerAfter: true,
      },
      {
        label: 'Set to NULL',
        shortcut: 'Ctrl+Shift+N',
        icon: <Ban size={14} />,
        action: onSetToNull,
      },
      {
        label: 'Generate SQL',
        icon: <Table2 size={14} />,
        action: onGenerateSQL,
      },
      {
        label: 'Delete row(s)',
        shortcut: 'Delete',
        icon: <Trash2 size={14} />,
        action: onDeleteRows,
        dangerous: true,
      },
    ],
    [onCopy, onCopyWithHeaders, onCopyAsSQL, onCopyAsCSV, onPaste, onSetToNull, onDeleteRows, onGenerateSQL],
  )

  // ── Viewport boundary detection ────────────────────────────────
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const GAP = 4

    let top = y
    let left = x

    if (top + rect.height > vh) {
      top = y - rect.height
      if (top < GAP) top = GAP
    }
    if (left + rect.width > vw) {
      left = x - rect.width
      if (left < GAP) left = GAP
    }
    if (top < GAP) top = GAP
    if (left < GAP) left = GAP

    setPos({ top, left })
    setActiveIndex(0)
  }, [x, y])

  // ── Close on click outside ────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid the same click that opened the menu from closing it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  // ── Close on Escape ───────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // ── Keyboard navigation ───────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setActiveIndex((prev) => (prev + 1) % items.length)
          break
        case 'ArrowUp':
          e.preventDefault()
          setActiveIndex((prev) => (prev - 1 + items.length) % items.length)
          break
        case 'Enter':
        case ' ':
          e.preventDefault()
          items[activeIndex]?.action()
          onClose()
          return
        case 'Escape':
          e.preventDefault()
          onClose()
          return
        default:
          return
      }
    },
    [activeIndex, items, onClose],
  )

  // ── Active item focus management ──────────────────────────────
  useEffect(() => {
    const menuEl = menuRef.current
    if (!menuEl) return
    const target = menuEl.children[activeIndex] as HTMLElement | undefined
    target?.focus?.()
  }, [activeIndex])

  return (
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      aria-label="Table grid context menu"
      style={{ top: pos.top, left: pos.left }}
      onKeyDown={handleKeyDown}
      className="fixed z-50 min-w-44 rounded-xl border border-border-default bg-bg-base p-1 shadow-xl outline-none backdrop-blur-sm"
    >
      {items.map((item, index) => (
        <div key={item.label}>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={false}
            onClick={() => {
              item.action()
              onClose()
            }}
            onMouseEnter={() => setActiveIndex(index)}
            className={[
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-body transition-colors',
              item.dangerous
                ? 'text-text-primary hover:bg-danger-subtle hover:text-danger'
                : 'text-text-primary hover:bg-primary-subtle',
              activeIndex === index && !item.dangerous
                ? 'bg-primary-subtle text-primary'
                : '',
              activeIndex === index && item.dangerous
                ? 'bg-danger-subtle text-danger'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="flex-shrink-0 text-text-muted">{item.icon}</span>
            <span className="flex-1 text-left">{item.label}</span>
            {item.shortcut && (
              <span className="flex-shrink-0 text-micro text-text-muted">{item.shortcut}</span>
            )}
          </button>
          {item.dividerAfter && (
            <div className="my-1 border-t border-border-default" />
          )}
        </div>
      ))}
    </div>
  )
}
