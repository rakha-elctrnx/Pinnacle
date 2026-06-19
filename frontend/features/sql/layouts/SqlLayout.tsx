import { useEffect, useMemo } from 'react'
import { useParams, Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Play, Save, FileDown } from 'lucide-react'
import { useDataExplorerContext } from '../../_shared/context/DataExplorerContext'
import type { ToolbarItem } from '../../_shared/components/WorkspaceToolbar'
import { DeleteTableModal } from '../components/shared/DeleteTableModal'
import { ExportDataModal } from '../components/export/ExportDataModal'
import { DataOperationModal } from '../components/export/DataOperationModal'
import { TableDesignerModal } from '../components/table-designer/TableDesignerModal'
import { isSqlConnectionType, getConnPayload } from '../../_shared/utils'

/**
 * SqlLayout — per-connection layout for the SQL feature.
 *
 * Route: `/sql/:connectionId/*`
 *
 * Provides the SQL-specific chrome (toolbar, sub-nav, tab bar, database/schema
 * selectors) and mounts the four SQL-specific modals. Child pages
 * (TablesPage, TableDetailPage, QueryPage) are rendered via `<Outlet />`.
 *
 * Reads `connectionId` from the URL and validates that a matching connection
 * exists in the orchestrator's items. If the connection is not found,
 * redirects to the home route.
 */
