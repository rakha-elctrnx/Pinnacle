import { useState, useEffect, useRef } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ComboboxItem {
  value: string
  label: string
}

export interface ComboboxProps {
  value: string
  onChange: (value: string) => void
  items: ComboboxItem[]
  placeholder?: string
  /** Minimum dropdown width in px. Defaults to 200. */
  minWidth?: number
  /** Whether to show a custom-value label when input doesn't match any item. */
  allowCustom?: boolean
  /** Extra className for the input. */
  inputClassName?: string
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Combobox — searchable autocomplete dropdown.
 *
 * Renders a text input that filters a dropdown list. Uses fixed positioning so
 * the dropdown is never clipped by an overflow container. Closes on blur /
 * outside click / Escape.
 *
 * Accepts custom values (typed text not in the list) when `allowCustom` is
 * true — a "Custom: …" label is shown below the filtered items.
 */
export function Combobox({
  value,
  onChange,
  items,
  placeholder = '',
  minWidth = 200,
  allowCustom = false,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState(value)
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        listRef.current &&
        !listRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const openDropdown = () => {
    const el = inputRef.current
    if (el) {
      const rect = el.getBoundingClientRect()
      setDropStyle({
        position: 'fixed',
        left: rect.left,
        top: rect.bottom + 4,
        width: Math.max(rect.width, minWidth),
      })
    }
    setOpen(true)
  }

  const select = (item: ComboboxItem) => {
    onChange(item.value)
    setFilter(item.label)
    setOpen(false)
    inputRef.current?.focus()
  }

  const filtered = items.filter((item) =>
    item.label.toLowerCase().includes(filter.toLowerCase()),
  )
  const isCustom = allowCustom && value && !items.some((i) => i.value === value)

  return (
    <div>
      <input
        ref={inputRef}
        type="text"
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value)
          onChange(e.target.value)
          if (!open) setOpen(true)
        }}
        onFocus={() => {
          setFilter(value)
          openDropdown()
        }}
        placeholder={placeholder}
        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
      />
      {open && (filtered.length > 0 || isCustom) && (
        <ul
          ref={listRef}
          style={dropStyle}
          className="z-50 max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg scrollbar-thin"
        >
          {filtered.map((item) => (
            <li key={item.value}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  select(item)
                }}
                className="block w-full px-2 py-1 text-left text-xs text-slate-700 hover:bg-blue-50"
              >
                {item.label}
              </button>
            </li>
          ))}
          {isCustom && (
            <li className="border-t border-slate-100 px-2 py-1 text-[10px] text-slate-400">
              Custom: {value}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

/**
 * Scrollbar utility class — apply to any scrollable container for thin,
 * rounded slategray scrollbars in Webkit/Chromium.
 *
 * Usage: `className="… scrollbar-thin"`
 *
 * Tailwind v4 variant:
 * @custom-selector :--webkit-scrollbar (&::-webkit-scrollbar)
 * @custom-selector :--webkit-scrollbar-thumb (&::-webkit-scrollbar-thumb)
 *
 * Or use the `scrollbar-thin` class with plugins; here we supply the raw CSS
 * via a global stylesheet or via this component's style tag approach.
 *
 * The `scrollbar-thin` class above relies on a global utility or a Tailwind
 * plugin. If unavailable, the dropdown still works — just uses native scrollbar.
 */
