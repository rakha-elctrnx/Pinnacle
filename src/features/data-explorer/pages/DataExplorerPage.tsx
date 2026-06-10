import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConnectionStore } from '../../../state/connectionStore'
import type { ConnectionProfile, ElasticIndex } from '../../../types/domain'
import type { ConnectionStatus, ContextMenuState, TableInfoTab, QueryResultTab, DetailStat } from '../types'
import { downloadTextFile } from '../utils'
import { useExplorerData } from '../hooks/useExplorerData'
import { useQueryExecution } from '../hooks/useQueryExecution'
import { ConnectionSidebar } from '../components/ConnectionSidebar'
import { DetailsPanel } from '../components/DetailsPanel'
import { SqlExplorerWorkspace } from '../components/db/sql/SqlExplorerWorkspace'
import { RedisWorkspaceNotice } from '../components/db/redis/RedisWorkspaceNotice'
import { RabbitMqWorkspaceNotice } from '../components/db/rabbitmq/RabbitMqWorkspaceNotice'
import { elasticListIndices } from '../../../services/tauriClient'
import { ElasticExplorerWorkspace } from '../components/db/elasticsearch/ElasticExplorerWorkspace'
import type { ElasticPanel, ElasticIndexTab } from '../components/db/elasticsearch/ElasticExplorerWorkspace'
import { MongodbWorkspaceNotice } from '../components/db/mongodb/MongodbWorkspaceNotice'
import { ConnectionWizardModal } from '../components/ConnectionWizardModal'
import { ContextMenu } from '../components/ContextMenu'

interface OpenedTableTab {
  id: string
  label: string
}

