import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Download, Eraser, FileDown, Pencil, RefreshCw, Scissors, TableProperties, Trash2, Unplug } from 'lucide-react'
import { DataExplorerContextProvider, useDataExplorerContext } from '../context/DataExplorerContext'
import { useDataExplorerOrchestrator } from '../hooks/useDataExplorerOrchestrator'
import { useTabStore } from '../store/tabStore'
import { useShellLayout } from '../store/shellLayoutStore'
import { openDesignerWindow } from '../../sql/services/designerWindowService'
import { Header } from '../components/layout/Header'
import { Footer } from '../components/layout/Footer'
import { PageWorkspace } from '../components/layout/PageWorkspace'
import { ConnectionSidebar } from '../components/layout/ConnectionSidebar'
import { InspectorPanel } from '../components/layout/InspectorPanel'
import { GenericContextMenu, type ContextMenuItem } from '../components/ui/ContextMenu'
import { DeleteConnectionModal } from '../components/modals/DeleteConnectionModal'
import { getConnPayloadWithPassword, isSqlConnectionType } from '../utils'
import { openNewConnectionWindow } from '../services/newConnectionWindowService'

/**
 * ResizeHandle — a thin draggable divider between two panels.
 *
 * Calls `onResize(delta)` on drag where `delta` is the signed pixel
 * change (positive = dragged right / down). The parent decides which
 * panel to grow/shrink. Cursor and hover states are handled internally;
 * a document-level `mousemove`/`mouseup` pair tracks the drag so
 * pointer capture works even outside the handle.
 */
