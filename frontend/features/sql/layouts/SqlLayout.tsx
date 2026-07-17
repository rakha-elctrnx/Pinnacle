import { useEffect, useMemo } from 'react'
import { useParams, Outlet, Navigate, useLocation } from 'react-router-dom'
import { useTabStore } from '../../_shared/store/tabStore'
import { useDataExplorerContext } from '../../_shared/context/DataExplorerContext'
import { DeleteTableModal } from '../components/shared/DeleteTableModal'
import { ExportDataModal } from '../components/export/ExportDataModal'
import { DataOperationModal } from '../components/export/DataOperationModal'
import {
  isSqlConnectionType,
  getConnPayloadWithPassword,
} from '../../_shared/utils'

/**
 * SqlLayout — per-connection context provider for the SQL feature.
 *
 * Route: `/sql/:connectionId/*`
 *
 * Provides connection context, mounts the four SQL-specific modals, and
 * syncs the selected connection with the URL. The sub-navigation bar
 * (Tables/Query tabs) was removed — all page-level tabs are now managed
 * by the global `TabBar` in `PageWorkspace`.
 *
 * Child pages (TablesPage, TableDetailPage, QueryPage) are rendered via
 * `<Outlet />`.
 */
export function SqlLayout() {
  const { connectionId } = useParams<{ connectionId: string }>()
  const location = useLocation()

  const {
    items,
    selectedConnection,
    openConnectionFromUrl,
    handleConnectionSelectionChange,
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

  // Sync the orchestrator's selected connection with the URL param, then
  // expand its tree node + fetch data (search/URL entry path; sidebar
  // clicks expand via handleConnectionToggle, so they skip this effect
  // because handleConnectionSelectionChange already set selectedConnection).
  useEffect(() => {
    if (connection && selectedConnection?.id !== connectionId) {
      handleConnectionSelectionChange(connectionId!)
      openConnectionFromUrl(connectionId!)
    }
  }, [
    connectionId,
    connection,
    selectedConnection,
    handleConnectionSelectionChange,
    openConnectionFromUrl,
  ])

  // ── Sync tab store with URL ──
  // Activate the tab whose route matches the current URL.
  // Must match by exact route — using connectionId alone would match the
  // *first* child tab and corrupt its route when a sibling tab is active.
  useEffect(() => {
    if (!connectionId) return

    const tabs = useTabStore.getState().tabs
    const matching = tabs.find(
      (t) => t.connectionId === connectionId && t.route === location.pathname,
    )
    if (matching) {
      useTabStore.getState().activateTab(matching.id)
    }
  }, [location.pathname, connectionId])

  const currentDatabase =
    queryExecution.queryDatabase ||
    explorerData.selectedDatabase ||
    connection?.database ||
    ''
  const currentSchema =
    queryExecution.querySchema || explorerData.selectedSchema || 'public'

  // No connectionId in the URL (visiting /sql directly) — show empty state.
  // This is placed after all hooks to satisfy the rules-of-hooks rule.
  if (!connectionId) {
    return (
      <div className="flex h-full w-full items-center justify-center text-text-muted">
        <p className="text-body-secondary text-text-secondary">
          Select a connection from the sidebar to get started.
        </p>
      </div>
    )
  }

  // ConnectionId present but not found — redirect to home.
  if (!connection) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
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
              connection.type === 'postgresql'
                ? currentSchema
                : (databaseName ?? '')
            const basePayload = await getConnPayloadWithPassword(
              connection,
              schemaName,
            )
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
              connection.type === 'postgresql'
                ? currentSchema
                : (databaseName ?? '')
            const basePayload = await getConnPayloadWithPassword(
              connection,
              schemaName,
            )
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
    </div>
  )
}
