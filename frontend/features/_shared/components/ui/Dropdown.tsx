import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

export interface DropdownItem {
  label: string
  shortcut?: string
  icon?: React.ReactNode
  action: () => void
  dividerAfter?: boolean
  dangerous?: boolean
}

export interface DropdownProps {
  open: boolean
  onClose: () => void
  items: DropdownItem[]
  align?: 'left' | 'right'
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Dropdown — button-triggered menu with Pinnacle token styling.
 *
 * Renders as a backdrop overlay + positioned menu. The parent must wrap
 * both the trigger button and this component in a `relative` container.
 *
 * Supports:
 * - Items with optional icon, shortcut, dangerous styling, dividers
 * - Keyboard navigation (arrow keys, Enter, Escape)
 * - Backdrop click-outside
 * - Left/right alignment
 */
export function Dropdown({
  open,
  onClose,
  items,
  align = 'right',
}: DropdownProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  // Reset active index when menu opens
  useEffect(() => {
    if (open) setActiveIndex(0)
  }, [open])

  // ── Keyboard navigation ────────────────────────────────────────────────
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
      }
    },
    [activeIndex, items, onClose],
  )

  // ── Focus management ───────────────────────────────────────────────────
  useEffect(() => {
    const menuEl = menuRef.current
    if (!menuEl) return
    const target = menuEl.children[activeIndex] as HTMLElement | undefined
    target?.focus?.()
  }, [activeIndex])

  if (!open) return null

  return (
    <>
      {/* Backdrop overlay for click-outside */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={menuRef}
        role="menu"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`absolute top-full mt-1 z-50 min-w-44 rounded-xl border border-border-default bg-bg-base p-1 shadow-xl outline-none backdrop-blur-sm ${
          align === 'right' ? 'right-0' : 'left-0'
        }`}
      >
        {items.map((item, index) => (
          <div key={item.label}>
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
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
              {item.icon && (
                <span className="flex-shrink-0 text-text-muted">
                  {item.icon}
                </span>
              )}
              <span className="flex-1 text-left">{item.label}</span>
              {item.shortcut && (
                <span className="flex-shrink-0 text-micro text-text-muted">
                  {item.shortcut}
                </span>
              )}
            </button>
            {item.dividerAfter && (
              <div className="my-1 border-t border-border-default" />
            )}
          </div>
        ))}
      </div>
    </>
  )
}
