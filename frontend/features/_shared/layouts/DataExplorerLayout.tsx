import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Braces,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  Copy,
  Database,
  Eraser,
  Folder,
  FolderPlus,
  Network,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Scissors,
  FileDown,
  FileText,
  SquareTerminal,
  TableProperties,
  Trash2,
  Unplug,
} from 'lucide-react'
import {
  DataExplorerContextProvider,
  useDataExplorerContext,
} from '../context/DataExplorerContext'
import { useDataExplorerOrchestrator } from '../hooks/useDataExplorerOrchestrator'
import { useTabStore } from '../store/tabStore'
import { useShellLayout } from '../store/shellLayoutStore'
import { openDesignerWindow } from '../../sql/services/designerWindowService'
import { Header } from '../components/layout/Header'
import { Footer } from '../components/layout/Footer'
import { PageWorkspace } from '../components/layout/PageWorkspace'
import { ConnectionSidebar } from '../components/layout/ConnectionSidebar'
import { InspectorPanel } from '../components/layout/InspectorPanel'
import {
  GenericContextMenu,
  type ContextMenuItem,
} from '../components/ui/ContextMenu'
import { CreateDatabaseModal } from '../../sql/components/shared/CreateDatabaseModal'
import { DeleteTableModal } from '../../sql/components/shared/DeleteTableModal'
import { DataOperationModal } from '../../sql/components/export/DataOperationModal'
import { ExportDataModal } from '../../sql/components/export/ExportDataModal'
import { executeSql } from '../../sql/clients/sql'
import { ConnectionFormModal } from '../components/modals/ConnectionFormModal'
import { DeleteConnectionModal } from '../components/modals/DeleteConnectionModal'
import { getConnPayloadWithPassword, isSqlConnectionType } from '../utils'
import {
  qualifyIdentifierForEngine,
  quoteIdentifierForEngine,
} from '../../sql/logic/sqlIdentifier'
import { buildPath, encodePathSegment } from '../utils/treeNavigation'

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

  useEffect(() => {
    onResizeRef.current = onResize
  }, [onResize])

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
    document.body.style.cursor =
      direction === 'horizontal' ? 'col-resize' : 'row-resize'
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
        direction === 'horizontal'
          ? 'w-1 cursor-col-resize'
          : 'h-1 cursor-row-resize',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'rounded-full bg-border-default/40 transition-all duration-150',
          'group-hover/handle:bg-primary/50',
          direction === 'horizontal'
            ? 'h-8 w-0.5 group-hover/handle:w-1'
            : 'w-8 h-0.5 group-hover/handle:h-1',
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

  const sidebarOpen = useShellLayout((s) => s.sidebarOpen)
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
        sidebarOpen={sidebarOpen}
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
  sidebarOpen,
  sidebarWidth,
  inspectorOpen,
  inspectorWidth,
  onSidebarResize,
  onInspectorResize,
}: {
  sidebarOpen: boolean
  sidebarWidth: number
  inspectorOpen: boolean
  inspectorWidth: number
  onSidebarResize: (delta: number) => void
  onInspectorResize: (delta: number) => void
}) {
  const {
    items,
    selectedConnection,
    contextMenu,
    contextMenuRef,
    isAddModalOpen,
    connectionStatuses,
    openCreateConnection,
    editingId,
    queryExecution,
    explorerData,
    expandedTreePaths,
    handleOpenEditModal,
    handleRefreshConnection,
    handleCloseConnection: handleCloseConnectionRaw,
    handleDuplicateConnection,
    handleDeleteConnection,
    createDatabaseTarget,
    handleRequestCreateDatabase,
    handleCloseCreateDatabaseModal,
    deleteConnectionTarget,
    handleConfirmDeleteConnection,
    handleCloseDeleteConnectionModal,
    handleSaveConnection,
    handleCloseAddModal,
    setContextMenu,
    handleConnectionSelectionChange,
    handleToggleTreeNode,
    handleFetchDatabaseDetails,
    handleRequestDeleteTableFromMenu,
    handleRequestDataOperationFromMenu,
    handleRequestExportFromMenu,
    deleteTableTarget,
    handleCloseDeleteTableModal,
    dataOperationTarget,
    handleCloseDataOperationModal,
    exportModalTarget,
    exportEstimate,
    exportJob,
    recentExports,
    handleSubmitExport,
    handleUseRecentExport,
    handleCloseExportModal,
    folders,
    handleCreateFolder,
    handleMoveConnectionToFolder,
  } = useDataExplorerContext()
  const navigate = useNavigate()

  const handleCloseConnection = useCallback(
    (itemId: string) => {
      handleCloseConnectionRaw(itemId)

      // Navigate to the new active tab's route, or '/' if no tabs remain.
      const { activeTabId, tabs } = useTabStore.getState()
      const nextTab = activeTabId
        ? tabs.find((t) => t.id === activeTabId)
        : null
      navigate(nextTab?.route ?? '/')
    },
    [handleCloseConnectionRaw, navigate],
  )

  // Derive existingGroups for new connection dropdown (backward compat)
  const existingGroups = useMemo(
    () => [...new Set(items.map((p) => p.tags[0]).filter(Boolean))].sort(),
    [items],
  )

  // Use refs for callback + payload data so the effect only re-runs on

  const handleNewQueryFromMenu = useCallback(
    (connectionId: string) => {
      const profile = items.find((p) => p.id === connectionId)
      if (!profile) return
      if (selectedConnection?.id !== connectionId) {
        handleConnectionSelectionChange(connectionId)
      }
      const qId = queryExecution.createQueryId()
      const route = `/sql/${connectionId}/query/${qId}`
      useTabStore.getState().openTab({
        id: `${connectionId}:query:${qId}`,
        label: `Query_${qId}`,
        type: profile.type,
        pageType: 'query',
        route,
        connectionId,
      })
      navigate(route)
    },
    [
      items,
      selectedConnection,
      handleConnectionSelectionChange,
      queryExecution,
      navigate,
    ],
  )
  const handleNewDatabaseFromMenu = useCallback(
    (connectionId: string) => {
      handleRequestCreateDatabase(connectionId)
    },
    [handleRequestCreateDatabase],
  )
  const handleNewSchemaFromMenu = useCallback(
    (connectionId: string, databaseName: string) => {
      const profile = items.find((p) => p.id === connectionId)
      if (!profile) return
      if (selectedConnection?.id !== connectionId) {
        handleConnectionSelectionChange(connectionId)
      }
      const qId = queryExecution.createQueryId()
      const route = `/sql/${connectionId}/query/${qId}`
      useTabStore.getState().openTab({
        id: `${connectionId}:query:${qId}`,
        label: `Query_${qId}`,
        type: profile.type,
        pageType: 'query',
        route,
        connectionId,
      })
      queryExecution.setActiveQueryId(qId)
      queryExecution.onQueryDatabaseChange(databaseName)
      queryExecution.updateActiveQuery(
        'CREATE SCHEMA IF NOT EXISTS new_schema;',
      )
      navigate(route)
    },
    [
      items,
      selectedConnection,
      handleConnectionSelectionChange,
      queryExecution,
      navigate,
    ],
  )

  const handleDeleteDatabaseFromMenu = useCallback(
    (connectionId: string, databaseName: string) => {
      const profile = items.find((p) => p.id === connectionId)
      if (!profile) return
      if (selectedConnection?.id !== connectionId) {
        handleConnectionSelectionChange(connectionId)
      }
      const qId = queryExecution.createQueryId()
      const route = `/sql/${connectionId}/query/${qId}`
      useTabStore.getState().openTab({
        id: `${connectionId}:query:${qId}`,
        label: `Query_${qId}`,
        type: profile.type,
        pageType: 'query',
        route,
        connectionId,
      })
      queryExecution.setActiveQueryId(qId)
      queryExecution.onQueryDatabaseChange(databaseName)
      queryExecution.updateActiveQuery(
        `DROP DATABASE IF EXISTS ${quoteIdentifierForEngine(profile.type, databaseName)};`,
      )
      navigate(route)
    },
    [
      items,
      selectedConnection,
      handleConnectionSelectionChange,
      queryExecution,
      navigate,
    ],
  )
  const handleDeleteSchemaFromMenu = useCallback(
    (connectionId: string, databaseName: string, schemaName: string) => {
      const profile = items.find((p) => p.id === connectionId)
      if (!profile) return
      if (selectedConnection?.id !== connectionId) {
        handleConnectionSelectionChange(connectionId)
      }
      const qId = queryExecution.createQueryId()
      const route = `/sql/${connectionId}/query/${qId}`
      useTabStore.getState().openTab({
        id: `${connectionId}:query:${qId}`,
        label: `Query_${qId}`,
        type: profile.type,
        pageType: 'query',
        route,
        connectionId,
      })
      queryExecution.setActiveQueryId(qId)
      queryExecution.onQueryDatabaseChange(databaseName)
      queryExecution.updateActiveQuery(
        `DROP SCHEMA IF EXISTS ${quoteIdentifierForEngine(profile.type, schemaName)} CASCADE;`,
      )
      navigate(route)
    },
    [
      items,
      selectedConnection,
      handleConnectionSelectionChange,
      queryExecution,
      navigate,
    ],
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExecuteSqlFile = useCallback(
    (connectionId: string, databaseName: string) => {
      let input = fileInputRef.current
      if (!input) {
        input = document.createElement('input')
        input.type = 'file'
        input.accept = '.sql,.txt'
        input.style.display = 'none'
        document.body.appendChild(input)
        fileInputRef.current = input
      }
      input.onchange = async () => {
        const file = input?.files?.[0]
        if (!file) return
        const content = await file.text()
        const profile = items.find((p) => p.id === connectionId)
        if (!profile) return
        if (selectedConnection?.id !== connectionId) {
          handleConnectionSelectionChange(connectionId)
        }
        queryExecution.onQueryDatabaseChange(databaseName)
        const qId = queryExecution.createQueryId()
        const route = `/sql/${connectionId}/query/${qId}`
        useTabStore.getState().openTab({
          id: `${connectionId}:query:${qId}`,
          label: `${file.name}`,
          type: profile.type,
          pageType: 'query',
          route,
          connectionId,
        })
        queryExecution.setActiveQueryId(qId)
        queryExecution.updateActiveQuery(content)
        navigate(route)
      }
      input.click()
    },
    [
      items,
      selectedConnection,
      handleConnectionSelectionChange,
      queryExecution,
      navigate,
    ],
  )
  const handleOpenDesignerForEdit = async (
    connectionId: string,
    tableName: string,
  ) => {
    const profile = items.find((p) => p.id === connectionId)
    if (!profile || !isSqlConnectionType(profile.type)) return
    if (selectedConnection?.id !== connectionId) {
      handleConnectionSelectionChange(connectionId)
    }
    const databaseName =
      contextMenu?.databaseName ??
      (queryExecution.queryDatabase ||
        explorerData.selectedDatabase ||
        profile.database)
    const schemaName =
      profile.type === 'postgresql'
        ? (contextMenu?.schemaName ??
          (queryExecution.querySchema ||
            explorerData.selectedSchema ||
            'public'))
        : (databaseName ?? '')
    const payload = {
      ...(await getConnPayloadWithPassword(profile)),
      database: databaseName ?? '',
    }
    await openDesignerWindow({
      mode: 'edit',
      schema: schemaName,
      database: databaseName ?? '',
      connectionPayload: payload,
      tableName,
    })
  }

  // Context-menu identity — always derived from the CLICKED node's itemId,
  // never from the global selectedConnection. Profile + engine capabilities
  // resolve against the clicked connection so a menu opened on a node under a
  // non-active connection hides/disables actions correctly.
  const contextProfile = contextMenu
    ? items.find((p) => p.id === contextMenu.itemId)
    : undefined
  const isConnected = contextMenu
    ? connectionStatuses[contextMenu.itemId] === 'connected'
    : false
  const isSql = contextProfile
    ? isSqlConnectionType(contextProfile.type)
    : false
  const isPg = contextProfile?.type === 'postgresql'
  const isMysql = contextProfile?.type === 'mysql'
  const isSqlite = contextProfile?.type === 'sqlite'
  const isEs = contextProfile?.type === 'elasticsearch'

  // SQL table-operation modal connections — resolve each target's own
  // connection so delete/empty/truncate/export run against the right-clicked
  // node's database/schema regardless of the currently active route.
  const deleteTableConnection = deleteTableTarget
    ? items.find((c) => c.id === deleteTableTarget.connectionId)
    : undefined
  const dataOperationConnection = dataOperationTarget
    ? items.find((c) => c.id === dataOperationTarget.connectionId)
    : undefined
  const exportTargetConnection = exportModalTarget
    ? items.find((c) => c.id === exportModalTarget.connectionId)
    : undefined

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
          {/* Connection sidebar — collapsible left panel.
              Note: Width animation is kept because the central workspace must reflow to fill space. */}
          <aside
            aria-hidden={!sidebarOpen}
            inert={!sidebarOpen}
            style={{
              width: sidebarOpen ? sidebarWidth : 0,
              contain: 'layout paint',
              willChange: 'width',
            }}
            className={[
              'h-full overflow-hidden border bg-bg-base rounded-2xl shrink-0',
              'transition-[width] duration-200 ease-in-out',
              sidebarOpen ? 'border-border-default' : 'border-none',
            ].join(' ')}
          >
            <ConnectionSidebar />
          </aside>

          {sidebarOpen && <ResizeHandle onResize={onSidebarResize} />}

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
              tree.
              Note: Width animation is kept because the central workspace must reflow to fill space. */}
          <aside
            aria-hidden={!inspectorOpen}
            inert={!inspectorOpen}
            style={{
              width: inspectorOpen ? inspectorWidth : 0,
              contain: 'layout paint',
              willChange: 'width',
            }}
            className={[
              'h-full overflow-hidden border border-border-default bg-bg-base rounded-2xl',
              'transition-[width] duration-200 ease-in-out',
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
                    {
                      label: 'New Query',
                      icon: <SquareTerminal size={14} />,
                      action: () => {
                        const connId = contextMenu.itemId
                        const profile = contextProfile
                        if (!profile) return
                        if (selectedConnection?.id !== connId) {
                          handleConnectionSelectionChange(connId)
                        }
                        queryExecution.onQueryDatabaseChange(
                          contextMenu.databaseName ?? '',
                        )
                        const qId = queryExecution.createQueryId()
                        const route = `/sql/${connId}/query/${qId}`
                        const openTab = useTabStore.getState().openTab
                        openTab({
                          id: `${connId}:query:${qId}`,
                          label: `Query_${qId}`,
                          type: profile.type,
                          pageType: 'query',
                          route,
                          connectionId: connId,
                        })
                        const table = contextMenu.tableName
                        if (table) {
                          const schemaSource = isMysql
                            ? contextMenu.databaseName
                            : (contextMenu.schemaName ?? 'public')
                          const effSchemaSource =
                            schemaSource || contextMenu.databaseName
                          queryExecution.setActiveQueryId(qId)
                          queryExecution.updateActiveQuery(
                            `SELECT * FROM ${qualifyIdentifierForEngine(profile.type, effSchemaSource, table)};`,
                          )
                        }
                        navigate(route)
                      },
                      disabled: !isConnected,
                    } as ContextMenuItem,
                    ...(isSql && handleOpenDesignerForEdit
                      ? [
                          {
                            label: 'Design Table',
                            icon: <TableProperties size={14} />,
                            action: () => {
                              handleOpenDesignerForEdit(
                                contextMenu.itemId,
                                contextMenu.tableName!,
                              )
                            },
                          } as ContextMenuItem,
                        ]
                      : []),
                    ...(handleRequestDataOperationFromMenu
                      ? [
                          {
                            label: 'Empty Table',
                            icon: <Eraser size={14} />,
                            action: () => {
                              handleRequestDataOperationFromMenu(
                                contextMenu.itemId,
                                contextMenu.tableName!,
                                'empty',
                                contextMenu.databaseName,
                                contextMenu.schemaName,
                              )
                            },
                            disabled: !isConnected,
                          } as ContextMenuItem,
                        ]
                      : []),
                    ...(handleRequestDataOperationFromMenu
                      ? [
                          {
                            label: 'Truncate Table',
                            icon: <Scissors size={14} />,
                            action: () => {
                              handleRequestDataOperationFromMenu(
                                contextMenu.itemId,
                                contextMenu.tableName!,
                                'truncate',
                                contextMenu.databaseName,
                                contextMenu.schemaName,
                              )
                            },
                            disabled: !isConnected,
                          } as ContextMenuItem,
                        ]
                      : []),
                    ...(handleRequestExportFromMenu
                      ? [
                          {
                            label: 'Export Data',
                            icon: <FileDown size={14} />,
                            action: () => {
                              handleRequestExportFromMenu(
                                contextMenu.itemId,
                                contextMenu.tableName!,
                                contextMenu.databaseName,
                                contextMenu.schemaName,
                              )
                            },
                            disabled: !isConnected,
                          } as ContextMenuItem,
                        ]
                      : []),
                    ...(handleRequestDeleteTableFromMenu
                      ? [
                          {
                            label: 'Delete Table',
                            icon: <Trash2 size={14} />,
                            action: () => {
                              handleRequestDeleteTableFromMenu(
                                contextMenu.itemId,
                                contextMenu.tableName!,
                                contextMenu.databaseName,
                                contextMenu.schemaName,
                              )
                            },
                            dangerous: true,
                            disabled: !isConnected,
                          } as ContextMenuItem,
                        ]
                      : []),
                  ]
                : // ── Tables-category actions (right-click "Tables" node) ──
                  contextMenu.categoryName === 'Tables'
                  ? [
                      {
                        label: 'New Table',
                        icon: <CirclePlus size={14} />,
                        action: async () => {
                          const connId = contextMenu.itemId
                          if (!connId) return
                          const dbName = contextMenu.databaseName!
                          const schemaName = contextMenu.schemaName
                          const profile = contextProfile
                          if (!profile || !isSqlConnectionType(profile.type))
                            return
                          if (selectedConnection?.id !== connId) {
                            handleConnectionSelectionChange(connId)
                          }
                          queryExecution.onQueryDatabaseChange(dbName)
                          if (schemaName && profile.type === 'postgresql') {
                            queryExecution.onQuerySchemaChange(schemaName)
                          }
                          const effDbName = dbName || profile.database
                          const effSchema =
                            profile.type === 'postgresql'
                              ? schemaName || 'public'
                              : (effDbName ?? '')
                          const payload = {
                            ...(await getConnPayloadWithPassword(profile)),
                            database: effDbName ?? '',
                          }
                          await openDesignerWindow({
                            mode: 'create',
                            schema: effSchema,
                            database: effDbName ?? '',
                            connectionPayload: payload,
                          })
                        },
                        disabled: !isConnected,
                      } as ContextMenuItem,
                      {
                        label: 'New Query',
                        icon: <SquareTerminal size={14} />,
                        action: () => {
                          const connId = contextMenu.itemId
                          const dbName = contextMenu.databaseName!
                          const profile = contextProfile
                          if (!profile) return
                          if (selectedConnection?.id !== connId) {
                            handleConnectionSelectionChange(connId)
                          }
                          queryExecution.onQueryDatabaseChange(dbName)
                          const qId = queryExecution.createQueryId()
                          const route = `/sql/${connId}/query/${qId}`
                          useTabStore.getState().openTab({
                            id: `${connId}:query:${qId}`,
                            label: `Query_${qId}`,
                            type: profile.type,
                            pageType: 'query',
                            route,
                            connectionId: connId,
                          })
                          navigate(route)
                        },
                        disabled: !isConnected,
                      } as ContextMenuItem,
                      {
                        label: 'View ER Diagram',
                        icon: <Network size={14} />,
                        action: () => {
                          const connId = contextMenu.itemId
                          if (!connId) return
                          const profile = contextProfile
                          if (!profile) return
                          const tabId = `${connId}:tables`
                          const tabStore = useTabStore.getState()
                          const existing = tabStore.tabs.some(
                            (t) => t.id === tabId,
                          )
                          if (existing) {
                            tabStore.activateTab(tabId)
                          } else {
                            const route = `/sql/${connId}/tables`
                            tabStore.openTab({
                              id: tabId,
                              label: 'Tables',
                              type: profile.type,
                              pageType: 'table',
                              route,
                              connectionId: connId,
                            })
                            navigate(route)
                          }
                        },
                      } as ContextMenuItem,
                      { divider: true } as ContextMenuItem,
                      {
                        label: 'Refresh',
                        icon: <RefreshCw size={14} />,
                        action: () => {
                          handleRefreshConnection(contextMenu.itemId)
                        },
                      } as ContextMenuItem,
                    ]
                  : // ── Views-category actions (right-click "Views" node) ──
                    contextMenu.categoryName === 'Views'
                    ? [
                        {
                          label: 'New Query',
                          icon: <SquareTerminal size={14} />,
                          action: () => {
                            const connId = contextMenu.itemId
                            const dbName = contextMenu.databaseName!
                            const profile = contextProfile
                            if (!profile) return
                            if (selectedConnection?.id !== connId) {
                              handleConnectionSelectionChange(connId)
                            }
                            queryExecution.onQueryDatabaseChange(dbName)
                            const qId = queryExecution.createQueryId()
                            const route = `/sql/${connId}/query/${qId}`
                            useTabStore.getState().openTab({
                              id: `${connId}:query:${qId}`,
                              label: `Query_${qId}`,
                              type: profile.type,
                              pageType: 'query',
                              route,
                              connectionId: connId,
                            })
                            navigate(route)
                          },
                          disabled: !isConnected,
                        } as ContextMenuItem,
                        { divider: true } as ContextMenuItem,
                        {
                          label: 'Refresh',
                          icon: <RefreshCw size={14} />,
                          action: () => {
                            handleRefreshConnection(contextMenu.itemId)
                          },
                        } as ContextMenuItem,
                      ]
                    : // ── Database-level actions ───────────────────────
                      contextMenu.databaseName &&
                        !contextMenu.schemaName &&
                        !contextMenu.viewName &&
                        !contextMenu.indexName
                      ? [
                          // ── Open/Close Database toggle ───────────────
                          ...(() => {
                            const profile = items.find(
                              (p) => p.id === contextMenu.itemId,
                            )
                            const connName = profile?.name ?? ''
                            const connFolder =
                              connName && profile?.folderId
                                ? folders.find((f) => f.id === profile.folderId)
                                : undefined
                            const basePath = connFolder
                              ? buildPath(connFolder.name, connName)
                              : encodePathSegment(connName)
                            const dbPath = basePath
                              ? buildPath(basePath, contextMenu.databaseName)
                              : ''
                            const isOpen = dbPath
                              ? expandedTreePaths.includes(dbPath)
                              : false
                            return isOpen
                              ? [
                                  {
                                    label: 'Close Database',
                                    icon: <ChevronDown size={14} />,
                                    action: () => {
                                      if (dbPath) handleToggleTreeNode(dbPath)
                                    },
                                  } as ContextMenuItem,
                                ]
                              : [
                                  {
                                    label: 'Open Database',
                                    icon: <ChevronRight size={14} />,
                                    action: () => {
                                      if (dbPath) {
                                        handleToggleTreeNode(dbPath)
                                        handleFetchDatabaseDetails(
                                          contextMenu.databaseName!,
                                          contextMenu.itemId,
                                        )
                                      }
                                    },
                                  } as ContextMenuItem,
                                ]
                          })(),
                          {
                            label: 'Edit Connection',
                            icon: <Pencil size={14} />,
                            action: () => {
                              handleOpenEditModal(contextMenu.itemId)
                            },
                          },
                          ...(!isSqlite
                            ? [
                                {
                                  label: 'New Database',
                                  icon: <Database size={14} />,
                                  action: () =>
                                    handleNewDatabaseFromMenu(
                                      contextMenu.itemId,
                                    ),
                                } as ContextMenuItem,
                              ]
                            : []),
                          ...(!isSqlite
                            ? [
                                {
                                  label: 'Delete Database',
                                  icon: <Trash2 size={14} />,
                                  action: () =>
                                    handleDeleteDatabaseFromMenu(
                                      contextMenu.itemId,
                                      contextMenu.databaseName!,
                                    ),
                                  dangerous: true,
                                } as ContextMenuItem,
                              ]
                            : []),
                          { divider: true } as ContextMenuItem,
                          ...(isPg
                            ? [
                                {
                                  label: 'New Schema',
                                  icon: <Plus size={14} />,
                                  action: () =>
                                    handleNewSchemaFromMenu(
                                      contextMenu.itemId,
                                      contextMenu.databaseName!,
                                    ),
                                  disabled: !isConnected,
                                } as ContextMenuItem,
                              ]
                            : []),
                          {
                            label: 'New Query',
                            icon: <SquareTerminal size={14} />,
                            action: () => {
                              const connId = contextMenu.itemId
                              const dbName = contextMenu.databaseName!
                              const profile = contextProfile
                              if (!profile) return
                              if (selectedConnection?.id !== connId) {
                                handleConnectionSelectionChange(connId)
                              }
                              queryExecution.onQueryDatabaseChange(dbName)
                              const qId = queryExecution.createQueryId()
                              const route = `/sql/${connId}/query/${qId}`
                              useTabStore.getState().openTab({
                                id: `${connId}:query:${qId}`,
                                label: `Query_${qId}`,
                                type: profile.type,
                                pageType: 'query',
                                route,
                                connectionId: connId,
                              })
                              navigate(route)
                            },
                            disabled: !isConnected,
                          } as ContextMenuItem,
                          { divider: true } as ContextMenuItem,
                          {
                            label: 'Refresh',
                            icon: <RefreshCw size={14} />,
                            action: () => {
                              handleRefreshConnection(contextMenu.itemId)
                            },
                          } as ContextMenuItem,
                        ]
                      : // ── Schema-level actions ───────────────────────────
                        contextMenu.schemaName &&
                          !contextMenu.viewName &&
                          !contextMenu.indexName
                        ? [
                            // ── Open/Close Schema toggle ─────────────────
                            ...(() => {
                              const profile = items.find(
                                (p) => p.id === contextMenu.itemId,
                              )
                              const connName = profile?.name ?? ''
                              const connFolder =
                                connName && profile?.folderId
                                  ? folders.find(
                                      (f) => f.id === profile.folderId,
                                    )
                                  : undefined
                              const basePath = connFolder
                                ? buildPath(connFolder.name, connName)
                                : encodePathSegment(connName)
                              const dbPath =
                                basePath && contextMenu.databaseName
                                  ? buildPath(
                                      basePath,
                                      contextMenu.databaseName,
                                    )
                                  : ''
                              const schemaPath =
                                dbPath && contextMenu.schemaName
                                  ? buildPath(dbPath, contextMenu.schemaName)
                                  : ''
                              const isOpen = schemaPath
                                ? expandedTreePaths.includes(schemaPath)
                                : false
                              return isOpen
                                ? [
                                    {
                                      label: 'Close Schema',
                                      icon: <ChevronDown size={14} />,
                                      action: () => {
                                        if (schemaPath)
                                          handleToggleTreeNode(schemaPath)
                                      },
                                    } as ContextMenuItem,
                                  ]
                                : [
                                    {
                                      label: 'Open Schema',
                                      icon: <ChevronRight size={14} />,
                                      action: () => {
                                        if (schemaPath)
                                          handleToggleTreeNode(schemaPath)
                                      },
                                    } as ContextMenuItem,
                                  ]
                            })(),
                            {
                              label: 'Edit Schema (SQL)',
                              icon: <Pencil size={14} />,
                              action: () => {
                                const connId = contextMenu.itemId
                                const dbName = contextMenu.databaseName!
                                const schemaName = contextMenu.schemaName!
                                const profile = contextProfile
                                if (!profile) return
                                if (selectedConnection?.id !== connId) {
                                  handleConnectionSelectionChange(connId)
                                }
                                queryExecution.onQueryDatabaseChange(dbName)
                                const qId = queryExecution.createQueryId()
                                const route = `/sql/${connId}/query/${qId}`
                                useTabStore.getState().openTab({
                                  id: `${connId}:query:${qId}`,
                                  label: `Query_${qId}`,
                                  type: profile.type,
                                  pageType: 'query',
                                  route,
                                  connectionId: connId,
                                })
                                queryExecution.setActiveQueryId(qId)
                                queryExecution.updateActiveQuery(
                                  `ALTER SCHEMA ${quoteIdentifierForEngine(profile.type, schemaName)} RENAME TO new_name;`,
                                )
                                navigate(route)
                              },
                              disabled: !isConnected,
                            } as ContextMenuItem,
                            { divider: true } as ContextMenuItem,
                            ...(isPg
                              ? [
                                  {
                                    label: 'New Schema',
                                    icon: <Plus size={14} />,
                                    action: () =>
                                      handleNewSchemaFromMenu(
                                        contextMenu.itemId,
                                        contextMenu.databaseName!,
                                      ),
                                    disabled: !isConnected,
                                  } as ContextMenuItem,
                                ]
                              : []),
                            {
                              label: 'Delete Schema',
                              icon: <Trash2 size={14} />,
                              action: () =>
                                handleDeleteSchemaFromMenu(
                                  contextMenu.itemId,
                                  contextMenu.databaseName!,
                                  contextMenu.schemaName!,
                                ),
                              dangerous: true,
                              disabled: !isConnected,
                            } as ContextMenuItem,
                            { divider: true } as ContextMenuItem,
                            {
                              label: 'New Query',
                              icon: <SquareTerminal size={14} />,
                              action: () => {
                                const connId = contextMenu.itemId
                                const dbName = contextMenu.databaseName!
                                const profile = contextProfile
                                if (!profile) return
                                if (selectedConnection?.id !== connId) {
                                  handleConnectionSelectionChange(connId)
                                }
                                queryExecution.onQueryDatabaseChange(dbName)
                                const qId = queryExecution.createQueryId()
                                const route = `/sql/${connId}/query/${qId}`
                                useTabStore.getState().openTab({
                                  id: `${connId}:query:${qId}`,
                                  label: `Query_${qId}`,
                                  type: profile.type,
                                  pageType: 'query',
                                  route,
                                  connectionId: connId,
                                })
                                navigate(route)
                              },
                              disabled: !isConnected,
                            } as ContextMenuItem,
                            {
                              label: 'Execute SQL File',
                              icon: <FileDown size={14} />,
                              action: () =>
                                handleExecuteSqlFile(
                                  contextMenu.itemId,
                                  contextMenu.databaseName!,
                                ),
                              disabled: !isConnected,
                            } as ContextMenuItem,
                            { divider: true } as ContextMenuItem,
                            {
                              label: 'Refresh',
                              icon: <RefreshCw size={14} />,
                              action: () => {
                                handleRefreshConnection(contextMenu.itemId)
                              },
                            } as ContextMenuItem,
                          ]
                        : // ── Connection-level actions ──────────────────
                          !contextMenu.viewName && !contextMenu.indexName
                          ? [
                              // ── Open/Close toggle ────────────────────────
                              ...(connectionStatuses[contextMenu.itemId] ===
                              'connected'
                                ? [
                                    {
                                      label: 'Close Connection',
                                      icon: <Unplug size={14} />,
                                      action: () => {
                                        handleCloseConnection(
                                          contextMenu.itemId,
                                        )
                                      },
                                    } as ContextMenuItem,
                                  ]
                                : [
                                    {
                                      label: 'Open Connection',
                                      icon: <Plug size={14} />,
                                      action: () => {
                                        handleConnectionSelectionChange(
                                          contextMenu.itemId,
                                        )
                                        handleRefreshConnection(
                                          contextMenu.itemId,
                                        )
                                      },
                                    } as ContextMenuItem,
                                  ]),
                              {
                                label: 'Edit Connection',
                                icon: <Pencil size={14} />,
                                action: () => {
                                  handleOpenEditModal(contextMenu.itemId)
                                },
                              },
                              {
                                label: 'New Connection',
                                icon: <Plus size={14} />,
                                action: openCreateConnection,
                              },
                              {
                                label: 'Delete Connection',
                                icon: <Trash2 size={14} />,
                                action: () => {
                                  handleDeleteConnection(contextMenu.itemId)
                                },
                                dangerous: true,
                              } as ContextMenuItem,
                              {
                                label: 'Duplicate Connection',
                                icon: <Copy size={14} />,
                                action: () => {
                                  handleDuplicateConnection(contextMenu.itemId)
                                },
                              },
                              { divider: true } as ContextMenuItem,
                              ...(!isSqlite
                                ? [
                                    {
                                      label: 'New Database',
                                      icon: <Database size={14} />,
                                      action: () =>
                                        handleNewDatabaseFromMenu(
                                          contextMenu.itemId,
                                        ),
                                    } as ContextMenuItem,
                                  ]
                                : []),
                              {
                                label: 'New Query',
                                icon: <SquareTerminal size={14} />,
                                action: () =>
                                  handleNewQueryFromMenu(contextMenu.itemId),
                                disabled: !isConnected,
                              } as ContextMenuItem,
                              { divider: true } as ContextMenuItem,
                              // ── Move to folder (submenu) ─────────────────
                              {
                                label: 'Move to',
                                icon: <Folder size={14} />,
                                children: [
                                  ...(folders.map((f) => ({
                                    label: f.name,
                                    action: () => {
                                      handleMoveConnectionToFolder(
                                        contextMenu.itemId,
                                        f.id,
                                      )
                                    },
                                  })) as ContextMenuItem[]),
                                  ...(folders.length > 0
                                    ? [
                                        {
                                          divider: true,
                                        } as ContextMenuItem,
                                      ]
                                    : []),
                                  {
                                    label: 'New Folder',
                                    icon: <FolderPlus size={14} />,
                                    action: () => {
                                      const count = folders.length + 1
                                      handleCreateFolder(`Folder ${count}`)
                                      setContextMenu(null)
                                    },
                                  } as ContextMenuItem,
                                ],
                              },
                              {
                                label: 'Refresh',
                                icon: <RefreshCw size={14} />,
                                action: () => {
                                  handleRefreshConnection(contextMenu.itemId)
                                },
                              } as ContextMenuItem,
                            ]
                          : []),
              // ── View-specific actions ──────────────────────────
              ...(contextMenu.viewName
                ? [
                    {
                      label: 'New Query',
                      icon: <SquareTerminal size={14} />,
                      action: () => {
                        const connId = contextMenu.itemId
                        const profile = contextProfile
                        if (!profile) return
                        if (selectedConnection?.id !== connId) {
                          handleConnectionSelectionChange(connId)
                        }
                        const qId = queryExecution.createQueryId()
                        const route = `/sql/${connId}/query/${qId}`
                        const openTab = useTabStore.getState().openTab
                        openTab({
                          id: `${connId}:query:${qId}`,
                          label: `Query_${qId}`,
                          type: profile.type,
                          pageType: 'query',
                          route,
                          connectionId: connId,
                        })
                        const view = contextMenu.viewName
                        if (view) {
                          const schemaSource =
                            contextMenu.schemaName ??
                            contextMenu.databaseName ??
                            queryExecution.querySchema ??
                            explorerData.selectedSchema
                          queryExecution.setActiveQueryId(qId)
                          queryExecution.updateActiveQuery(
                            `SELECT * FROM ${qualifyIdentifierForEngine(profile.type, schemaSource, view)};`,
                          )
                        }
                        navigate(route)
                      },
                      disabled: !isConnected,
                    } as ContextMenuItem,
                    {
                      label: 'Edit View',
                      icon: <TableProperties size={14} />,
                      action: () => {
                        const connId = contextMenu.itemId
                        if (!connId) return
                        const view = contextMenu.viewName!
                        const route = `/sql/${connId}/views/${encodeURIComponent(view)}`
                        navigate(route)
                      },
                    } as ContextMenuItem,
                  ]
                : []),
              // ── Elastic index actions ──────────────────────────
              ...(contextMenu.indexName && isEs
                ? [
                    {
                      label: 'View Documents',
                      icon: <FileText size={14} />,
                      action: () => {
                        const connId = contextMenu.itemId
                        if (!connId) return
                        const indexName = contextMenu.indexName!
                        const route = `/elasticsearch/${connId}/indices/${encodeURIComponent(indexName)}`
                        const openTab = useTabStore.getState().openTab
                        openTab({
                          id: `${connId}:index:${indexName}`,
                          label: indexName,
                          type: contextProfile?.type ?? 'elasticsearch',
                          pageType: 'elastic-index',
                          route,
                          connectionId: connId,
                        })
                        navigate(route)
                      },
                    } as ContextMenuItem,
                    {
                      label: 'View Mapping',
                      icon: <Braces size={14} />,
                      action: () => {
                        const connId = contextMenu.itemId
                        if (!connId) return
                        const indexName = contextMenu.indexName!
                        const route = `/elasticsearch/${connId}/indices/${encodeURIComponent(indexName)}/mappings`
                        const openTab = useTabStore.getState().openTab
                        openTab({
                          id: `${connId}:index-mapping`,
                          label: `${indexName} • Mapping`,
                          type: contextProfile?.type ?? 'elasticsearch',
                          pageType: 'elastic-mappings',
                          route,
                          connectionId: connId,
                        })
                        navigate(route)
                      },
                    } as ContextMenuItem,
                    { divider: true } as ContextMenuItem,
                    {
                      label: 'Refresh',
                      icon: <RefreshCw size={14} />,
                      action: () => {
                        handleRefreshConnection(contextMenu.itemId)
                      },
                    } as ContextMenuItem,
                  ]
                : // ── Elasticsearch Indices category ──────────────
                  contextMenu.categoryName === 'Indices' &&
                    contextMenu.indexName === undefined
                  ? [
                      {
                        label: 'View Indices',
                        icon: <Database size={14} />,
                        action: () => {
                          const connId = contextMenu.itemId
                          if (!connId) return
                          const route = `/elasticsearch/${connId}/indices`
                          const openTab = useTabStore.getState().openTab
                          openTab({
                            id: `${connId}:indices`,
                            label: 'Indices',
                            type: contextProfile?.type ?? 'elasticsearch',
                            pageType: 'elastic-indices',
                            route,
                            connectionId: connId,
                          })
                          navigate(route)
                        },
                      } as ContextMenuItem,
                      { divider: true } as ContextMenuItem,
                      {
                        label: 'Refresh',
                        icon: <RefreshCw size={14} />,
                        action: () => {
                          handleRefreshConnection(contextMenu.itemId)
                        },
                      } as ContextMenuItem,
                    ]
                  : []),
            ]}
            onClose={() => setContextMenu(null)}
          />
        </div>
      )}

      {isAddModalOpen && (
        <ConnectionFormModal
          editingId={editingId}
          existingProfile={
            editingId ? (items.find((p) => p.id === editingId) ?? null) : null
          }
          existingGroups={existingGroups}
          folders={folders}
          onSave={handleSaveConnection}
          onClose={handleCloseAddModal}
        />
      )}
      {deleteConnectionTarget && (
        <DeleteConnectionModal
          connectionId={deleteConnectionTarget.id}
          connectionName={deleteConnectionTarget.name}
          onDelete={handleConfirmDeleteConnection}
          onClose={handleCloseDeleteConnectionModal}
        />
      )}

      {createDatabaseTarget && (
        <CreateDatabaseModal
          target={createDatabaseTarget}
          onClose={handleCloseCreateDatabaseModal}
        />
      )}

      {deleteTableTarget &&
        deleteTableConnection &&
        isSqlConnectionType(deleteTableConnection.type) && (
          <DeleteTableModal
            target={deleteTableTarget}
            onDelete={async (tableName, cascade) => {
              const schemaName =
                deleteTableConnection.type === 'postgresql'
                  ? deleteTableTarget.schema
                  : deleteTableTarget.database
              const basePayload = await getConnPayloadWithPassword(
                deleteTableConnection,
                schemaName,
              )
              const payload = {
                ...basePayload,
                database: deleteTableTarget.database,
              }
              const sql =
                deleteTableConnection.type === 'postgresql'
                  ? `DROP TABLE IF EXISTS "${deleteTableTarget.schema}"."${tableName}"${cascade ? ' CASCADE' : ''}`
                  : `DROP TABLE IF EXISTS \`${tableName}\`${cascade ? ' CASCADE' : ''}`
              await executeSql({ connection: payload, sql })
            }}
            onClose={handleCloseDeleteTableModal}
          />
        )}

      {dataOperationTarget &&
        dataOperationConnection &&
        isSqlConnectionType(dataOperationConnection.type) && (
          <DataOperationModal
            target={dataOperationTarget}
            onExecute={async (target) => {
              const schemaName =
                dataOperationConnection.type === 'postgresql'
                  ? target.schema
                  : target.database
              const basePayload = await getConnPayloadWithPassword(
                dataOperationConnection,
                schemaName,
              )
              const payload = { ...basePayload, database: target.database }
              const qualifiedName =
                dataOperationConnection.type === 'postgresql'
                  ? `"${target.schema}"."${target.tableName}"`
                  : `\`${target.tableName}\``
              const sql =
                target.operation === 'truncate'
                  ? `TRUNCATE TABLE ${qualifiedName}`
                  : `DELETE FROM ${qualifiedName}`
              await executeSql({ connection: payload, sql })
            }}
            onClose={handleCloseDataOperationModal}
          />
        )}

      {exportModalTarget && exportTargetConnection && (
        <ExportDataModal
          target={exportModalTarget}
          estimate={exportEstimate}
          job={exportJob}
          recentExports={recentExports}
          onSubmit={handleSubmitExport}
          onUseRecent={handleUseRecentExport}
          onClose={handleCloseExportModal}
        />
      )}
    </>
  )
}
