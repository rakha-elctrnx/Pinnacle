/**
 * Data Explorer Orchestrator — thin page-level hook
 *
 * Phase 2: Uses registry capability checks instead of raw type string
 * branching for SQL and Elasticsearch dispatch. Adapter layer provides
 * the runtime implementation behind each capability.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConnectionStore } from '../../../state/connectionStore'
import type { ConnectionProfile } from '../../../types/domain'
import { showExportSaveDialog } from '../../../services/tauriClient'
// Elasticsearch
import type { ElasticIndex } from '../../../types/elasticsearch'
import { elasticListIndices } from '../../../services/clients/elasticsearch'
// SQL 
import { estimateTableExport, executeTableExport } from '../../../services/clients/sql'
import type { TableExportProgressEvent } from '../../../services/clients/sql'
// OTHER
import type { ConnectionStatus, ContextMenuState, DataOperationTarget, DeleteTableTarget, DetailStat, TableExportEstimate, TableExportJob, TableExportOptions, TableExportTarget, RecentTableExport } from '../types'
import type { ElasticPanel, ElasticIndexTab } from '../components/db/elasticsearch/ElasticExplorerWorkspace'
import { downloadTextFile, getConnPayload } from '../utils'
import { useExplorerData } from './useExplorerData'
import { useQueryExecution } from './useQueryExecution'
import { listen } from '@tauri-apps/api/event'
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

// ── Recent export history (localStorage) ────────────────────────

const RECENT_EXPORTS_KEY = 'pinnacle_recent_table_exports'
const MAX_RECENT_EXPORTS = 10

function loadRecentExports(): RecentTableExport[] {
  try {
    const raw = localStorage.getItem(RECENT_EXPORTS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as RecentTableExport[]
  } catch {
    return []
  }
}

function persistRecentExports(exports: RecentTableExport[]) {
  try {
    localStorage.setItem(RECENT_EXPORTS_KEY, JSON.stringify(exports.slice(0, MAX_RECENT_EXPORTS)))
  } catch {
    // Ignore storage failures
  }
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
  elasticLoading: Record<string, boolean>
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
  deleteTableTarget: DeleteTableTarget | null
  handleRequestDeleteTable: (tableName: string) => void
  handleRequestDeleteTableFromMenu: (connectionId: string, tableName: string) => void
  handleCloseDeleteTableModal: () => void
  dataOperationTarget: DataOperationTarget | null
  handleRequestDataOperation: (tableName: string, operation: 'empty' | 'truncate') => void
  handleRequestDataOperationFromMenu: (connectionId: string, tableName: string, operation: 'empty' | 'truncate') => void
  handleCloseDataOperationModal: () => void
  setExpandedConnectionId: (id: string | null) => void
  // ── Table export ──
  exportModalTarget: TableExportTarget | null
  exportEstimate: TableExportEstimate
  exportJob: TableExportJob
  recentExports: RecentTableExport[]
  handleRequestExport: (tableName: string) => void
  handleRequestExportFromMenu: (connectionId: string, tableName: string) => void
  handleSubmitExport: (target: TableExportTarget, options: TableExportOptions) => Promise<void>
  handleUseRecentExport: (recent: RecentTableExport) => void
  handleCloseExportModal: () => void
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
  const [elasticLoading, setElasticLoading] = useState<Record<string, boolean>>({})
  const [openedElasticTabs, setOpenedElasticTabs] = useState<ElasticIndexTab[]>([])
  const [activeElasticTabId, setActiveElasticTabId] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [isResizing, setIsResizing] = useState(false)
  const [deleteTableTarget, setDeleteTableTarget] = useState<DeleteTableTarget | null>(null)
  const [dataOperationTarget, setDataOperationTarget] = useState<DataOperationTarget | null>(null)

  // ── Export state ───────────────────────────────────────────────
  const [exportModalTarget, setExportModalTarget] = useState<TableExportTarget | null>(null)
  const [exportEstimate, setExportEstimate] = useState<TableExportEstimate>({
    rowCount: null, estimatedSizeBytes: null, loading: false, error: null,
  })
  const [exportJob, setExportJob] = useState<TableExportJob>({
    status: 'idle', progress: null, savedPath: null, error: null,
  })
  const [recentExports, setRecentExports] = useState<RecentTableExport[]>(() => loadRecentExports())
  const exportProgressUnlistenRef = useRef<(() => void) | null>(null)

  // ── Trigger estimate when export modal opens ─────────────────
  useEffect(() => {
    if (!exportModalTarget) return

    const conn = items.find((item) => item.id === exportModalTarget.connectionId)
    if (!conn) return

    const payload = { ...getConnPayload(conn, exportModalTarget.schema), database: exportModalTarget.database || conn.database }
    let cancelled = false

    setExportEstimate((prev) => ({ ...prev, loading: true, error: null }))

    estimateTableExport(payload, exportModalTarget.tableName)
      .then((result) => {
        if (cancelled) return
        setExportEstimate({
          rowCount: result.rowCount,
          estimatedSizeBytes: result.estimatedSizeBytes,
          loading: false,
          error: null,
        })
      })
      .catch((err) => {
        if (cancelled) return
        setExportEstimate({
          rowCount: null, estimatedSizeBytes: null, loading: false,
          error: err instanceof Error ? err.message : String(err),
        })
      })

    return () => { cancelled = true }
  }, [exportModalTarget, items])

  // ── Cleanup progress listener on unmount ──────────────────────
  useEffect(() => {
    return () => {
      exportProgressUnlistenRef.current?.()
      exportProgressUnlistenRef.current = null
    }
  }, [])

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

    let cancelled = false

    const loadElasticIndices = async () => {
      setElasticLoading((prev) => ({ ...prev, [conn.id]: true }))

      try {
        const indices = await elasticListIndices(payload)
        if (cancelled) return

        setElasticIndicesError((prev) => {
          const next = { ...prev }
          delete next[conn.id]
          return next
        })
        setElasticIndices((prev) => ({
          ...prev,
          [conn.id]: indices ?? [],
        }))
      } catch (err) {
        if (cancelled) return
        setElasticIndicesError((prev) => ({
          ...prev,
          [conn.id]: err instanceof Error ? err.message : String(err),
        }))
      } finally {
        if (!cancelled) {
          setElasticLoading((prev) => {
            const next = { ...prev }
            delete next[conn.id]
            return next
          })
        }
      }
    }

    void loadElasticIndices()

    return () => {
      cancelled = true
    }
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

    setElasticLoading((prev) => ({ ...prev, [conn.id]: true }))

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
      .finally(() => {
        setElasticLoading((prev) => {
          const next = { ...prev }
          delete next[conn.id]
          return next
        })
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

  // ── Close context menu on outside click ─────────────────────────
  useEffect(() => {
    if (!contextMenu) return

    const handlePointerDown = (e: PointerEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [contextMenu])

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

    // ── Full lifecycle reset for the closed connection ──────────────

    // 1. Clear tree expansion paths
    setExpandedTreePaths([])

    // 2. Clear explorer tree data + table detail data
    explorerData.resetConnectionData(itemId)

    // 3. Clear query execution data (tabs, result, messages)
    queryExecution.resetQueryData()

    // 4. Clear Elasticsearch index cache and loading state
    setElasticIndices((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
    setElasticIndicesError((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
    setElasticLoading((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })

    // 5. Clear open tabs
    setOpenedTableTabs([])
    setActiveTableTabId(null)
    setOpenedElasticTabs([])
    setActiveElasticTabId(null)

    // 6. Clear tree selection and panel state
    setSelectedTreeNode(null)
    setSelectedElasticIndex(null)
    setElasticPanel('cluster')
    setIsSqlTableListView(false)
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
    elasticLoading,
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
    deleteTableTarget,
    handleRequestDeleteTable: (tableName: string) => {
      if (!selectedConnection) return
      const databaseName = queryExecution.queryDatabase || explorerData.selectedDatabase || selectedConnection.database
      const schemaName =
        selectedConnection.type === 'postgresql'
          ? queryExecution.querySchema || explorerData.selectedSchema || 'public'
          : databaseName ?? ''
      setDeleteTableTarget({
        connectionId: selectedConnection.id,
        connectionName: selectedConnection.name,
        connectionType: selectedConnection.type,
        database: databaseName ?? '',
        schema: schemaName ?? '',
        tableName,
      })
    },
    handleRequestDeleteTableFromMenu: (connectionId: string, tableName: string) => {
      const conn = items.find((item) => item.id === connectionId)
      if (!conn) return
      const databaseName = conn.database ?? ''
      const schemaName = conn.type === 'postgresql' ? 'public' : databaseName
      setDeleteTableTarget({
        connectionId: conn.id,
        connectionName: conn.name,
        connectionType: conn.type,
        database: databaseName,
        schema: schemaName,
        tableName,
      })
    },
    handleCloseDeleteTableModal: () => {
      setDeleteTableTarget(null)
    },
    dataOperationTarget,
    handleRequestDataOperation: (tableName: string, operation: 'empty' | 'truncate') => {
      if (!selectedConnection) return
      const databaseName = queryExecution.queryDatabase || explorerData.selectedDatabase || selectedConnection.database
      const schemaName =
        selectedConnection.type === 'postgresql'
          ? queryExecution.querySchema || explorerData.selectedSchema || 'public'
          : databaseName ?? ''
      setDataOperationTarget({
        connectionId: selectedConnection.id,
        connectionName: selectedConnection.name,
        connectionType: selectedConnection.type,
        database: databaseName ?? '',
        schema: schemaName ?? '',
        tableName,
        operation,
      })
    },
    handleRequestDataOperationFromMenu: (connectionId: string, tableName: string, operation: 'empty' | 'truncate') => {
      const conn = items.find((item) => item.id === connectionId)
      if (!conn) return
      const databaseName = conn.database ?? ''
      const schemaName = conn.type === 'postgresql' ? 'public' : databaseName
      setDataOperationTarget({
        connectionId: conn.id,
        connectionName: conn.name,
        connectionType: conn.type,
        database: databaseName,
        schema: schemaName,
        tableName,
        operation,
      })
    },
    handleCloseDataOperationModal: () => {
      setDataOperationTarget(null)
    },

    // ── Table export ────────────────────────────────────────────

    exportModalTarget,
    exportEstimate,
    exportJob,
    recentExports,

    handleRequestExport: (tableName: string) => {
      if (!selectedConnection) return
      const databaseName = queryExecution.queryDatabase || explorerData.selectedDatabase || selectedConnection.database
      const schemaName =
        selectedConnection.type === 'postgresql'
          ? queryExecution.querySchema || explorerData.selectedSchema || 'public'
          : databaseName ?? ''
      setExportModalTarget({
        connectionId: selectedConnection.id,
        connectionName: selectedConnection.name,
        connectionType: selectedConnection.type,
        database: databaseName ?? '',
        schema: schemaName ?? '',
        tableName,
      })
      setExportEstimate({ rowCount: null, estimatedSizeBytes: null, loading: false, error: null })
      setExportJob({ status: 'idle', progress: null, savedPath: null, error: null })
    },

    handleRequestExportFromMenu: (connectionId: string, tableName: string) => {
      const conn = items.find((item) => item.id === connectionId)
      if (!conn) return
      const databaseName = conn.database ?? ''
      const schemaName = conn.type === 'postgresql' ? 'public' : databaseName
      setExportModalTarget({
        connectionId: conn.id,
        connectionName: conn.name,
        connectionType: conn.type,
        database: databaseName,
        schema: schemaName,
        tableName,
      })
      setExportEstimate({ rowCount: null, estimatedSizeBytes: null, loading: false, error: null })
      setExportJob({ status: 'idle', progress: null, savedPath: null, error: null })
    },

    handleSubmitExport: async (target: TableExportTarget, options: TableExportOptions) => {
      const conn = items.find((item) => item.id === target.connectionId)
      if (!conn) {
        setExportJob({ status: 'error', progress: null, savedPath: null, error: 'Connection not found' })
        return
      }

      // 1. Show native save dialog with suggested filename
      const ext = options.format === 'xlsx' ? 'xlsx' : options.format
      const nameParts = [target.connectionName, target.database, target.schema, target.tableName]
        .filter(Boolean)
        .map((p) => p.replaceAll(/[^a-zA-Z0-9_-]/g, '_'))
      const suggestedName = `${nameParts.join('_')}.${ext}`

      const savePath = await showExportSaveDialog(suggestedName)
      if (!savePath) {
        // User cancelled the save dialog
        return
      }

      // 2. Set loading state
      setExportJob({ status: 'exporting', progress: 0, savedPath: null, error: null })

      // 3. Listen for progress events
      const unlisten = await listen<TableExportProgressEvent>('export://progress', (event) => {
        const progress = event.payload
        if (progress.totalRows > 0) {
          const pct = Math.round((progress.rowsExported / progress.totalRows) * 100)
          setExportJob((prev) => ({ ...prev, progress: pct }))
        }
        if (progress.error) {
          setExportJob({
            status: 'error', progress: null, savedPath: null,
            error: progress.error,
          })
        }
      })
      exportProgressUnlistenRef.current = unlisten

      // 4. Build payload for Rust command (convert frontend values to Rust-expected format)
      const connection = { ...getConnPayload(conn, target.schema), database: target.database || conn.database }
      const rustFormat = options.format.toUpperCase()
      const rustEncoding = options.encoding === 'utf-8' ? 'UTF8' : options.encoding === 'utf-16' ? 'UTF16' : 'ASCII'
      const rustSqlMode = options.sqlMode === 'data-only' ? 'dataOnly' : options.sqlMode === 'schema-only' ? 'schemaOnly' : 'schemaAndData'
      const payload = {
        connection,
        tableName: target.tableName,
        format: rustFormat,
        options: {
          includeHeaders: options.includeHeaders,
          delimiter: options.format === 'txt' ? options.txtDelimiter : null,
          encoding: rustEncoding,
          sqlMode: rustSqlMode,
        },
        savePath,
      }

      try {
        const result = await executeTableExport(payload)

        // 5. Cleanup progress listener
        unlisten()
        exportProgressUnlistenRef.current = null

        if (result.success) {
          const savedFilePath = result.filePath ?? savePath
          const record: RecentTableExport = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            target,
            options,
            savedPath: savedFilePath,
          }
          setRecentExports((prev) => {
            const next = [record, ...prev].slice(0, MAX_RECENT_EXPORTS)
            persistRecentExports(next)
            return next
          })
          setExportJob({ status: 'success', progress: 100, savedPath: savedFilePath, error: null })
        } else {
          setExportJob({
            status: 'error', progress: null, savedPath: null,
            error: result.error ?? 'Export failed',
          })
        }
      } catch (err) {
        // Cleanup progress listener on error
        unlisten()
        exportProgressUnlistenRef.current = null

        setExportJob({
          status: 'error', progress: null, savedPath: null,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },

    handleUseRecentExport: (recent: RecentTableExport) => {
      setExportModalTarget(recent.target)
      setExportEstimate({ rowCount: null, estimatedSizeBytes: null, loading: false, error: null })
      setExportJob({ status: 'idle', progress: null, savedPath: null, error: null })
    },

    handleCloseExportModal: () => {
      setExportModalTarget(null)
      setExportJob({ status: 'idle', progress: null, savedPath: null, error: null })
    },
  }
}