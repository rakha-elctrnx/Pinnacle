import { useMemo } from 'react'
import { DataExplorerContextProvider, useDataExplorerContext } from '../context/DataExplorerContext'
import { useDataExplorerOrchestrator } from '../hooks/useDataExplorerOrchestrator'
import { useShellLayout } from '../store/shellLayoutStore'
import { useDesignerStore } from '../../sql/store/designerStore'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { PageWorkspace } from '../components/PageWorkspace'
import { ConnectionSidebar } from '../components/ConnectionSidebar'
import { InspectorPanel } from '../components/InspectorPanel'
import { ConnectionWizardModal } from '../components/ConnectionWizardModal'
import { ContextMenu } from '../components/ContextMenu'
import { getConnPayload, isSqlConnectionType } from '../utils'

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
      <DataExplorerLayoutChrome
        sidebarWidth={sidebarWidth}
        inspectorOpen={inspectorOpen}
        inspectorWidth={inspectorWidth}
      />
    </DataExplorerContextProvider>
  )
}

/**
 * DataExplorerLayoutChrome — inner layout body that consumes the orchestrator
 * context and mounts the global modals. Extracted so it can call
 * `useDataExplorerContext()` from inside the provider mounted by
 * `DataExplorerLayout`.
 *
 * Global modals mounted here (per ADR
 * `docs/decisions/adr-20260619-modular-folder-structure.md`, Gap 2):
 *   - `ConnectionWizardModal` — add/edit connection; triggered from header,
 *     sidebar, and page-level actions. Owning it at the layout level keeps the
 *     wizard reachable even when no page is selected.
 *   - `ContextMenu` — right-click on a connection or table node in the
 *     sidebar. Owning it at the layout level keeps the menu reachable from
 *     any region.
 *
 * Page-level modals (TableDesigner, DeleteTable, ExportData, DataOperation)
 * remain mounted by `DataExplorerPage` because they only make sense when a
 * workspace is active.
 */
function DataExplorerLayoutChrome({
  sidebarWidth,
  inspectorOpen,
  inspectorWidth,
}: {
  sidebarWidth: number
  inspectorOpen: boolean
  inspectorWidth: number
}) {
  const {
    items,
    selectedConnection,
    editingId,
    contextMenu,
    contextMenuRef,
    isAddModalOpen,
    queryExecution,
    explorerData,
    handleOpenEditModal,
    handleRefreshConnection,
    handleCloseConnection,
    handleDuplicateConnection,
    handleExportConnection,
    handleDeleteConnection,
    handleSaveConnection,
    handleCloseAddModal,
    setContextMenu,
    handleRequestDeleteTableFromMenu,
    handleRequestDataOperationFromMenu,
    handleRequestExportFromMenu,
  } = useDataExplorerContext()

  // Derive unique existing groups from all connection profiles for the
  // wizard's group dropdown. Mirrors the derivation that previously lived
  // in DataExplorerPage; kept local to this component because no other
  // layout region needs it.
  const existingGroups = useMemo(
    () => [...new Set(items.map((p) => p.tags[0]).filter(Boolean))].sort(),
    [items],
  )

  // Designer store — used by `ContextMenu`'s "Design Table" action. Mirrors
  // the page's local `handleOpenDesignerForEdit` so the menu can stay at the
  // layout level. Lifting this helper into the orchestrator is intentionally
  // deferred to a follow-up task to keep PREP scope minimal.
  const loadAndOpenForEdit = useDesignerStore((s) => s.loadAndOpenForEdit)

  const handleOpenDesignerForEdit = async (tableName: string) => {
    if (!selectedConnection || !isSqlConnectionType(selectedConnection.type)) return
    const databaseName = queryExecution.queryDatabase || explorerData.selectedDatabase || selectedConnection.database
    const schemaName =
      selectedConnection.type === 'postgresql'
        ? queryExecution.querySchema || explorerData.selectedSchema || 'public'
        : databaseName ?? ''
    const payload = { ...getConnPayload(selectedConnection), database: databaseName ?? '' }
    await loadAndOpenForEdit(payload, tableName, databaseName ?? '', schemaName)
  }

  return (
    <>
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

      {/* Global modals — mounted at the layout level so they remain
          reachable from any region (header, sidebar, page). See
          docs/decisions/adr-20260619-modular-folder-structure.md (Gap 2). */}

      {contextMenu && (
        <div ref={contextMenuRef}>
          <ContextMenu
            state={contextMenu}
            onEdit={handleOpenEditModal}
            onRefresh={handleRefreshConnection}
            onCloseConnection={handleCloseConnection}
            onDuplicate={handleDuplicateConnection}
            onExport={handleExportConnection}
            onDelete={handleDeleteConnection}
            onDesignTable={handleOpenDesignerForEdit}
            onDeleteTable={(connectionId, tableName) => {
              handleRequestDeleteTableFromMenu(connectionId, tableName)
            }}
            onEmptyTable={(connectionId, tableName) => {
              handleRequestDataOperationFromMenu(connectionId, tableName, 'empty')
            }}
            onTruncateTable={(connectionId, tableName) => {
              handleRequestDataOperationFromMenu(connectionId, tableName, 'truncate')
            }}
            onExportTable={(connectionId, tableName) => {
              handleRequestExportFromMenu(connectionId, tableName)
            }}
            onClose={() => setContextMenu(null)}
          />
        </div>
      )}

      {isAddModalOpen && (
        <ConnectionWizardModal
          editingId={editingId}
          existingProfile={editingId ? items.find((p) => p.id === editingId) ?? null : null}
          existingGroups={existingGroups}
          onSave={handleSaveConnection}
          onClose={handleCloseAddModal}
        />
      )}
    </>
  )
}