export function DataExplorerPage() {
  const search = useConnectionStore((state) => state.search)
  const setSearch = useConnectionStore((state) => state.setSearch)
  const items = useConnectionStore((state) => state.items)
  const upsert = useConnectionStore((state) => state.upsert)
  const remove = useConnectionStore((state) => state.remove)

  // Selection & expansion state
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [expandedConnectionId, setExpandedConnectionId] = useState<string | null>(null)
  const [selectedTreeNode, setSelectedTreeNode] = useState<string | null>(null)
  const [expandedTreePaths, setExpandedTreePaths] = useState<string[]>([])

  // Modal & context menu state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // Connection statuses & refresh time
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, ConnectionStatus>>({})
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date().toLocaleTimeString())

  // Table info tab
  const [tableInfoTab, setTableInfoTab] = useState<TableInfoTab>('data')
  const [queryResultTab, setQueryResultTab] = useState<QueryResultTab>('results')
  const [openedTableTabs, setOpenedTableTabs] = useState<OpenedTableTab[]>([])
  const [activeTableTabId, setActiveTableTabId] = useState<string | null>(null)
  const [isSqlTableListView, setIsSqlTableListView] = useState(false)
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false)
  const [elasticPanel, setElasticPanel] = useState<ElasticPanel>('cluster')
  const [selectedElasticIndex, setSelectedElasticIndex] = useState<string | null>(null)
  const [elasticIndices, setElasticIndices] = useState<Record<string, ElasticIndex[]>>({})
  const [openedElasticTabs, setOpenedElasticTabs] = useState<ElasticIndexTab[]>([])
  const [activeElasticTabId, setActiveElasticTabId] = useState<string | null>(null)

  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [isResizing, setIsResizing] = useState(false)

  // ── Fetch Elasticsearch indices when an ES connection is expanded ──
  useEffect(() => {
    if (!expandedConnectionId) return
    const conn = items.find((item) => item.id === expandedConnectionId)
    if (!conn || conn.type !== 'elasticsearch') return

    const payload = {
      type: conn.type,
      host: conn.host,
      port: conn.port,
      database: conn.database ?? '',
      username: conn.username,
      password: conn.password,
      ssl: conn.ssl ?? false,
    }

    elasticListIndices(payload)
      .then((indices) => {
        setElasticIndices((prev) => ({
          ...prev,
          [conn.id]: indices ?? [],
        }))
      })
      .catch(() => {
        // silently ignore – sidebar will show empty children
      })
  }, [expandedConnectionId, items])

  // ── Sidebar resize handlers ────────────────────────────────────────

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(500, Math.max(200, e.clientX))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

  // ── Derived state ──────────────────────────────────────────────────

  const filtered = useMemo(
    () =>
      items.filter((item) =>
        `${item.name} ${item.host} ${item.type} ${item.tags.join(' ')}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [items, search],
  )

  const groupedConnections = useMemo(() => {
    return filtered.reduce<Record<string, ConnectionProfile[]>>((acc, item) => {
      const group = item.tags[0] || 'Ungrouped'
      acc[group] = acc[group] ? [...acc[group], item] : [item]
      return acc
    }, {})
  }, [filtered])

  const effectiveSelectedConnectionId = selectedConnectionId

  const selectedConnection = useMemo(
    () => items.find((item) => item.id === effectiveSelectedConnectionId) ?? null,
    [items, effectiveSelectedConnectionId],
  )

  const selectedConnectionStatus: ConnectionStatus = selectedConnection
    ? (connectionStatuses[selectedConnection.id] ?? 'disconnected')
    : 'disconnected'

  const recentConnections = useMemo(
    () => [...items].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5),
    [items],
  )

  // ── Hooks ──────────────────────────────────────────────────────────

  const explorerData = useExplorerData({
    expandedConnectionId,
    selectedConnection,
    setConnectionStatuses,
  })

  const {
    realTableColumns,
    realTableRows,
    realTableStats,
    realTableStructure,
    realTableIndexes,
    realDbStats,
    selectedTable,
    selectedDatabase,
    tableDataLoading,
    sqlTableList,
    sqlTableListLoading,
    getTreeNodesForConnection,
    handleTreeNodeClick,
    fetchSqlTableList,
    refreshConnectionData,
  } = explorerData

  const queryExecution = useQueryExecution({
    selectedConnection,
    selectedSchema: explorerData.selectedSchema,
    selectedDatabase,
    setConnectionStatuses,
  })

  const {
    queryTabs,
    activeQueryTabId,
    activeQueryTab,
    queryDatabase,
    querySchema,
    onQueryDatabaseChange,
    onQuerySchemaChange,
    queryTabsDirty,
    isRunningQuery,
    queryResult,
    queryMessages,
    queryHistoryByConnection,
    savedQueriesByConnection,
    addQueryTab,
    closeQueryTab,
    openQueryTabFromTree,
    updateActiveQuery,
    saveActiveQuery,
    applySavedQueryToActiveTab,
    setActiveQueryTabId,
    handleRunQuery,
  } = queryExecution

  const detailsStats = useMemo((): DetailStat[] => {
    if (realDbStats.length > 0) return realDbStats
    if (!selectedConnection) return []
    return [
      { label: 'Status', value: connectionStatuses[selectedConnection.id] ?? 'disconnected' },
    ]
  }, [realDbStats, selectedConnection, connectionStatuses])

  // ── Context menu click-outside ─────────────────────────────────────

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null)
      }
    }
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [contextMenu])

  // ── Handlers ───────────────────────────────────────────────────────

  const openCreateWizard = () => {
    setEditingId(null)
    setIsAddModalOpen(true)
  }

  const handleConnectionSelectionChange = (id: string | null) => {
    setSelectedConnectionId(id)
    setOpenedTableTabs([])
    setActiveTableTabId(null)
    setIsSqlTableListView(false)
    setSelectedTreeNode(null)
    setElasticPanel('cluster')
    setSelectedElasticIndex(null)
    setOpenedElasticTabs([])
    setActiveElasticTabId(null)
    explorerData.setSelectedTable(null)
  }

  const handleOpenEditModal = (itemId: string) => {
    setEditingId(itemId)
    setIsAddModalOpen(true)
  }

  const handleDuplicateConnection = (itemId: string) => {
    const item = items.find((profile) => profile.id === itemId)
    if (!item) return
    const now = new Date().toISOString()
    upsert({
      ...item,
      id: crypto.randomUUID(),
      name: `${item.name} Copy`,
      createdAt: now,
      updatedAt: now,
    })
  }

  const handleExportConnection = (itemId: string) => {
    const item = items.find((profile) => profile.id === itemId)
    if (!item) return
    const exported = {
      ...item,
      password: 'redacted',
      encryptedPasswordRef: 'redacted',
    }
    downloadTextFile(
      `${item.name.replaceAll(' ', '_')}.connection.json`,
      JSON.stringify(exported, null, 2),
      'application/json',
    )
  }

  const handleRefreshConnection = async (itemId: string) => {
    const item = items.find((profile) => profile.id === itemId)
    if (!item) return

    setLastRefreshedAt(new Date().toLocaleTimeString())

    if (item.type === 'postgresql' || item.type === 'mysql') {
      await refreshConnectionData(item.id, item)
      return
    }

    setConnectionStatuses((prev) => ({
      ...prev,
      [item.id]: 'connected',
    }))
  }

  const handleCloseConnection = (itemId: string) => {
    setConnectionStatuses((prev) => ({
      ...prev,
      [itemId]: 'disconnected',
    }))

    if (selectedConnectionId === itemId) {
      handleConnectionSelectionChange(null)
    }

    if (expandedConnectionId === itemId) {
      setExpandedConnectionId(null)
    }
  }

  const handleSaveConnection = (profile: ConnectionProfile) => {
    upsert(profile)
    setConnectionStatuses((prev) => ({
      ...prev,
      [profile.id]: 'idle',
    }))
    handleConnectionSelectionChange(profile.id)
    setEditingId(null)
    setIsAddModalOpen(false)
  }

  // Override the handleTreeNodeClick to also set the table info tab
  const handleToggleTreeNode = (path: string) => {
    setExpandedTreePaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    )
  }

  const handleFetchDatabaseDetails = (dbName: string) => {
    if (selectedConnection) {
      const treeData = explorerData.treeDataMap[selectedConnection.id]
      const db = treeData?.databases.find((d) => d.name === dbName)
      if (db && !db.loaded) {
        explorerData.fetchDatabaseDetails(selectedConnection.id, selectedConnection, dbName)
      }
    }
  }

  /** Map sidebar label to elastic panel key */
  const ELASTIC_LABEL_TO_PANEL: Record<string, ElasticPanel> = {
    'Cluster': 'cluster',
    'Indices': 'indices',
    'Query Console': 'query',
    'Mapping': 'mapping',
  }

  const wrappedHandleTreeNodeClick = (nodeLabel: string, databaseName?: string, nodePath?: string) => {
    if (nodePath?.endsWith('/Queries')) {
      openQueryTabFromTree(databaseName)
      setIsSqlTableListView(false)
      return
    }

    if (
      nodePath?.endsWith('/Tables') &&
      (selectedConnection?.type === 'postgresql' || selectedConnection?.type === 'mysql')
    ) {
      const pathParts = nodePath.split('/').filter(Boolean)
      const targetDatabase = databaseName || pathParts[0] || selectedConnection.database
      const targetSchema =
        selectedConnection.type === 'postgresql' && pathParts.length >= 3
          ? pathParts[pathParts.length - 2]
          : undefined

      setSelectedTreeNode(nodeLabel)
      setActiveTableTabId(null)
      setIsSqlTableListView(true)

      if (targetDatabase) {
        void fetchSqlTableList(selectedConnection, targetDatabase, targetSchema)
        onQueryDatabaseChange(targetDatabase)
        onQuerySchemaChange(targetSchema || '')
      }

      return
    }

    // Handle elasticsearch sidebar navigation
    if (selectedConnection?.type === 'elasticsearch') {
      // Check if clicking an index child (path like "Indices/indexName")
      if (nodePath?.startsWith('Indices/')) {
        setElasticPanel('documents')
        setSelectedElasticIndex(nodeLabel)
        setSelectedTreeNode(nodeLabel)
        // Open or activate an index tab (like SQL table tabs)
        const existingTab = openedElasticTabs.find((tab) => tab.indexName === nodeLabel)
        if (existingTab) {
          setActiveElasticTabId(existingTab.id)
        } else {
          const tabId = crypto.randomUUID()
          setOpenedElasticTabs((prev) => [...prev, { id: tabId, indexName: nodeLabel }])
          setActiveElasticTabId(tabId)
        }
        return
      }
      if (ELASTIC_LABEL_TO_PANEL[nodeLabel]) {
        setElasticPanel(ELASTIC_LABEL_TO_PANEL[nodeLabel])
        setSelectedElasticIndex(null)
        setSelectedTreeNode(nodeLabel)
        // Clear active elastic tab when switching to non-index panels
        setActiveElasticTabId(null)
        return
      }
    }

    setSelectedTreeNode(nodeLabel)
    const isTable = handleTreeNodeClick(nodeLabel, databaseName)
    if (isTable) {
      setIsSqlTableListView(false)
      const existingTab = openedTableTabs.find((tab) => tab.label === nodeLabel)
      if (existingTab) {
        setActiveTableTabId(existingTab.id)
      } else {
        const tabId = crypto.randomUUID()
        setOpenedTableTabs((prev) => [...prev, { id: tabId, label: nodeLabel }])
        setActiveTableTabId(tabId)
      }
      setTableInfoTab('data')

      // Auto-fill database and schema selectors in query editor
      // based on the database/schema context of the clicked table
      const treeData = explorerData.treeDataMap[selectedConnection?.id ?? '']
      if (treeData) {
        if (selectedConnection?.type === 'postgresql') {
          for (const db of treeData.databases) {
            for (const schema of db.schemas) {
              if (schema.tables.includes(nodeLabel)) {
                onQueryDatabaseChange(db.name)
                onQuerySchemaChange(schema.name)
                break
              }
            }
          }
        } else if (selectedConnection?.type === 'mysql') {
          for (const db of treeData.databases) {
            const allTables = db.schemas[0]?.tables ?? []
            if (allTables.includes(nodeLabel)) {
              onQueryDatabaseChange(db.name)
              onQuerySchemaChange('')
              break
            }
          }
        }
      }
    }
  }

  const handleCloseTableTab = (tabId: string) => {
    setOpenedTableTabs((prev) => {
      const nextTabs = prev.filter((tab) => tab.id !== tabId)

      if (activeTableTabId === tabId) {
        const fallbackTab = nextTabs[nextTabs.length - 1] ?? null
        setActiveTableTabId(fallbackTab?.id ?? null)
        if (fallbackTab) {
          setSelectedTreeNode(fallbackTab.label)
          handleTreeNodeClick(fallbackTab.label)
        } else {
          explorerData.setSelectedTable(null)
        }
      }

      return nextTabs
    })
  }

  const handleActiveTableTabChange = (tabId: string) => {
    const targetTab = openedTableTabs.find((tab) => tab.id === tabId)
    if (!targetTab) return

    setActiveTableTabId(tabId)
    setIsSqlTableListView(false)
    setSelectedTreeNode(targetTab.label)
    handleTreeNodeClick(targetTab.label)
    setTableInfoTab('data')
  }

  const handleActiveQueryTabIdChange = (tabId: string) => {
    setActiveTableTabId(null) // clear table selection when switching to query
    setIsSqlTableListView(false)
    setActiveQueryTabId(tabId)
  }

  const handleCloseElasticTab = (tabId: string) => {
    setOpenedElasticTabs((prev) => {
      const nextTabs = prev.filter((tab) => tab.id !== tabId)

      if (activeElasticTabId === tabId) {
        const fallbackTab = nextTabs[nextTabs.length - 1] ?? null
        setActiveElasticTabId(fallbackTab?.id ?? null)
        if (fallbackTab) {
          setSelectedElasticIndex(fallbackTab.indexName)
        } else {
          setSelectedElasticIndex(null)
        }
      }

      return nextTabs
    })
  }

  const handleActiveElasticTabIdChange = (tabId: string) => {
    const targetTab = openedElasticTabs.find((tab) => tab.id === tabId)
    if (!targetTab) return

    setActiveElasticTabId(tabId)
    setSelectedElasticIndex(targetTab.indexName)
    setSelectedTreeNode(targetTab.indexName)
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col">
      <section className="flex-1 overflow-hidden border-slate-200 bg-white shadow-sm">
        <div className="flex h-full min-h-0 flex-col lg:flex-row">
          {/* Sidebar with dynamic width */}
          <div
            style={{ width: sidebarWidth }}
            className="hidden lg:block shrink-0 overflow-x-hidden overflow-y-auto border-r border-slate-200 min-w-0"
          >
            <ConnectionSidebar
              search={search}
              onSearchChange={setSearch}
              groupedConnections={groupedConnections}
              selectedConnection={selectedConnection}
              expandedConnectionId={expandedConnectionId}
              treeLoading={explorerData.treeLoading}
              selectedTreeNode={selectedTreeNode}
              savedQueries={savedQueriesByConnection}
              onOpenCreateWizard={openCreateWizard}
              onSelectConnection={handleConnectionSelectionChange}
              onToggleExpand={(id) => setExpandedConnectionId(expandedConnectionId === id ? null : id)}
              onContextMenu={(event, itemId) =>
                setContextMenu({ x: event.clientX, y: event.clientY, itemId })
              }
              getTreeNodesForConnection={getTreeNodesForConnection}
              onTreeNodeClick={wrappedHandleTreeNodeClick}
              onSelectedTreeNode={setSelectedTreeNode}
              expandedTreePaths={expandedTreePaths}
              onToggleTreeNode={handleToggleTreeNode}
              onFetchDatabaseDetails={handleFetchDatabaseDetails}
              onUseSavedQuery={applySavedQueryToActiveTab}
              elasticIndices={elasticIndices}
            />
          </div>

          {/* Mobile sidebar */}
          <div className="lg:hidden shrink-0">
            <ConnectionSidebar
              search={search}
              onSearchChange={setSearch}
              groupedConnections={groupedConnections}
              selectedConnection={selectedConnection}
              expandedConnectionId={expandedConnectionId}
              treeLoading={explorerData.treeLoading}
              selectedTreeNode={selectedTreeNode}
              savedQueries={savedQueriesByConnection}
              onOpenCreateWizard={openCreateWizard}
              onSelectConnection={handleConnectionSelectionChange}
              onToggleExpand={(id) => setExpandedConnectionId(expandedConnectionId === id ? null : id)}
              onContextMenu={(event, itemId) =>
                setContextMenu({ x: event.clientX, y: event.clientY, itemId })
              }
              getTreeNodesForConnection={getTreeNodesForConnection}
              onTreeNodeClick={wrappedHandleTreeNodeClick}
              onSelectedTreeNode={setSelectedTreeNode}
              expandedTreePaths={expandedTreePaths}
              onToggleTreeNode={handleToggleTreeNode}
              onFetchDatabaseDetails={handleFetchDatabaseDetails}
              onUseSavedQuery={applySavedQueryToActiveTab}
              elasticIndices={elasticIndices}
            />
          </div>

          {/* Resize handle (desktop only) */}
          <div
            onMouseDown={handleResizeStart}
            className={[
              'hidden lg:block w-1 shrink-0 cursor-col-resize relative',
              isResizing ? 'bg-blue-400' : 'bg-transparent hover:bg-blue-300',
            ].join(' ')}
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>

          <main
            className={[
              'flex-1 min-w-0 flex flex-col overflow-hidden border-b border-slate-200 lg:border-b-0',
            ].join(' ')}
          >
            {!selectedConnection ? (
              <section className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
                  <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200">
                    <svg
                      className="w-8 h-8 text-slate-400"
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
                    <h3 className="text-base font-semibold text-slate-700">
                      No Connection Selected
                    </h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      Select a connection from the sidebar or create a new one to start exploring your database.
                    </p>
                  </div>
                </div>
              </section>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col space-y-4 overflow-hidden">
                {(selectedConnection.type === 'postgresql' || selectedConnection.type === 'mysql') && (
                  <SqlExplorerWorkspace
                    selectedConnection={selectedConnection}
                    lastRefreshedAt={lastRefreshedAt}
                    selectedTable={selectedTable}
                    tableInfoTab={tableInfoTab}
                    onTableInfoTabChange={setTableInfoTab}
                    realTableStats={realTableStats}
                    tableDataLoading={tableDataLoading}
                    realTableStructure={realTableStructure}
                    realTableIndexes={realTableIndexes}
                    realTableColumns={realTableColumns}
                    realTableRows={realTableRows}
                    sqlTableList={sqlTableList}
                    sqlTableListLoading={sqlTableListLoading}
                    isSqlTableListView={isSqlTableListView}
                    queryTabs={queryTabs}
                    queryTabsDirty={queryTabsDirty}
                    activeQueryTab={activeQueryTab}
                    activeQueryTabId={activeQueryTabId}
                    treeData={explorerData.treeDataMap[selectedConnection.id] ?? null}
                    selectedConnectionType={selectedConnection.type}
                    queryDatabase={queryDatabase}
                    querySchema={querySchema}
                    onQueryDatabaseChange={onQueryDatabaseChange}
                    onQuerySchemaChange={onQuerySchemaChange}
                    isRunningQuery={isRunningQuery}
                    queryResult={queryResult}
                    queryMessages={queryMessages}
                    queryResultTab={queryResultTab}
                    queryHistoryByConnection={
                      queryHistoryByConnection[selectedConnection.id] ?? []
                    }
                    savedQueries={savedQueriesByConnection[selectedConnection.id] ?? []}
                    openedTableTabs={openedTableTabs}
                    activeTableTabId={activeTableTabId}
                    selectedConnectionId={selectedConnectionId}
                    onSelectedConnectionIdChange={handleConnectionSelectionChange}
                    onExpandedConnectionIdChange={setExpandedConnectionId}
                    recentConnections={recentConnections}
                    selectedConnectionStatus={selectedConnectionStatus}
                    isDetailsPanelOpen={isDetailsPanelOpen}
                    onToggleDetailsPanel={() => setIsDetailsPanelOpen((prev) => !prev)}
                    onActiveQueryTabIdChange={handleActiveQueryTabIdChange}
                    onCloseQueryTab={closeQueryTab}
                    onActiveTableTabIdChange={handleActiveTableTabChange}
                    onCloseTableTab={handleCloseTableTab}
                    onAddQueryTab={addQueryTab}
                    onSelectTableFromList={(tableName) => {
                      wrappedHandleTreeNodeClick(tableName, queryDatabase || selectedDatabase)
                    }}
                    onUpdateActiveQuery={updateActiveQuery}
                    onSaveQuery={saveActiveQuery}
                    onUseSavedQuery={applySavedQueryToActiveTab}
                    onQueryResultTabChange={setQueryResultTab}
                    onRunQuery={handleRunQuery}
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
                      // Open or activate an index tab (like sidebar does)
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
          </main>

          {isDetailsPanelOpen && (
            <DetailsPanel
              selectedConnection={selectedConnection}
              detailsStats={detailsStats}
              onClose={() => setIsDetailsPanelOpen(false)}
            />
          )}
        </div>
      </section>

      {contextMenu && (
        <div ref={contextMenuRef}>
          <ContextMenu
            state={contextMenu}
            onEdit={handleOpenEditModal}
            onRefresh={handleRefreshConnection}
            onCloseConnection={handleCloseConnection}
            onDuplicate={handleDuplicateConnection}
            onExport={handleExportConnection}
            onDelete={(itemId) => {
              remove(itemId)
              if (selectedConnectionId === itemId) setSelectedConnectionId(null)
              if (expandedConnectionId === itemId) setExpandedConnectionId(null)
            }}
            onClose={() => setContextMenu(null)}
          />
        </div>
      )}

      {isAddModalOpen && (
        <ConnectionWizardModal
          editingId={editingId}
          existingProfile={editingId ? items.find((p) => p.id === editingId) ?? null : null}
          onSave={handleSaveConnection}
          onClose={() => {
            setEditingId(null)
            setIsAddModalOpen(false)
          }}
        />
      )}
    </div>
  )
}