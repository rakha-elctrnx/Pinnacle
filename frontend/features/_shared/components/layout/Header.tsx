import {
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  Database,
  Ellipsis,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  Sun,
} from 'lucide-react'
import { useTheme } from '../../../../app/theme'
import { useShellLayout } from '../../store/shellLayoutStore'
import { useConnectionStore } from '../../store/connectionStore'
import { getConnectionDefaultRoute } from '../../utils'
import { filterConnections } from '../../connection-management/service'
import type { ConnectionType } from '../../types/domain'
import { ActionButton } from '../ui/ActionButton'

interface SearchMenuItem {
  label: string
  icon: ReactNode
  onSelect: () => void
}

export function Header() {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isWindowFocused, setIsWindowFocused] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const { theme, switchTheme } = useTheme()
  const inspectorOpen = useShellLayout((s) => s.inspectorOpen)
  const toggleInspector = useShellLayout((s) => s.toggleInspector)
  const navigate = useNavigate()
  const connections = useConnectionStore((s) => s.items)

  // Local filter state for the search dropdown's connection list.
  const [query, setQuery] = useState('')
  const filteredConnections = useMemo(
    () => filterConnections(connections, query),
    [connections, query],
  )

  const closeSearchMenu = () => {
    setIsSearchOpen(false)
    setQuery('')
  }

  const handleConnectionSelect = (id: string, type: ConnectionType) => {
    navigate(getConnectionDefaultRoute(type, id))
    closeSearchMenu()
  }

  const searchMenuItems: SearchMenuItem[] = [
    {
      label: 'New connection',
      icon: <Plus size={15} />,
      onSelect: () => {
        navigate('/new-connection')
        closeSearchMenu()
      },
    },
  ]

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

        unlistenFocusChange = await currentWindow.onFocusChanged(
          ({ payload }) => {
            setIsWindowFocused(payload)
          },
        )

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

  // Global Cmd/Ctrl+K toggles the search dropdown (the kbd hint is now live).
  useEffect(() => {
    const onHotkey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsSearchOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', onHotkey)
    return () => document.removeEventListener('keydown', onHotkey)
  }, [])

  // Close the search dropdown on Escape or outside click.
  useEffect(() => {
    if (!isSearchOpen) return

    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeSearchMenu()
      }
    }
    const onClick = (e: globalThis.MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        closeSearchMenu()
      }
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [isSearchOpen])

  return (
    <header
      data-tauri-drag-region
      className="relative grid h-10 grid-cols-[minmax(5rem,1fr)_minmax(16rem,28rem)_minmax(5rem,1fr)] items-center gap-3 px-3 pb-2"
    >
      {/* Left column — reserved for macOS window buttons & drag region */}
      <div
        data-tauri-drag-region
        className="flex h-full items-center justify-start"
      >
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
      <div
        ref={searchRef}
        className="relative flex min-w-0 items-center justify-center"
      >
        <button
          type="button"
          onClick={() => setIsSearchOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={isSearchOpen}
          aria-label="Search"
          className="flex w-full items-center gap-2 rounded-lg border border-border-default bg-bg-subtle px-3 py-1.5 text-caption text-text-muted transition hover:border-border-strong hover:bg-bg-muted hover:text-text-secondary"
        >
          <Search size={14} />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="ml-auto hidden rounded border border-border-default bg-bg-base px-1.5 py-0.5 text-micro text-text-muted sm:inline">
            ⌘K
          </kbd>
        </button>

        {isSearchOpen && (
          <div
            role="menu"
            aria-label="Search connections"
            className="absolute left-1/2 top-full z-50 mt-1.5 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border-default bg-bg-base shadow-lg"
          >
            <div className="flex items-center gap-2 border-b border-border-default px-2.5">
              <Search size={13} className="shrink-0 text-text-muted" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') {
                    const first = filteredConnections[0]
                    if (first) handleConnectionSelect(first.id, first.type)
                  }
                }}
                placeholder="Search connections…"
                className="h-8 w-full bg-transparent text-caption text-text-primary outline-none placeholder:text-text-muted"
              />
            </div>

            <div className="py-1">
              {searchMenuItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={item.onSelect}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-caption text-text-secondary transition hover:bg-bg-hover"
                >
                  <span className="text-text-muted">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            {connections.length > 0 && (
              <div className="max-h-56 overflow-y-auto border-t border-border-default py-1">
                <div className="px-2.5 pb-2 pt-1 text-micro uppercase tracking-wide text-text-muted">
                  Connections
                </div>
                {filteredConnections.length === 0 ? (
                  <div className="px-2.5 py-1.5 text-caption text-text-muted">
                    No connections found
                  </div>
                ) : (
                  filteredConnections.map((conn) => (
                    <button
                      key={conn.id}
                      type="button"
                      role="menuitem"
                      onClick={() =>
                        handleConnectionSelect(conn.id, conn.type)
                      }
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-caption text-text-secondary transition hover:bg-bg-hover"
                    >
                      <span className="shrink-0 text-text-muted">
                        <Database size={14} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {conn.name}
                      </span>
                      <span className="shrink-0 text-micro text-text-muted">
                        {conn.type}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right column — action group, right-aligned */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-end gap-1"
      >
        <ActionButton
          icon={theme === 'light' ? <Sun size={16} /> : <Moon size={16} />}
          aria-label="Theme"
          onClick={switchTheme}
        />

        <ActionButton
          icon={
            inspectorOpen ? (
              <PanelRightClose size={16} />
            ) : (
              <PanelRightOpen size={16} />
            )
          }
          aria-label={
            inspectorOpen ? 'Close inspector panel' : 'Open inspector panel'
          }
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
