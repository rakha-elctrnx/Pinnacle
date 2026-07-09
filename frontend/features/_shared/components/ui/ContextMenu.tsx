import {
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useEffect,
} from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ContextMenuItem {
  label: string
  shortcut?: string
  icon?: React.ReactNode
  action?: () => void
  dividerAfter?: boolean
  dangerous?: boolean
  /** Standalone divider row — label/icon/action are ignored. */
  divider?: boolean
}

export interface GenericContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
  ariaLabel?: string
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * GenericContextMenu — right-click context menu positioned at (x, y).
 *
 * Features:
 * - Viewport boundary detection (flips on overflow)
 * - Keyboard navigation (arrow keys, Enter, Escape)
 * - Click-outside + Escape to close
 * - Pinnacle token theme
 * - aria menu roles
 */
export function GenericContextMenu({
  x,
  y,
  items,
  onClose,
  ariaLabel,
}: GenericContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: y, left: x })
  const [activeIndex, setActiveIndex] = useState(0)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // ── Viewport boundary detection ──────────────────────────────────────
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

  // ── Close on click outside ──────────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onCloseRef.current()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // ── Close on Escape ─────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  // ── Keyboard navigation ─────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
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
          const activeItem = items[activeIndex]
          if (activeItem && !activeItem.divider) {
            activeItem.action?.()
            onCloseRef.current()
          }
          return
        case 'Escape':
          e.preventDefault()
          onCloseRef.current()
          return
      }
    },
    [activeIndex, items],
  )

  // ── Focus management ────────────────────────────────────────────────
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
      aria-label={ariaLabel ?? 'Context menu'}
      style={{ top: pos.top, left: pos.left }}
      onKeyDown={handleKeyDown}
      className="fixed z-50 min-w-44 rounded-xl border border-border-default bg-bg-base p-1 shadow-xl outline-none backdrop-blur-sm"
    >
      {items.map((item, index) => {
        if (item.divider) {
          return (
            <div
              key={`divider-${index}`}
              className="my-1 border-t border-border-default"
            />
          )
        }
        return (
          <div key={item.label}>
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                item.action?.()
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
              {item.icon && (
                <span className="shrink-0 text-text-muted">{item.icon}</span>
              )}
              <span className="flex-1 text-left">{item.label}</span>
              {item.shortcut && (
                <span className="shrink-0 text-micro text-text-muted">
                  {item.shortcut}
                </span>
              )}
            </button>
            {item.dividerAfter && (
              <div className="my-1 border-t border-border-default" />
            )}
          </div>
        )
      })}
    </div>
  )
}
