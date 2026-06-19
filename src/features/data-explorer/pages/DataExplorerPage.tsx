import { useDataExplorerContext } from '../context/DataExplorerContext'
import { SqlExplorerWorkspace } from '../components/db/sql/SqlExplorerWorkspace'
import { RedisWorkspaceNotice } from '../components/db/redis/RedisWorkspaceNotice'
import { RabbitMqWorkspaceNotice } from '../components/db/rabbitmq/RabbitMqWorkspaceNotice'
import { ElasticExplorerWorkspace } from '../components/db/elasticsearch/ElasticExplorerWorkspace'
import { MongodbWorkspaceNotice } from '../components/db/mongodb/MongodbWorkspaceNotice'
import { DeleteTableModal } from '../components/DeleteTableModal'
import { DataOperationModal } from '../components/DataOperationModal'
import { ExportDataModal } from '../components/ExportDataModal'
import { TableDesignerModal } from '../components/table-designer/TableDesignerModal'
import { useDesignerStore } from '../../../state/designerStore'
import { executeSql } from '../../../services/clients/sql'
import { getConnPayload, isSqlConnectionType, quoteIdentifier } from '../utils'

/**
 * DataExplorerPage — the routed page body that lives inside the
 * `PageWorkspace` region of the five-region DataExplorerLayout.
 *
 * The chrome (header, footer, navigation strip, sidebar overlay,
 * inspector overlay) and the **global modals** (ConnectionWizardModal,
 * ContextMenu) are owned by `DataExplorerLayout`. This component is
 * responsible only for:
 *   • Rendering the per-connection workspace body
 *   • Mounting the page-level modals (TableDesigner, DeleteTable,
 *     ExportData, DataOperation) that only make sense once a workspace
 *     is active
 *
 * All shared state is consumed from the application-level
 * `DataExplorerContext` (mounted once by `DataExplorerLayout`) so the
 * page works against the same orchestrator instance as the sidebar,
 * footer, header, inspector, and global modals — preventing split
 * state where the page would not see connection selections made in
 * the sidebar.
 */
