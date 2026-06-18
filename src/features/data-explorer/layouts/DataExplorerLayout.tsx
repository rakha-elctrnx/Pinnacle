import { DataExplorerContextProvider } from '../context/DataExplorerContext'
import { useDataExplorerOrchestrator } from '../hooks/useDataExplorerOrchestrator'
import { useShellLayout } from '../../../state/shellLayoutStore'
import { Header } from '../components/layout/Header'
import { Footer } from '../components/layout/Footer'
import { PageWorkspace } from '../components/layout/PageWorkspace'
import { ConnectionSidebar } from '../components/ConnectionSidebar'
import { InspectorPanel } from '../components/layout/InspectorPanel'

/**
 * DataExplorerLayout — the single application-level shell for Pinnacle.
 *
 * Implements the five-region layout defined in
 * `adr-20260617-five-region-app-shell-layout.md`:
 *
 *   1. Header              — persistent top bar (logo, search, theme, inspector toggle)
 *   2. ConnectionSidebar   — persistent left panel (resource tree)
 *   3. PageWorkspace       — central flex region hosting the router outlet
 *   4. InspectorPanel      — overlay right panel (empty placeholder, manually toggled)
 *   5. Footer              — status bar beneath the workspace
 *
 * The orchestrator context is mounted here exactly once so every region
 * pulls the same instance via `useDataExplorerContext`. The
 * `NavigationStrip` was removed in Phase 1 — the connection sidebar
 * is now always visible and route selection is owned by the
 * `DataExplorerPage` workspace body. The Inspector panel is fully
 * user-controlled via the toggle in `Header` (default closed).
 *
 * The inspector wrapper is always mounted and animates its `width`
 * between 0 and the configured `inspectorWidth` so the open/close
 * transition is smooth. `inert` + `aria-hidden` keep the collapsed
 * panel out of the tab order and accessibility tree, and the panel's
 * internal state (scroll position, etc.) is preserved across toggles.
 */
export function DataExplorerLayout() {
  // Single orchestrator instance for the whole app shell.
  const orchestrator = useDataExplorerOrchestrator()

  // Shell layout state — sidebar width + inspector visibility.
  const sidebarWidth = useShellLayout((s) => s.sidebarWidth)
  const inspectorOpen = useShellLayout((s) => s.inspectorOpen)
  const inspectorWidth = useShellLayout((s) => s.inspectorWidth)

  return (
    <DataExplorerContextProvider value={orchestrator}>
      <div className="flex h-screen flex-col bg-gray-200 dark:bg-gray-800 text-on-surface p-2">
        <Header />

        {/* Body: persistent ConnectionSidebar + PageWorkspace + Inspector overlay */}
        <div className="relative flex flex-1 min-h-0 overflow-hidden gap-1">
          {/* Connection sidebar — always visible, fixed-width column */}
          <aside
            style={{ width: sidebarWidth }}
            className="shrink-0 overflow-hidden border border-outline-variant bg-surface rounded-2xl"
          >
            <ConnectionSidebar />
          </aside>

          {/* Central page workspace — fills remaining space and is the
              scroll container for routed pages. */}
          <div className="flex-1 min-w-0 h-full overflow-hidden rounded-2xl border border-outline-variant bg-surface">
          <PageWorkspace />
          </div>

          {/* Inspector overlay (anchored to the right).
              Always mounted so the wrapper can smoothly animate its
              width between 0 and `inspectorWidth`. `overflow-hidden`
              clips the panel content while it collapses, and
              `inert` + `aria-hidden` make the collapsed panel
              non-interactive and remove it from the accessibility
              tree. */}
          <aside
            aria-hidden={!inspectorOpen}
            inert={!inspectorOpen}
            style={{ width: inspectorOpen ? inspectorWidth : 0 }}
            className={[
              'h-full overflow-hidden border border-outline-variant bg-surface rounded-2xl',
              'transition-[width] duration-300 ease-in-out',
              inspectorOpen ? 'border' : 'border-none',
            ].join(' ')}
          >
            <InspectorPanel />
          </aside>
        </div>

        <Footer />
      </div>
    </DataExplorerContextProvider>
  )
}
