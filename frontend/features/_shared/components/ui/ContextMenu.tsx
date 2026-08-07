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
  /** Makes item visually disabled and non-interactive */
  disabled?: boolean
}

export interface GenericContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
  ariaLabel?: string
}

/**
 * Index of the first interactable (non-divider, non-disabled) top-level item,
 * or 0 when every item is inert. Used to seed initial focus so keyboard
 * navigation never lands on a divider/disabled row.
 */
function firstActiveIndex(items: ContextMenuItem[]): number {
  const i = items.findIndex((c) => !c.divider && !c.disabled)
  return i < 0 ? 0 : i
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
  const menuItemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const submenuItemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [pos, setPos] = useState({ top: y, left: x })
  const [activeIndex, setActiveIndex] = useState(() =>
    firstActiveIndex(items),
  )
  const [submenuIndex, setSubmenuIndex] = useState<number | null>(null)
  const [submenuChildIndex, setSubmenuChildIndex] = useState(0)
  const [submenuPos, setSubmenuPos] = useState({ top: 0, left: 0 })
  const onCloseRef = useRef(onClose)
  const savedFocusRef = useRef<HTMLElement | null>(null)

  // Keep ref in sync with the latest onClose prop (avoid stale closures in
  // the document-level listeners below). Must run in an effect — updating a
  // ref during render is not allowed.
  useLayoutEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
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
    setPos({ top, left })
    setActiveIndex(firstActiveIndex(items))
    setSubmenuChildIndex(0)
  }, [x, y, items])

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
      // The menu's own keydown handler already handled Escape (e.g. it
      // closed a submenu first) — don't close the whole menu on top.
      if (e.key === 'Escape' && !e.defaultPrevented) onCloseRef.current()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  // ── Focus restore ──────────────────────────────────────────────────
  // Capture the trigger element on mount and return focus to it when the
  // menu closes (either via onClose() or unmount). Callers unmount on close.
  useEffect(() => {
    savedFocusRef.current = document.activeElement as HTMLElement | null
  }, [])
  useLayoutEffect(() => {
    return () => {
      savedFocusRef.current?.focus?.()
    }
  }, [])
  // Open the submenu for a top-level item and position it next to the
  // item's button (mouse hover already positions it; keyboard needs this).
  const openSubmenu = useCallback((index: number) => {
    const itemEl = menuItemRefs.current[index]
    if (itemEl) {
      const rect = itemEl.getBoundingClientRect()
      setSubmenuPos({ top: rect.top - 1, left: rect.right - 2 })
    }
    setSubmenuIndex(index)
  }, [])

  // ── Keyboard navigation ─────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowUp': {
          e.preventDefault()
          const delta = e.key === 'ArrowDown' ? 1 : -1
          if (submenuIndex !== null) {
            const children = items[submenuIndex]?.children ?? []
            const interactive = children
              .map((c, i) => ({ c, i }))
              .filter(({ c }) => !c.divider && !c.disabled)
            if (interactive.length === 0) return
            setSubmenuChildIndex((prev) => {
              const idx = interactive.findIndex(({ i }) => i === prev)
              const next = interactive[(idx + delta + interactive.length) % interactive.length]
              return next.i
            })
          } else {
            const active = items
              .map((c, i) => ({ c, i }))
              .filter(({ c }) => !c.divider && !c.disabled)
            if (active.length === 0) return
            setActiveIndex((prev) => {
              const idx = active.findIndex(({ i }) => i === prev)
              const next = active[(idx + delta + active.length) % active.length]
              return next.i
            })
          }
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          if (submenuIndex !== null) {
            // Already inside a submenu — nothing further right
            return
          }
          const item = items[activeIndex]
          const children = item?.children
          if (!children || children.length === 0 || item.disabled) return
          const firstInteractive = children.findIndex(
            (c) => !c.divider && !c.disabled,
          )
          if (firstInteractive === -1) return
          openSubmenu(activeIndex)
          setSubmenuChildIndex(firstInteractive)
          break
        }
        case 'ArrowLeft': {
          e.preventDefault()
          if (submenuIndex !== null) {
            setSubmenuIndex(null)
            setSubmenuChildIndex(0)
          }
          break
        }
        case 'Enter':
        case ' ': {
          e.preventDefault()
          if (submenuIndex !== null) {
            const children = items[submenuIndex]?.children ?? []
            const child = children[submenuChildIndex]
            if (child && !child.divider && !child.disabled) {
              child.action?.()
              onCloseRef.current()
            }
            return
          }
          const item = items[activeIndex]
          if (!item || item.divider || item.disabled) return
          const children = item.children
          if (children && children.length > 0) {
            const firstInteractive = children.findIndex(
              (c) => !c.divider && !c.disabled,
            )
            if (firstInteractive === -1) return
            openSubmenu(activeIndex)
            setSubmenuChildIndex(firstInteractive)
          } else {
            item.action?.()
            onCloseRef.current()
          }
          return
        }
        case 'Escape': {
          e.preventDefault()
          if (submenuIndex !== null) {
            setSubmenuIndex(null)
            setSubmenuChildIndex(0)
          } else {
            onCloseRef.current()
          }
          return
        }
      }
    },
    [activeIndex, submenuIndex, submenuChildIndex, items, openSubmenu],
  )

  // ── Focus management ────────────────────────────────────────────────
  useEffect(() => {
    if (submenuIndex !== null) {
      const el = submenuItemRefs.current[submenuChildIndex]
      el?.focus?.()
      return
    }
    const el = menuItemRefs.current[activeIndex]
    el?.focus?.()
  }, [activeIndex, submenuIndex, submenuChildIndex])


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
              role="separator"
              className="my-1 border-t border-border-default"
            />
          )
        }
        const hasSubmenu = item.children && item.children.length > 0
        return (
          <div key={item.label} className="relative">
            <button
              type="button"
              ref={(el) => {
                menuItemRefs.current[index] = el
              }}
              role="menuitem"
              tabIndex={-1}
              aria-expanded={hasSubmenu ? submenuIndex === index : undefined}
              aria-disabled={item.disabled || undefined}
              onClick={() => {
                if (hasSubmenu || item.disabled) return
                item.action?.()
                onClose()
              }}
              onMouseEnter={(e) => {
                setActiveIndex(index)
                if (hasSubmenu) {
                  const itemRect = e.currentTarget.getBoundingClientRect()
                  // Submenu opens immediately to the right of button with small overlap
                  setSubmenuPos({
                    top: itemRect.top - 1,
                    left: itemRect.right - 2,
                  })
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
                const subEl = document.querySelector(
                  `[data-submenu="${index}"]`,
                )
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
                item.disabled
                  ? 'opacity-50 cursor-not-allowed pointer-events-none hover:bg-transparent hover:text-text-primary'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {item.icon && (
                <span
                  className={[
                    'shrink-0 [&_svg]:w-3 [&_svg]:h-3',
                    item.dangerous ? '' : 'text-text-muted',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {item.icon}
                </span>
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
                role="menu"
                aria-label={item.label}
                className="fixed z-50 min-w-36 rounded-lg border border-border-default bg-bg-base py-1 shadow-xl outline-none"
                style={{ top: submenuPos.top, left: submenuPos.left }}
                onMouseEnter={() => setSubmenuIndex(index)}
                onMouseLeave={() => setSubmenuIndex(null)}
              >
                {item.children!.map((child, childIndex) => (
                  <button
                    key={child.label}
                    type="button"
                    ref={(el) => {
                      submenuItemRefs.current[childIndex] = el
                    }}
                    role="menuitem"
                    tabIndex={-1}
                    aria-disabled={child.disabled || undefined}
                    onClick={() => {
                      if (child.disabled) return
                      child.action?.()
                      onClose()
                    }}
                    disabled={child.disabled}
                    className={[
                      'flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors',
                      child.dangerous
                        ? 'text-text-primary hover:bg-danger-subtle hover:text-danger'
                        : 'text-text-primary hover:bg-primary-subtle',
                      child.disabled
                        ? 'opacity-50 cursor-not-allowed pointer-events-none hover:bg-transparent hover:text-text-primary'
                        : '',
                    ].join(' ')}
                  >
                    {child.icon && (
                      <span
                        className={[
                          'shrink-0 [&_svg]:w-3 [&_svg]:h-3',
                          child.dangerous ? '' : 'text-text-muted',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
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
