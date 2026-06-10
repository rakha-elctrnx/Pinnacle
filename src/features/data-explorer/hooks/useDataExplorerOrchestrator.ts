/**
 * Data Explorer Orchestrator — thin page-level hook
 *
 * Phase 2: Uses registry capability checks instead of raw type string
 * branching for SQL and Elasticsearch dispatch. Adapter layer provides
 * the runtime implementation behind each capability.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConnectionStore } from '../../../state/connectionStore'
import type { ConnectionProfile, ElasticIndex } from '../../../types/domain'
import type { ConnectionStatus, ContextMenuState, DetailStat } from '../types'
import type { ElasticPanel, ElasticIndexTab } from '../components/db/elasticsearch/ElasticExplorerWorkspace'
import { downloadTextFile } from '../utils'
import { useExplorerData } from './useExplorerData'
import { useQueryExecution } from './useQueryExecution'
import { elasticListIndices } from '../../../services/tauriClient'
import {
  filterConnections,
  groupConnectionsByTag,
  getRecentConnections,
  duplicateProfile,
  exportProfileSafe,
} from '../domain/connection-management/service'
import { hasCapability, defaultConnectorRegistry } from '../domain/connector-runtime'
import { hasCapabilityWithAdapter } from '../domain/connector-runtime/adapters'

interface OpenedTableTab {
  id: string
  label: string
}

/** Check if a connection type is ES-like (elasticsearch adapter). */
function isElasticsearchLike(type: string): boolean {
  return hasCapability(defaultConnectorRegistry, type, 'run-query') && type === 'elasticsearch'
}