function ResizeHandle({
  onResize,
  direction = 'horizontal',
}: {
  onResize: (delta: number) => void
  direction?: 'horizontal' | 'vertical'
}) {
  const draggingRef = useRef(false)
  const onResizeRef = useRef(onResize)
  onResizeRef.current = onResize

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      e.preventDefault()
      const delta = direction === 'horizontal' ? e.movementX : e.movementY
      onResizeRef.current(delta)
    }
    const handleUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [direction])

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <div
      role="separator"
      aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
      tabIndex={-1}
      onMouseDown={handleMouseDown}
      className={[
        'shrink-0 group/handle flex items-center justify-center',
        direction === 'horizontal' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'rounded-full bg-border-default/40 transition-all duration-150',
          'group-hover/handle:bg-primary/50',
          direction === 'horizontal' ? 'h-8 w-0.5 group-hover/handle:w-1' : 'w-8 h-0.5 group-hover/handle:h-1',
        ].join(' ')}
      />
    </div>
  )
}

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

  const sidebarWidth = useShellLayout((s) => s.sidebarWidth)
  const inspectorOpen = useShellLayout((s) => s.inspectorOpen)
  const inspectorWidth = useShellLayout((s) => s.inspectorWidth)
  const setSidebarWidth = useShellLayout((s) => s.setSidebarWidth)
  const setInspectorWidth = useShellLayout((s) => s.setInspectorWidth)

  const handleSidebarResize = useCallback(
    (delta: number) => {
      const current = useShellLayout.getState().sidebarWidth
      setSidebarWidth(Math.max(180, Math.min(500, current + delta)))
    },
    [setSidebarWidth],
  )
  const handleInspectorResize = useCallback(
    (delta: number) => {
      const current = useShellLayout.getState().inspectorWidth
      setInspectorWidth(Math.max(200, Math.min(600, current - delta)))
    },
    [setInspectorWidth],
  )

  return (
    <DataExplorerContextProvider value={orchestrator}>
      <DataExplorerLayoutChrome
        sidebarWidth={sidebarWidth}
        inspectorOpen={inspectorOpen}
        inspectorWidth={inspectorWidth}
        onSidebarResize={handleSidebarResize}
        onInspectorResize={handleInspectorResize}
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
 *   - `ConnectionFormModal` — add/edit connection; triggered from header,
 *     sidebar, and page-level actions. Owning it at the layout level keeps the
 *     new connection form reachable even when no page is selected.
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
  onSidebarResize,
  onInspectorResize,
}: {
  sidebarWidth: number
  inspectorOpen: boolean
  inspectorWidth: number
  onSidebarResize: (delta: number) => void
  onInspectorResize: (delta: number) => void
}) {
  const navigate = useNavigate()

  const {
    items,
    selectedConnection,
    contextMenu,
    contextMenuRef,
    isAddModalOpen,
    connectionModalNonce,
    editingId,
    queryExecution,
    explorerData,
    handleOpenEditModal,
    handleRefreshConnection,
    handleCloseConnection: handleCloseConnectionRaw,
    handleDuplicateConnection,
    handleExportConnection,
    handleDeleteConnection,
    deleteConnectionTarget,
    handleConfirmDeleteConnection,
    handleCloseDeleteConnectionModal,
    handleSaveConnection,
    handleCloseAddModal,
    setContextMenu,
    handleRequestDeleteTableFromMenu,
    handleRequestDataOperationFromMenu,
    handleRequestExportFromMenu,
  } = useDataExplorerContext()

  const handleCloseConnection = useCallback((itemId: string) => {
    handleCloseConnectionRaw(itemId)

    // Navigate to the new active tab's route, or '/' if no tabs remain.
    const { activeTabId, tabs } = useTabStore.getState()
    const nextTab = activeTabId ? tabs.find((t) => t.id === activeTabId) : null
    navigate(nextTab?.route ?? '/')
  }, [handleCloseConnectionRaw, navigate])

  // Derive existingGroups for new connection dropdown
  const existingGroups = useMemo(
    () => [...new Set(items.map((p) => p.tags[0]).filter(Boolean))].sort(),
    [items],
  )

  // Use refs for callback + payload data so the effect only re-runs on
  // explicit open actions (isAddModalOpen / connectionModalNonce) rather
  // than on every orchestrator re-render.
  const handleSaveRef = useRef(handleSaveConnection)
  const handleCloseRef = useRef(handleCloseAddModal)
  const itemsRef = useRef(items)
  const editingIdRef = useRef(editingId)
  const existingGroupsRef = useRef(existingGroups)

  // Track whether the connection window is currently open so the effect
  // can guard against duplicate opens and always run its cleanup.
  const windowOpenRef = useRef(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  // Sync refs after every render so the window-open effect always uses
  // fresh values without being listed as effect dependencies.
  useEffect(() => {
    handleSaveRef.current = handleSaveConnection
    handleCloseRef.current = handleCloseAddModal
    itemsRef.current = items
    editingIdRef.current = editingId
    existingGroupsRef.current = existingGroups
  })

  // New connection window bridge — opens native OS window when modal state changes.
  // Uses a ref-based guard so the window is only opened once per action, and a
  // synchronous cleanup ref so previous listeners are always torn down before
  // new ones are registered (avoids the async `.then()` race condition).
  useEffect(() => {
    if (!isAddModalOpen) return
    if (windowOpenRef.current) return
    windowOpenRef.current = true

    // Tear down any lingering listeners from a previous invocation before
    // opening the window again.
    cleanupRef.current?.()
    cleanupRef.current = null

    const currentEditingId = editingIdRef.current
    const currentItems = itemsRef.current
    const existingProfile = currentEditingId
      ? currentItems.find((p) => p.id === currentEditingId) ?? null
      : null

    const resetWindow = () => {
      windowOpenRef.current = false
      cleanupRef.current = null
    }

    openNewConnectionWindow(
      {
        editingId: currentEditingId,
        existingProfile,
        existingGroups: existingGroupsRef.current,
        theme: (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light',
      },
      (profile, password) => {
        resetWindow()
        handleSaveRef.current(profile, password)
        handleCloseRef.current()
      },
      () => {
        resetWindow()
        handleCloseRef.current()
      },
    ).then((fn) => {
      // Only store cleanup if we're still the active open session —
      // a fast re-open may have already moved on.
      if (windowOpenRef.current) {
        cleanupRef.current = fn
      } else {
        fn()
      }
    })

    return () => {
      cleanupRef.current?.()
      resetWindow()
    }
  }, [isAddModalOpen, connectionModalNonce])
  const handleOpenDesignerForEdit = async (tableName: string) => {
    if (!selectedConnection || !isSqlConnectionType(selectedConnection.type)) return
    const databaseName = queryExecution.queryDatabase || explorerData.selectedDatabase || selectedConnection.database
    const schemaName =
      selectedConnection.type === 'postgresql'
        ? queryExecution.querySchema || explorerData.selectedSchema || 'public'
        : databaseName ?? ''
    const payload = { ...(await getConnPayloadWithPassword(selectedConnection)), database: databaseName ?? '' }
    await openDesignerWindow(
      { mode: 'edit', schema: schemaName, database: databaseName ?? '', connectionPayload: payload, tableName },
    )
  }

  return (
    <>
      <div
        className="flex h-screen flex-col text-text-primary p-2"
        style={{
          background: `linear-gradient(180deg, color-mix(in srgb, var(--color-bg-subtle) 60%, var(--color-bg-base)) 0%, var(--color-bg-subtle) 20%, var(--color-bg-subtle) 80%, color-mix(in srgb, var(--color-bg-subtle) 90%, var(--color-primary)) 100%)`,
        }}
      >
        <Header />

        {/* Body: persistent ConnectionSidebar + PageWorkspace + Inspector overlay */}
        <div className="relative flex flex-1 min-h-0 overflow-hidden">
          {/* Connection sidebar — always visible, fixed-width column */}
          <aside
            style={{ width: sidebarWidth }}
            className="shrink-0 overflow-hidden border border-border-default bg-bg-base rounded-2xl"
          >
            <ConnectionSidebar />
          </aside>

          <ResizeHandle onResize={onSidebarResize} />

          {/* Central page workspace — fills remaining space and is the
              scroll container for routed pages. */}
          <div className="flex-1 min-w-0 h-full overflow-hidden rounded-2xl border border-border-default bg-bg-base">
          <PageWorkspace />
          </div>

          {inspectorOpen && <ResizeHandle onResize={onInspectorResize} />}

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
              'h-full overflow-hidden border border-border-default bg-bg-base rounded-2xl',
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
          <GenericContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            ariaLabel="Connection tree context menu"
            items={[
              // ── Table-specific actions ──────────────────────────
              ...(contextMenu.tableName
                ? [
                    ...(handleOpenDesignerForEdit
                      ? [{ label: 'Design Table', icon: <TableProperties size={14} />, action: () => { handleOpenDesignerForEdit(contextMenu.tableName!) } } as ContextMenuItem]
                      : []),
                    ...(handleRequestDataOperationFromMenu
                      ? [{ label: 'Empty Table', icon: <Eraser size={14} />, action: () => { handleRequestDataOperationFromMenu(contextMenu.itemId, contextMenu.tableName!, 'empty') } } as ContextMenuItem]
                      : []),
                    ...(handleRequestDataOperationFromMenu
                      ? [{ label: 'Truncate Table', icon: <Scissors size={14} />, action: () => { handleRequestDataOperationFromMenu(contextMenu.itemId, contextMenu.tableName!, 'truncate') } } as ContextMenuItem]
                      : []),
                    ...(handleRequestExportFromMenu
                      ? [{ label: 'Export Data', icon: <FileDown size={14} />, action: () => { handleRequestExportFromMenu(contextMenu.itemId, contextMenu.tableName!) } } as ContextMenuItem]
                      : []),
                    ...(handleRequestDeleteTableFromMenu
                      ? [{ label: 'Delete Table', icon: <Trash2 size={14} />, action: () => { handleRequestDeleteTableFromMenu(contextMenu.itemId, contextMenu.tableName!) }, dangerous: true } as ContextMenuItem]
                      : []),
                    { divider: true } as ContextMenuItem,
                  ]
                : [
                    // ── Connection-level actions ──────────────────
                    { label: 'Rename / Edit', icon: <Pencil size={14} />, action: () => { handleOpenEditModal(contextMenu.itemId) } },
                    ...(handleOpenDesignerForEdit
                      ? [{ label: 'Edit Structure', icon: <TableProperties size={14} />, action: () => { handleOpenDesignerForEdit(contextMenu.itemId) } } as ContextMenuItem]
                      : []),
                  ]),
              // ── Common actions ───────────────────────────────
              { label: 'Refresh', icon: <RefreshCw size={14} />, action: () => { handleRefreshConnection(contextMenu.itemId) } },
              // ── Connection-only extra actions ─────────────────
              ...(!contextMenu.tableName
                ? [
                    { label: 'Duplicate', icon: <Copy size={14} />, action: () => { handleDuplicateConnection(contextMenu.itemId) } },
                    { label: 'Export Configuration', icon: <Download size={14} />, action: () => { handleExportConnection(contextMenu.itemId) } },
                    { divider: true } as ContextMenuItem,
                    { label: 'Close Connection', icon: <Unplug size={14} />, action: () => { handleCloseConnection(contextMenu.itemId) } },
                    { label: 'Delete', icon: <Trash2 size={14} />, action: () => { handleDeleteConnection(contextMenu.itemId) }, dangerous: true } as ContextMenuItem,
                  ]
                : []),
            ]}
            onClose={() => setContextMenu(null)}
          />
        </div>
      )}

      {deleteConnectionTarget && (
        <DeleteConnectionModal
          connectionId={deleteConnectionTarget.id}
          connectionName={deleteConnectionTarget.name}
          onDelete={handleConfirmDeleteConnection}
          onClose={handleCloseDeleteConnectionModal}
        />
      )}

    </>
  )
}