export function SqlLayout() {
  const { connectionId } = useParams<{ connectionId: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const {
    items,
    selectedConnection,
    handleConnectionSelectionChange,
    openedTableTabs,
    activeTableTabId,
    handleCloseTableTab,
    handleActiveTableTabChange,
    queryExecution,
    explorerData,
    // Modal state + handlers
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
  } = useDataExplorerContext()

  // Find the connection by ID from the URL.
  const connection = useMemo(
    () => items.find((c) => c.id === connectionId) ?? null,
    [items, connectionId],
  )

  // Sync the orchestrator's selected connection with the URL param.
  useEffect(() => {
    if (connection && selectedConnection?.id !== connectionId) {
      handleConnectionSelectionChange(connectionId!)
    }
  }, [connectionId, connection, selectedConnection, handleConnectionSelectionChange])

  // ── Determine which child route is active ──
  const pathSegments = location.pathname.split('/')
  const activeSection = pathSegments[3] ?? 'tables' // tables | query | erd
  const isQueryView = activeSection === 'query'
  const isTableView = activeSection === 'tables'

  const currentDatabase =
    queryExecution.queryDatabase || explorerData.selectedDatabase || connection?.database || ''
  const currentSchema =
    queryExecution.querySchema || explorerData.selectedSchema || 'public'

  // ── Toolbar items ──
  const toolbarItems: ToolbarItem[] = []

  if (isQueryView) {
    toolbarItems.push(
      {
        id: 'run-query',
        label: 'Run',
        icon: Play,
        variant: 'primary',
        enabled: !queryExecution.isRunningQuery,
        onClick: () => queryExecution.handleRunQuery('run'),
      },
      {
        id: 'save-query',
        label: 'Save',
        icon: Save,
        variant: 'secondary',
        onClick: () => queryExecution.saveActiveQuery(),
      },
    )
  }

  if (isTableView && activeTableTabId) {
    toolbarItems.push({
      id: 'export-data',
      label: 'Export',
      icon: FileDown,
      variant: 'secondary',
      onClick: () => {
        navigate(`/sql/${connectionId}/tables/${encodeURIComponent(activeTableTabId)}`)
      },
    })
  }

  // ── Tab bar ──
  const tabs = [
    ...openedTableTabs.map((tab) => ({
      id: tab.id,
      label: tab.label,
      type: 'table' as const,
    })),
    ...queryExecution.queryTabs.map((tab) => ({
      id: tab.id,
      label: tab.title,
      type: 'query' as const,
    })),
  ]

  const activeTabId = activeTableTabId ?? queryExecution.activeQueryTabId ?? null

  // ── Handle tab click — navigate to the correct route ──
  const handleTabClick = (tabId: string, tabType: 'table' | 'query') => {
    if (tabType === 'table') {
      handleActiveTableTabChange(tabId)
      navigate(`/sql/${connectionId}/tables/${encodeURIComponent(tabId)}`)
    } else {
      queryExecution.setActiveQueryTabId(tabId)
      navigate(`/sql/${connectionId}/query`)
    }
  }

  // ── Handle tab close ──
  const handleTabClose = (tabId: string, tabType: 'table' | 'query') => {
    if (tabType === 'table') {
      handleCloseTableTab(tabId)
    } else {
      queryExecution.closeQueryTab(tabId)
    }
  }

  // ── Sub-nav links (Tables / Query / ERD) ──
  const subNavItems = [
    { label: 'Tables', path: `/sql/${connectionId}/tables`, active: isTableView },
    { label: 'Query', path: `/sql/${connectionId}/query`, active: isQueryView },
  ]

  // No connectionId in the URL (visiting /sql directly) — show empty state.
  // This is placed after all hooks to satisfy the rules-of-hooks rule.
  if (!connectionId) {
    return (
      <div className="flex h-full w-full items-center justify-center text-on-surface-variant">
        <p className="text-sm">Select a connection from the sidebar to get started.</p>
      </div>
    )
  }

  // ConnectionId present but not found — redirect to home.
  if (!connection) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1 border-b border-outline-variant bg-surface-variant px-3 py-2">
        {subNavItems.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => navigate(item.path)}
            className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              item.active
                ? 'bg-primary-container text-on-primary-container'
                : 'text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            {item.label}
          </button>
        ))}

        {tabs.length > 0 && (
          <div className="ml-2 flex items-center gap-1 border-l border-outline-variant pl-2">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                  tab.id === activeTabId
                    ? 'bg-primary-container text-on-primary-container'
                    : 'text-on-surface-variant hover:bg-surface-container-low'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleTabClick(tab.id, tab.type)}
                  className="cursor-pointer truncate max-w-30"
                  title={tab.label}
                >
                  {tab.label}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleTabClose(tab.id, tab.type)
                  }}
                  className="cursor-pointer ml-1 rounded p-0.5 hover:bg-error-container/30 text-on-surface-variant"
                  aria-label={`Close ${tab.label}`}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Page content ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </div>

      {/* ── SQL-specific modals (per ADR Gap 2) ── */}
      {deleteTableTarget && (
        <DeleteTableModal
          target={deleteTableTarget}
          onDelete={async (tableName, cascade) => {
            if (!isSqlConnectionType(connection.type)) return
            const databaseName = currentDatabase
            const schemaName =
              connection.type === 'postgresql' ? currentSchema : databaseName ?? ''
            const basePayload = getConnPayload(connection, schemaName)
            const payload = { ...basePayload, database: databaseName }
            const { executeSql } = await import('../clients/sql')
            const sql =
              connection.type === 'postgresql'
                ? `DROP TABLE IF EXISTS "${schemaName}"."${tableName}"${cascade ? ' CASCADE' : ''}`
                : `DROP TABLE IF EXISTS \`${tableName}\`${cascade ? ' CASCADE' : ''}`
            await executeSql({ connection: payload, sql })
          }}
          onClose={handleCloseDeleteTableModal}
        />
      )}

      {dataOperationTarget && (
        <DataOperationModal
          target={dataOperationTarget}
          onExecute={async (target) => {
            if (!isSqlConnectionType(connection.type)) return
            const databaseName = currentDatabase
            const schemaName =
              connection.type === 'postgresql' ? currentSchema : databaseName ?? ''
            const basePayload = getConnPayload(connection, schemaName)
            const payload = { ...basePayload, database: databaseName }
            const { executeSql } = await import('../clients/sql')
            const qualifiedName =
              connection.type === 'postgresql'
                ? `"${schemaName}"."${target.tableName}"`
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

      {exportModalTarget && (
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

      <TableDesignerModal />
    </div>
  )
}