import { useEffect, useState, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  Ellipsis,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Sun,
} from 'lucide-react'
import { useTheme } from '../../../../app/theme'
import { useShellLayout } from '../../store/shellLayoutStore'
import { ActionButton } from '../ui/ActionButton'

/**
 * Header — application-level top bar.
 *
 * Phase 1: standalone, no props. The Settings/About dropdown items from
 * the legacy `AppShell` were removed because Settings was deleted and
 * About has no destination. The overflow menu is kept as a placeholder
 * to preserve layout cadence (and for future Phase 3+ items).
 *
 * The Header also hosts the manual toggle for the right-side
 * `InspectorPanel` (default closed). The icon swaps between an
 * "open" and "closed" glyph so the current state is visible at a
 * glance, and the button uses `aria-pressed` for assistive tech.
 *
 * The native macOS title bar is disabled in `tauri.conf.json`
 * (`titleBarStyle: "Overlay"` + `hiddenTitle: true`). The traffic-light
 * buttons are rendered by the OS but visually sit on top of this
 * header. The `data-tauri-drag-region` attribute lets the user drag
 * the window from anywhere in the header while still allowing button
 * clicks (Tauri differentiates click from drag). The header uses a
 * three-column grid with equal side columns so the window-button area,
 * centered search bar, and right action group keep consistent spacing.
 */
export function Header() {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isWindowFocused, setIsWindowFocused] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { theme, switchTheme } = useTheme()
  const inspectorOpen = useShellLayout((s) => s.inspectorOpen)
  const toggleInspector = useShellLayout((s) => s.toggleInspector)

  useEffect(() => {
    let isMounted = true
    let unlistenFocusChange: (() => void) | undefined
    let unlistenResized: (() => void) | undefined

    async function bindWindowState() {
      try {
        const currentWindow = getCurrentWindow()
        const [focused, fullscreen] = await Promise.all([
          currentWindow.isFocused(),
          currentWindow.isFullscreen(),
        ])

        if (isMounted) {
          setIsWindowFocused(focused)
          setIsFullscreen(fullscreen)
        }

        unlistenFocusChange = await currentWindow.onFocusChanged(({ payload }) => {
          setIsWindowFocused(payload)
        })

        // The placeholder traffic lights are only meaningful when the OS
        // chrome is visible. Once the window enters fullscreen the macOS
        // traffic lights are hidden, so the in-app dots should follow suit
        // instead of floating over the content.
        unlistenResized = await currentWindow.onResized(async () => {
          try {
            const nextFullscreen = await currentWindow.isFullscreen()
            if (isMounted) {
              setIsFullscreen(nextFullscreen)
            }
          } catch {
            // Ignore — window may be tearing down.
          }
        })
      } catch {
        if (isMounted) {
          setIsWindowFocused(true)
          setIsFullscreen(false)
        }
      }
    }

    void bindWindowState()

    return () => {
      isMounted = false
      unlistenFocusChange?.()
      unlistenResized?.()
    }
  }, [])

  return (
    <header
      data-tauri-drag-region
      className="relative grid h-10 grid-cols-[minmax(5rem,1fr)_minmax(16rem,28rem)_minmax(5rem,1fr)] items-center gap-3 px-3 pb-2"
    >
      {/* Left column — reserved for macOS window buttons & drag region */}
      <div data-tauri-drag-region className="flex h-full items-center justify-start">
        {!isWindowFocused && !isFullscreen && (
          <div
            className="pointer-events-none absolute left-3 top-4 z-10 flex -translate-y-1/2 items-center gap-2"
            aria-hidden="true"
          >
            <span className="h-3 w-3 rounded-full bg-border-default shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-border-strong)_35%,transparent)]" />
            <span className="h-3 w-3 rounded-full bg-border-default shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-border-strong)_35%,transparent)]" />
            <span className="h-3 w-3 rounded-full bg-border-default shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-border-strong)_35%,transparent)]" />
          </div>
        )}
        <div className="h-7 w-20" aria-hidden="true" />
      </div>

      {/* Center column — search bar (mathematically centered) */}
      <div className="flex min-w-0 items-center justify-center">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg border border-border-default bg-bg-subtle px-3 py-1.5 text-caption text-text-muted transition hover:border-border-strong hover:bg-bg-muted hover:text-text-secondary"
          aria-label="Search"
        >
          <Search size={14} />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="ml-auto hidden rounded border border-border-default bg-bg-base px-1.5 py-0.5 text-micro text-text-muted sm:inline">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right column — action group, right-aligned */}
      <div data-tauri-drag-region className="flex items-center justify-end gap-1">
        <ActionButton
          icon={theme === 'light' ? <Sun size={16} /> : <Moon size={16} />}
          aria-label="Theme"
          onClick={switchTheme}
        />

        <ActionButton
          icon={inspectorOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          aria-label={inspectorOpen ? 'Close inspector panel' : 'Open inspector panel'}
          aria-pressed={inspectorOpen}
          title={inspectorOpen ? 'Close inspector' : 'Open inspector'}
          variant={inspectorOpen ? 'active' : 'default'}
          onClick={toggleInspector}
        />

        <div className="relative" ref={dropdownRef}>
          <ActionButton
            icon={<Ellipsis size={16} />}
            aria-label="More options"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
          />
          {isDropdownOpen && (
            <div className="absolute right-0 mt-1 w-44 overflow-hidden rounded-xl border border-border-default bg-bg-base shadow-lg">
              <button
                type="button"
                onClick={() => setIsDropdownOpen(false)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-body text-text-secondary transition hover:bg-bg-hover"
              >
                <span>Help</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