export function DataExplorerPage() {
  const {
    selectedConnection,
    elasticPanel,
    selectedElasticIndex,
    openedElasticTabs,
    activeElasticTabId,
    openedTableTabs,
    activeTableTabId,
    isSqlTableListView,
    tableInfoTab,
    queryResultTab,
    lastRefreshedAt,
    explorerData,
    queryExecution,
    handleConnectionSelectionChange,
    wrappedHandleTreeNodeClick,
    handleCloseTableTab,
    handleActiveTableTabChange,
    handleActiveQueryTabIdChange,
    handleCloseElasticTab,
    handleActiveElasticTabIdChange,
    setExpandedConnectionId,
    setSelectedTreeNode,
    setElasticPanel,
    setSelectedElasticIndex,
    setIsDetailsPanelOpen,
    setTableInfoTab,
    setQueryResultTab,
    setOpenedElasticTabs,
    setActiveElasticTabId,
    deleteTableTarget,
    handleRequestDeleteTable,
    handleCloseDeleteTableModal,
    dataOperationTarget,
    handleCloseDataOperationModal,
    exportModalTarget,
    exportEstimate,
    exportJob,
    recentExports,
    handleRequestExport,
    handleSubmitExport,
    handleUseRecentExport,
    handleCloseExportModal,
    isDetailsPanelOpen,
    selectedConnectionId,
    connectionStatuses,
    recentConnections,
  } = useDataExplorerContext()
  const loadAndOpenForEdit = useDesignerStore((s) => s.loadAndOpenForEdit)
  const openForCreate = useDesignerStore((s) => s.openForCreate)

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

  const handleCreateInDesigner = () => {
    if (!selectedConnection || !isSqlConnectionType(selectedConnection.type)) return
    const databaseName = queryExecution.queryDatabase || explorerData.selectedDatabase || selectedConnection.database
    const schemaName =
      selectedConnection.type === 'postgresql'
        ? queryExecution.querySchema || explorerData.selectedSchema || 'public'
        : databaseName ?? ''
    if (!databaseName) return
    const payload = { ...getConnPayload(selectedConnection), database: databaseName }

    const handleAfterSave = async (createdTableName: string) => {
      await refreshSqlTableListAfterDdl()
      // Select the newly created table in the explorer
      wrappedHandleTreeNodeClick(createdTableName, databaseName)
    }

    openForCreate(schemaName, databaseName, payload, handleAfterSave)
  }

  const getSqlTableListContext = () => {
    if (!selectedConnection || !isSqlConnectionType(selectedConnection.type)) {
      throw new Error('SQL connection is required')
    }

    const databaseName = queryExecution.queryDatabase || explorerData.selectedDatabase || selectedConnection.database
    const schemaName =
      selectedConnection.type === 'postgresql'
        ? queryExecution.querySchema || explorerData.selectedSchema || 'public'
        : databaseName

    if (!databaseName) {
      throw new Error('Database context is missing')
    }

    return {
      connection: selectedConnection,
      databaseName,
      schemaName,
    }
  }

  const refreshSqlTableListAfterDdl = async () => {
    const { connection, databaseName, schemaName } = getSqlTableListContext()

    await explorerData.fetchSqlTableList(
      connection,
      databaseName,
      connection.type === 'postgresql' ? schemaName : undefined,
    )

    await explorerData.fetchDatabaseDetails(connection.id, connection, databaseName)
  }

  const handleCreateTable = async (tableName: string) => {
    const { connection, databaseName, schemaName } = getSqlTableListContext()
    const payload = { ...getConnPayload(connection), database: databaseName }

    const sql =
      connection.type === 'postgresql'
        ? `CREATE TABLE ${quoteIdentifier(schemaName, '"')}.${quoteIdentifier(tableName, '"')} (id BIGSERIAL PRIMARY KEY)`
        : `CREATE TABLE ${quoteIdentifier(tableName, '`')} (id BIGINT AUTO_INCREMENT PRIMARY KEY)`

    await executeSql({
      connection: payload,
      sql,
    })

    await refreshSqlTableListAfterDdl()
  }

  const handleEditTable = async (tableName: string, nextTableName: string) => {
    const { connection, databaseName, schemaName } = getSqlTableListContext()
    const payload = { ...getConnPayload(connection), database: databaseName }

    const sql =
      connection.type === 'postgresql'
        ? `ALTER TABLE ${quoteIdentifier(schemaName, '"')}.${quoteIdentifier(tableName, '"')} RENAME TO ${quoteIdentifier(nextTableName, '"')}`
        : `RENAME TABLE ${quoteIdentifier(tableName, '`')} TO ${quoteIdentifier(nextTableName, '`')}`

    await executeSql({
      connection: payload,
      sql,
    })

    await refreshSqlTableListAfterDdl()
  }

  const handleDeleteTable = async (tableName: string) => {
    const { connection, databaseName, schemaName } = getSqlTableListContext()
    const payload = { ...getConnPayload(connection), database: databaseName }

    const sql =
      connection.type === 'postgresql'
        ? `DROP TABLE IF EXISTS ${quoteIdentifier(schemaName, '"')}.${quoteIdentifier(tableName, '"')}`
        : `DROP TABLE IF EXISTS ${quoteIdentifier(tableName, '`')}`

    await executeSql({
      connection: payload,
      sql,
    })

    await refreshSqlTableListAfterDdl()
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden">
        {!selectedConnection ? (
          <section className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-on-primary-container border border-outline-variant">
                <svg
                  className="w-8 h-8 text-primary-container"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
                  />
                </svg>
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-on-surface">
                  No Connection Selected
                </h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  Select a connection from the sidebar or create a new one to start exploring your database.
                </p>
              </div>
            </div>
          </section>
        ) : (
          <div className="flex h-full min-h-0 flex-col space-y-4 overflow-hidden">
            {(selectedConnection.type === 'postgresql' || selectedConnection.type === 'mysql') && (
              <SqlExplorerWorkspace
                selectedConnection={selectedConnection}
                lastRefreshedAt={lastRefreshedAt}
                selectedTable={explorerData.selectedTable}
                tableInfoTab={tableInfoTab}
                onTableInfoTabChange={setTableInfoTab}
                realTableStats={explorerData.realTableStats}
                tableDataLoading={explorerData.tableDataLoading}
                realTableStructure={explorerData.realTableStructure}
                realTableIndexes={explorerData.realTableIndexes}
                realTableColumns={explorerData.realTableColumns}
                realTableRows={explorerData.realTableRows}
                sqlTableList={explorerData.sqlTableList}
                sqlTableListLoading={explorerData.sqlTableListLoading}
                schemaForeignKeys={explorerData.schemaForeignKeys}
                schemaColumns={explorerData.schemaColumns}
                schemaColumnsByTable={explorerData.schemaColumnsByTable}
                isSqlTableListView={isSqlTableListView}
                queryTabs={queryExecution.queryTabs}
                queryTabsDirty={queryExecution.queryTabsDirty}
                activeQueryTab={queryExecution.activeQueryTab}
                activeQueryTabId={queryExecution.activeQueryTabId}
                treeData={explorerData.treeDataMap[selectedConnection.id] ?? null}
                selectedConnectionType={selectedConnection.type}
                queryDatabase={queryExecution.queryDatabase}
                querySchema={queryExecution.querySchema}
                onQueryDatabaseChange={queryExecution.onQueryDatabaseChange}
                onQuerySchemaChange={queryExecution.onQuerySchemaChange}
                isRunningQuery={queryExecution.isRunningQuery}
                queryResult={queryExecution.queryResult}
                queryMessages={queryExecution.queryMessages}
                queryResultTab={queryResultTab}
                queryHistoryByConnection={
                  queryExecution.queryHistoryByConnection[selectedConnection.id] ?? []
                }
                savedQueries={queryExecution.savedQueriesByConnection[selectedConnection.id] ?? []}
                openedTableTabs={openedTableTabs}
                activeTableTabId={activeTableTabId}
                selectedConnectionId={selectedConnectionId}
                onSelectedConnectionIdChange={handleConnectionSelectionChange}
                onExpandedConnectionIdChange={setExpandedConnectionId}
                recentConnections={recentConnections}
                selectedConnectionStatus={
                  connectionStatuses[selectedConnection.id] ?? 'disconnected'
                }
                isDetailsPanelOpen={isDetailsPanelOpen}
                onToggleDetailsPanel={() => setIsDetailsPanelOpen((prev) => !prev)}
                onActiveQueryTabIdChange={handleActiveQueryTabIdChange}
                onCloseQueryTab={queryExecution.closeQueryTab}
                onActiveTableTabIdChange={handleActiveTableTabChange}
                onCloseTableTab={handleCloseTableTab}
                onAddQueryTab={queryExecution.addQueryTab}
                onSelectTableFromList={(tableName) => {
                  wrappedHandleTreeNodeClick(tableName, queryExecution.queryDatabase || explorerData.selectedDatabase)
                }}
                onCreateTable={handleCreateTable}
                onEditTable={handleEditTable}
                onDeleteTable={handleDeleteTable}
                onRequestDeleteTable={handleRequestDeleteTable}
                onOpenDesigner={handleOpenDesignerForEdit}
                onCreateInDesigner={handleCreateInDesigner}
                onExportData={handleRequestExport}
                onUpdateActiveQuery={queryExecution.updateActiveQuery}
                onSaveQuery={queryExecution.saveActiveQuery}
                onUseSavedQuery={queryExecution.applySavedQueryToActiveTab}
                onQueryResultTabChange={setQueryResultTab}
                onRunQuery={queryExecution.handleRunQuery}
              />
            )}

            {selectedConnection.type === 'redis' && (
              <RedisWorkspaceNotice
                host={selectedConnection.host}
                port={selectedConnection.port}
              />
            )}

            {selectedConnection.type === 'rabbitmq' && (
              <RabbitMqWorkspaceNotice
                host={selectedConnection.host}
                port={selectedConnection.port}
              />
            )}

            {selectedConnection.type === 'elasticsearch' && (
              <ElasticExplorerWorkspace
                payload={{
                  type: selectedConnection.type,
                  host: selectedConnection.host,
                  port: selectedConnection.port,
                  database: selectedConnection.database ?? '',
                  username: selectedConnection.username,
                  password: selectedConnection.password,
                  ssl: selectedConnection.ssl ?? false,
                }}
                activePanel={elasticPanel}
                selectedIndex={selectedElasticIndex}
                onSelectIndex={(name: string) => {
                  setElasticPanel('documents')
                  setSelectedElasticIndex(name)
                  setSelectedTreeNode(name)
                  const existingTab = openedElasticTabs.find((tab) => tab.indexName === name)
                  if (existingTab) {
                    setActiveElasticTabId(existingTab.id)
                  } else {
                    const tabId = crypto.randomUUID()
                    setOpenedElasticTabs((prev) => [...prev, { id: tabId, indexName: name }])
                    setActiveElasticTabId(tabId)
                  }
                }}
                openedElasticTabs={openedElasticTabs}
                activeElasticTabId={activeElasticTabId}
                onActiveElasticTabIdChange={handleActiveElasticTabIdChange}
                onCloseElasticTab={handleCloseElasticTab}
              />
            )}

            {selectedConnection.type === 'mongodb' && <MongodbWorkspaceNotice />}
          </div>
        )}
      </div>

      {/* Page-level modals. The global modals
          (ConnectionWizardModal, ContextMenu) are mounted by
          DataExplorerLayout so they remain reachable from any
          chrome region. See
          docs/decisions/adr-20260619-modular-folder-structure.md
          (Gap 2: Modal Mounting Strategy). */}

      {/* Table Designer Modal */}
      <TableDesignerModal />

      {/* Delete Table Confirmation Modal */}
      {deleteTableTarget && (
        <DeleteTableModal
          target={deleteTableTarget}
          onDelete={async (tableName, cascade) => {
            const { connection, databaseName, schemaName } = getSqlTableListContext()
            const payload = { ...getConnPayload(connection), database: databaseName }

            const sql =
              connection.type === 'postgresql'
                ? `DROP TABLE IF EXISTS ${quoteIdentifier(schemaName, '"')}.${quoteIdentifier(tableName, '"')}${cascade ? ' CASCADE' : ''}`
                : `DROP TABLE IF EXISTS ${quoteIdentifier(tableName, '`')}${cascade ? ' CASCADE' : ''}`

            await executeSql({
              connection: payload,
              sql,
            })

            await refreshSqlTableListAfterDdl()

            // Clear selected table state if the deleted table was selected
            if (explorerData.selectedTable === tableName) {
              explorerData.setSelectedTable(null)
            }
          }}
          onClose={handleCloseDeleteTableModal}
        />
      )}

      {/* Export Data Modal */}
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

      {/* Data Operation Confirmation Modal (Empty / Truncate) */}
      {dataOperationTarget && (
        <DataOperationModal
          target={dataOperationTarget}
          onExecute={async (target) => {
            const { connection, databaseName, schemaName } = getSqlTableListContext()
            const payload = { ...getConnPayload(connection), database: databaseName }

            const qualifiedTable =
              connection.type === 'postgresql'
                ? `${quoteIdentifier(schemaName, '"')}.${quoteIdentifier(target.tableName, '"')}`
                : quoteIdentifier(target.tableName, '`')

            const sql =
              target.operation === 'truncate'
                ? `TRUNCATE TABLE ${qualifiedTable}`
                : `DELETE FROM ${qualifiedTable}`

            await executeSql({
              connection: payload,
              sql,
            })

            await refreshSqlTableListAfterDdl()
          }}
          onClose={handleCloseDataOperationModal}
        />
      )}
    </div>
  )
}
