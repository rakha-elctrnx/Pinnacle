import {
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useEffect,
} from 'react'
import { ChevronRight } from 'lucide-react'

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
  /** Submenu items (shown when hovered) */
  children?: ContextMenuItem[]
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
  const [submenuIndex, setSubmenuIndex] = useState<number | null>(null)
  const [submenuPos, setSubmenuPos] = useState({ top: 0, left: 0 })
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
      className="fixed z-50 min-w-36 rounded-lg border border-border-default bg-bg-base py-1 shadow-xl outline-none backdrop-blur-sm overflow-visible"
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
        const hasSubmenu = item.children && item.children.length > 0
        return (
          <div key={item.label} className="relative">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                if (!hasSubmenu) {
                  item.action?.()
                  onClose()
                }
              }}
              onMouseEnter={(e) => {
                setActiveIndex(index)
                if (hasSubmenu) {
                  const itemRect = e.currentTarget.getBoundingClientRect()
                  // Submenu opens immediately to the right of button with small overlap
                  setSubmenuPos({ top: itemRect.top - 1, left: itemRect.right - 2 })
                  setSubmenuIndex(index)
                } else {
                  setSubmenuIndex(null)
                }
              }}
              onMouseLeave={(e) => {
                if (!hasSubmenu || submenuIndex !== index) {
                  setSubmenuIndex(null)
                  return
                }
                // Keep submenu open if moving into it
                const subEl = document.querySelector(`[data-submenu="${index}"]`)
                if (subEl && subEl.contains(e.relatedTarget as Node)) return
                setSubmenuIndex(null)
              }}
              className={[
                'flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors',
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
                <span className="shrink-0 text-text-muted [&_svg]:w-3 [&_svg]:h-3">{item.icon}</span>
              )}
              <span className="flex-1 text-left">{item.label}</span>
              {item.shortcut && (
                <span className="shrink-0 text-micro text-text-muted">
                  {item.shortcut}
                </span>
              )}
              {hasSubmenu && (
                <ChevronRight size={12} className="shrink-0 text-text-muted" />
              )}
            </button>
            {item.dividerAfter && (
              <div className="my-1 border-t border-border-default" />
            )}
            {/* Submenu */}
            {hasSubmenu && submenuIndex === index && (
              <div
                data-submenu={index}
                className="fixed z-50 min-w-36 rounded-lg border border-border-default bg-bg-base py-1 shadow-xl outline-none"
                style={{ top: submenuPos.top, left: submenuPos.left }}
                onMouseEnter={() => setSubmenuIndex(index)}
                onMouseLeave={() => setSubmenuIndex(null)}
              >
                {item.children!.map((child) => (
                  <button
                    key={child.label}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={() => {
                      child.action?.()
                      onClose()
                    }}
                    className={[
                      'flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors',
                      child.dangerous
                        ? 'text-text-primary hover:bg-danger-subtle hover:text-danger'
                        : 'text-text-primary hover:bg-primary-subtle',
                    ].join(' ')}
                  >
                    {child.icon && (
                      <span className="shrink-0 text-text-muted [&_svg]:w-3 [&_svg]:h-3">
                        {child.icon}
                      </span>
                    )}
                    <span className="flex-1 text-left">{child.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
