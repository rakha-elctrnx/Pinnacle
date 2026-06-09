import { useEffect, useMemo, useRef, useState } from 'react'
import { useConnectionStore } from '../../../state/connectionStore'
import type { ConnectionProfile } from '../../../types/domain'
import type { ConnectionStatus, ContextMenuState, TableInfoTab, QueryResultTab, DetailStat } from '../types'
import { downloadTextFile } from '../utils'
import { useExplorerData } from '../hooks/useExplorerData'
import { useQueryExecution } from '../hooks/useQueryExecution'
import { ConnectionSidebar } from '../components/ConnectionSidebar'
import { DetailsPanel } from '../components/DetailsPanel'
import { SqlExplorerWorkspace } from '../components/db/sql/SqlExplorerWorkspace'
import { RedisWorkspaceNotice } from '../components/db/redis/RedisWorkspaceNotice'
import { RabbitMqWorkspaceNotice } from '../components/db/rabbitmq/RabbitMqWorkspaceNotice'
import { ElasticsearchWorkspaceNotice } from '../components/db/elasticsearch/ElasticsearchWorkspaceNotice'
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
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false)

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
    getTreeNodesForConnection,
    handleTreeNodeClick,
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
    setSelectedTreeNode(null)
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

  const wrappedHandleTreeNodeClick = (nodeLabel: string, databaseName?: string, nodePath?: string) => {
    if (nodePath?.endsWith('/Queries')) {
      openQueryTabFromTree(databaseName)
      return
    }

    setSelectedTreeNode(nodeLabel)
    const isTable = handleTreeNodeClick(nodeLabel, databaseName)
    if (isTable) {
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
    setSelectedTreeNode(targetTab.label)
    handleTreeNodeClick(targetTab.label)
    setTableInfoTab('data')
  }

  const handleActiveQueryTabIdChange = (tabId: string) => {
    setActiveTableTabId(null) // clear table selection when switching to query
    setActiveQueryTabId(tabId)
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col">
      <section className="flex-1 overflow-hidden border-slate-200 bg-white shadow-sm">
        <div
          className={
            isDetailsPanelOpen
              ? 'grid h-full min-h-0 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_320px]'
              : 'grid h-full min-h-0 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]'
          }
        >
          <ConnectionSidebar
            search={search}
            onSearchChange={setSearch}
            groupedConnections={groupedConnections}
            selectedConnection={selectedConnection}
            connectionStatuses={connectionStatuses}
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
          />

          <main
            className={[
              'flex flex-col overflow-hidden border-b border-slate-200 lg:border-b-0 lg:border-r',
            ].join(' ')}
          >
            {!selectedConnection ? (
              <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                Select or create a connection to open explorer workspace.
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

                {selectedConnection.type === 'elasticsearch' && <ElasticsearchWorkspaceNotice />}

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