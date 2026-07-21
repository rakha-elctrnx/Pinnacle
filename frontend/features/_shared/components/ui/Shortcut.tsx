import { type ReactNode } from 'react'
import { Command, CornerDownLeft, Option } from 'lucide-react'

// ── macOS detection ─────────────────────────────────────────────────────────
// The app runs both inside Tauri (where @tauri-apps/plugin-os exists) and as a
// plain browser during `vite dev`. `navigator` is the lowest-common-denominator
// signal that works in both without extra native dependencies.
function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const uaData = (navigator as unknown as { userAgentData?: { platform?: string } })
    .userAgentData
  const platform =
    uaData?.platform || navigator.platform || navigator.userAgent || ''
  return /mac/i.test(platform)
}

// ── Types ───────────────────────────────────────────────────────────────────

interface ShortcutProps {
  /** e.g. `'Ctrl+Shift+Enter'` — tokens are split on `+`. */
  keys: string
  className?: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const KEYCAP =
  'inline-flex items-center justify-center rounded border border-border-default bg-bg-subtle px-1 py-0.5 font-mono leading-none text-text-secondary'

function renderToken(token: string, isMac: boolean): ReactNode {
  const key = token.trim().toLowerCase()
  switch (key) {
    case 'ctrl':
    case 'cmd':
    case 'control':
      return isMac ? (
        <Command size={11} />
      ) : (
        <span className="text-[9px]">Ctrl</span>
      )
    case 'alt':
    case 'option':
      return isMac ? (
        <Option size={11} />
      ) : (
        <span className="text-[9px]">Alt</span>
      )
    case 'shift':
      // Lucide has no Shift glyph — render the label inside the keycap.
      return <span className="text-[9px]">Shift</span>
    case 'enter':
    case 'return':
      return <CornerDownLeft size={11} />
    default:
      return <span className="text-[9px]">{token}</span>
  }
}

// ── Component ───────────────────────────────────────────────────────────────

/**
 * Shortcut — renders a key-combo string as icon/text keycaps.
 *
 * Uses Lucide glyphs for keys that have one (Command ⌘, Option, Enter ↵) and
 * falls back to a labelled keycap for the rest (Ctrl, Shift). On macOS, `Ctrl`
 * is shown as the ⌘ Command icon and `Alt` as ⌥ Option.
 */
export function Shortcut({ keys, className = '' }: ShortcutProps) {
  const isMac = isMacOS()
  const tokens = keys.split('+').map((t) => t.trim())

  return (
    <span className={`flex flex-shrink-0 items-center gap-0.5 ${className}`}>
      {tokens.map((token, i) => (
        <kbd key={i} className={KEYCAP}>
          {renderToken(token, isMac)}
        </kbd>
      ))}
    </span>
  )
}