export interface DataExplorerOrchestratorResult {
  search: string
  setSearch: (value: string) => void
  items: ConnectionProfile[]
  upsert: (profile: ConnectionProfile) => void
  remove: (id: string) => void
  filtered: ConnectionProfile[]
  groupedConnections: Record<string, ConnectionProfile[]>
  recentConnections: ConnectionProfile[]
  selectedConnection: ConnectionProfile | null
  selectedConnectionId: string | null
  expandedConnectionId: string | null
  selectedTreeNode: string | null
  expandedTreePaths: string[]
  connectionStatuses: Record<string, ConnectionStatus>
  isAddModalOpen: boolean
  editingId: string | null
  contextMenu: ContextMenuState | null
  contextMenuRef: React.RefObject<HTMLDivElement | null>
  isDetailsPanelOpen: boolean
  elasticPanel: ElasticPanel
  selectedElasticIndex: string | null
  elasticIndices: Record<string, ElasticIndex[]>
  elasticIndicesError: Record<string, string>
  openedElasticTabs: ElasticIndexTab[]
  activeElasticTabId: string | null
  openedTableTabs: OpenedTableTab[]
  activeTableTabId: string | null
  isSqlTableListView: boolean
  tableInfoTab: 'data' | 'structure' | 'indexes' | 'relationships'
  queryResultTab: 'results' | 'messages' | 'statistics'
  lastRefreshedAt: string
  sidebarWidth: number
  isResizing: boolean
  explorerData: ReturnType<typeof useExplorerData>
  queryExecution: ReturnType<typeof useQueryExecution>
  detailsStats: DetailStat[]
  openCreateWizard: () => void
  handleConnectionSelectionChange: (id: string | null) => void
  handleOpenEditModal: (itemId: string) => void
  handleDuplicateConnection: (itemId: string) => void
  handleExportConnection: (itemId: string) => void
  handleRefreshConnection: (itemId: string) => Promise<void>
  handleCloseConnection: (itemId: string) => void
  handleSaveConnection: (profile: ConnectionProfile) => void
  handleToggleTreeNode: (path: string) => void
  handleFetchDatabaseDetails: (dbName: string) => void
  wrappedHandleTreeNodeClick: (nodeLabel: string, databaseName?: string, nodePath?: string) => void
  handleCloseTableTab: (tabId: string) => void
  handleActiveTableTabChange: (tabId: string) => void
  handleActiveQueryTabIdChange: (tabId: string) => void
  handleCloseElasticTab: (tabId: string) => void
  handleActiveElasticTabIdChange: (tabId: string) => void
  handleResizeStart: (e: React.MouseEvent) => void
  handleRetryElasticIndices: (connectionId: string) => void
  handleDeleteConnection: (itemId: string) => void
  handleCloseAddModal: () => void
  setExpandedConnectionId: (id: string | null) => void
  setContextMenu: (state: ContextMenuState | null) => void
  setSelectedTreeNode: (node: string | null) => void
  setElasticPanel: (panel: ElasticPanel) => void
  setSelectedElasticIndex: (index: string | null) => void
  setIsDetailsPanelOpen: React.Dispatch<React.SetStateAction<boolean>>
  setIsSqlTableListView: (view: boolean) => void
  setTableInfoTab: (tab: 'data' | 'structure' | 'indexes' | 'relationships') => void
  setQueryResultTab: (tab: 'results' | 'messages' | 'statistics') => void
  setOpenedElasticTabs: React.Dispatch<React.SetStateAction<ElasticIndexTab[]>>
  setActiveElasticTabId: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedConnectionId: React.Dispatch<React.SetStateAction<string | null>>
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>
  setIsAddModalOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export function useDataExplorerOrchestrator(): DataExplorerOrchestratorResult {
  const search = useConnectionStore((state) => state.search)
  const setSearch = useConnectionStore((state) => state.setSearch)
  const items = useConnectionStore((state) => state.items)
  const upsert = useConnectionStore((state) => state.upsert)
  const remove = useConnectionStore((state) => state.remove)

  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [expandedConnectionId, setExpandedConnectionId] = useState<string | null>(null)
  const [selectedTreeNode, setSelectedTreeNode] = useState<string | null>(null)
  const [expandedTreePaths, setExpandedTreePaths] = useState<string[]>([])
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, ConnectionStatus>>({})
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date().toLocaleTimeString())
  const [tableInfoTab, setTableInfoTab] = useState<'data' | 'structure' | 'indexes' | 'relationships'>('data')
  const [queryResultTab, setQueryResultTab] = useState<'results' | 'messages' | 'statistics'>('results')
  const [openedTableTabs, setOpenedTableTabs] = useState<OpenedTableTab[]>([])
  const [activeTableTabId, setActiveTableTabId] = useState<string | null>(null)
  const [isSqlTableListView, setIsSqlTableListView] = useState(false)
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false)
  const [elasticPanel, setElasticPanel] = useState<ElasticPanel>('cluster')
  const [selectedElasticIndex, setSelectedElasticIndex] = useState<string | null>(null)
  const [elasticIndices, setElasticIndices] = useState<Record<string, ElasticIndex[]>>({})
  const [elasticIndicesError, setElasticIndicesError] = useState<Record<string, string>>({})
  const [openedElasticTabs, setOpenedElasticTabs] = useState<ElasticIndexTab[]>([])
  const [activeElasticTabId, setActiveElasticTabId] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [isResizing, setIsResizing] = useState(false)

  // ── Derived state (via domain services) ──────────────────────────

  const filtered = useMemo(() => filterConnections(items, search), [items, search])
  const groupedConnections = useMemo(() => groupConnectionsByTag(filtered), [filtered])
  const recentConnections = useMemo(() => getRecentConnections(items, 5), [items])

  const selectedConnection = useMemo(
    () => items.find((item) => item.id === selectedConnectionId) ?? null,
    [items, selectedConnectionId],
  )

  // ── Fetch Elasticsearch indices when an ES connection is expanded ──
  useEffect(() => {
    if (!expandedConnectionId) return
    const conn = items.find((item) => item.id === expandedConnectionId)
    if (!conn || !isElasticsearchLike(conn.type)) return

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
        setElasticIndicesError((prev) => {
          const next = { ...prev }
          delete next[conn.id]
          return next
        })
        setElasticIndices((prev) => ({
          ...prev,
          [conn.id]: indices ?? [],
        }))
      })
      .catch((err) => {
        setElasticIndicesError((prev) => ({
          ...prev,
          [conn.id]: err instanceof Error ? err.message : String(err),
        }))
      })
  }, [expandedConnectionId, items])

  // ── Elasticsearch indices retry handler ───────────────────────────
  const handleRetryElasticIndices = useCallback((connectionId: string) => {
    const conn = items.find((item) => item.id === connectionId)
    if (!conn || !isElasticsearchLike(conn.type)) return

    const payload = {
      type: conn.type,
      host: conn.host,
      port: conn.port,
      database: conn.database ?? '',
      username: conn.username,
      password: conn.password,
      ssl: conn.ssl ?? false,
    }

    setElasticIndicesError((prev) => {
      const next = { ...prev }
      delete next[conn.id]
      return next
    })

    elasticListIndices(payload)
      .then((indices) => {
        setElasticIndices((prev) => ({
          ...prev,
          [conn.id]: indices ?? [],
        }))
      })
      .catch((err) => {
        setElasticIndicesError((prev) => ({
          ...prev,
          [conn.id]: err instanceof Error ? err.message : String(err),
        }))
      })
  }, [items])

  // ── Sidebar resize handlers ──────────────────────────────────────

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

  // ── Hooks ────────────────────────────────────────────────────────

  const explorerData = useExplorerData({
    expandedConnectionId,
    selectedConnection,
    setConnectionStatuses,
  })

  const queryExecution = useQueryExecution({
    selectedConnection,
    selectedSchema: explorerData.selectedSchema,
    selectedDatabase: explorerData.selectedDatabase,
    setConnectionStatuses,
  })

  // Detail stats
  const detailsStats = useMemo((): DetailStat[] => {
    if (explorerData.realDbStats.length > 0) return explorerData.realDbStats
    if (!selectedConnection) return []
    return [
      { label: 'Status', value: connectionStatuses[selectedConnection.id] ?? 'disconnected' },
    ]
  }, [explorerData.realDbStats, selectedConnection, connectionStatuses])

  // ── Handlers ─────────────────────────────────────────────────────

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
    upsert(duplicateProfile(item))
  }

  const handleExportConnection = (itemId: string) => {
    const item = items.find((profile) => profile.id === itemId)
    if (!item) return
    const exported = exportProfileSafe(item)
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

    // Use capability check instead of raw type branching
    if (hasCapabilityWithAdapter(item.type, 'connect')) {
      await explorerData.refreshConnectionData(item.id, item)
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
      queryExecution.openQueryTabFromTree(databaseName)
      setIsSqlTableListView(false)
      return
    }

    // Use capability check instead of raw `type === 'postgresql' || type === 'mysql'`
    if (
      nodePath?.endsWith('/Tables') &&
      selectedConnection &&
      hasCapabilityWithAdapter(selectedConnection.type, 'load-navigation-tree')
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
        void explorerData.fetchSqlTableList(selectedConnection, targetDatabase, targetSchema)
        queryExecution.onQueryDatabaseChange(targetDatabase)
        queryExecution.onQuerySchemaChange(targetSchema || '')
      }

      return
    }

    // Handle elasticsearch sidebar navigation — use capability check
    if (selectedConnection && isElasticsearchLike(selectedConnection.type)) {
      if (nodePath?.startsWith('Indices/')) {
        setElasticPanel('documents')
        setSelectedElasticIndex(nodeLabel)
        setSelectedTreeNode(nodeLabel)
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
        setActiveElasticTabId(null)
        return
      }
    }

    setSelectedTreeNode(nodeLabel)
    const isTable = explorerData.handleTreeNodeClick(nodeLabel, databaseName)
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
      const treeData = explorerData.treeDataMap[selectedConnection?.id ?? '']
      if (treeData) {
        if (selectedConnection?.type === 'postgresql') {
          for (const db of treeData.databases) {
            for (const schema of db.schemas) {
              if (schema.tables.includes(nodeLabel)) {
                queryExecution.onQueryDatabaseChange(db.name)
                queryExecution.onQuerySchemaChange(schema.name)
                break
              }
            }
          }
        } else if (selectedConnection?.type === 'mysql') {
          for (const db of treeData.databases) {
            const allTables = db.schemas[0]?.tables ?? []
            if (allTables.includes(nodeLabel)) {
              queryExecution.onQueryDatabaseChange(db.name)
              queryExecution.onQuerySchemaChange('')
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
          explorerData.handleTreeNodeClick(fallbackTab.label)
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
    explorerData.handleTreeNodeClick(targetTab.label)
    setTableInfoTab('data')
  }

  const handleActiveQueryTabIdChange = (tabId: string) => {
    setActiveTableTabId(null)
    setIsSqlTableListView(false)
    queryExecution.setActiveQueryTabId(tabId)
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

  return {
    search,
    setSearch,
    items,
    upsert,
    remove,
    filtered,
    groupedConnections,
    recentConnections,
    selectedConnection,
    selectedConnectionId,
    expandedConnectionId,
    selectedTreeNode,
    expandedTreePaths,
    connectionStatuses,
    isAddModalOpen,
    editingId,
    contextMenu,
    contextMenuRef,
    isDetailsPanelOpen,
    elasticPanel,
    selectedElasticIndex,
    elasticIndices,
    elasticIndicesError,
    openedElasticTabs,
    activeElasticTabId,
    openedTableTabs,
    activeTableTabId,
    isSqlTableListView,
    tableInfoTab,
    queryResultTab,
    lastRefreshedAt,
    sidebarWidth,
    isResizing,
    explorerData,
    queryExecution,
    detailsStats,
    openCreateWizard,
    handleConnectionSelectionChange,
    handleOpenEditModal,
    handleDuplicateConnection,
    handleExportConnection,
    handleRefreshConnection,
    handleCloseConnection,
    handleSaveConnection,
    handleToggleTreeNode,
    handleFetchDatabaseDetails,
    wrappedHandleTreeNodeClick,
    handleCloseTableTab,
    handleActiveTableTabChange,
    handleActiveQueryTabIdChange,
    handleCloseElasticTab,
    handleActiveElasticTabIdChange,
    handleResizeStart,
    handleRetryElasticIndices,
    setExpandedConnectionId,
    setContextMenu,
    setSelectedTreeNode,
    setElasticPanel,
    setSelectedElasticIndex,
    setIsDetailsPanelOpen,
    setIsSqlTableListView,
    setTableInfoTab,
    setQueryResultTab,
    setOpenedElasticTabs,
    setActiveElasticTabId,
    setSelectedConnectionId,
    setEditingId,
    setIsAddModalOpen,
    handleDeleteConnection: (itemId: string) => {
      remove(itemId)
      if (selectedConnectionId === itemId) setSelectedConnectionId(null)
      if (expandedConnectionId === itemId) setExpandedConnectionId(null)
    },
    handleCloseAddModal: () => {
      setEditingId(null)
      setIsAddModalOpen(false)
    },
  }
}