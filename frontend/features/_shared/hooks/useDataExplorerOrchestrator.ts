/**
 * Data Explorer Orchestrator — thin page-level hook
 *
 * Phase 2: Uses registry capability checks instead of raw type string
 * branching for SQL and Elasticsearch dispatch. Adapter layer provides
 * the runtime implementation behind each capability.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConnectionStore } from '../store/connectionStore'
import { useFolderStore } from '../store/folderStore'
import { useTabStore, type TabPageType } from '../store/tabStore'
import type { ConnectionProfile, Folder } from '../types/domain'
import {
  showExportSaveDialog,
  getConnectionPassword,
} from '../services/tauriClient'
// Elasticsearch
import type { ElasticIndex } from '../../elasticsearch/types/elasticsearch'
import { elasticListIndices } from '../../elasticsearch/clients/elasticsearch'
// SQL
import {
  estimateTableExport,
  executeTableExport,
  sqlRollbackTransaction,
} from '../../sql/clients/sql'
import type { TableExportProgressEvent } from '../../sql/clients/sql'
// OTHER
import type {
  ConnectionStatus,
  ContextMenuState,
  DataOperationTarget,
  DeleteTableTarget,
  DetailStat,
  TableExportEstimate,
  TableExportJob,
  TableExportOptions,
  TableExportTarget,
  RecentTableExport,
} from '../types/shared'
import { downloadTextFile, getConnPayload } from '../utils'
import { useExplorerData } from '../../sql/hooks/useExplorerData'
import { useQueryExecution } from '../../sql/hooks/useQueryExecution'
import { listen } from '@tauri-apps/api/event'
import {
  filterConnections,
  groupConnectionsByFolder,
  getRecentConnections,
  duplicateProfile,
  exportProfileSafe,
  migrateGroupByTag,
} from '../connection-management/service'
import { hasCapability, defaultConnectorRegistry } from '../connector-runtime'
import { hasCapabilityWithAdapter } from '../connector-runtime/adapters'

interface OpenedTableTab {
  id: string
  label: string
  /** Full tree path for path-based selection, e.g. "mydb/public/Tables/users" */
  nodePath?: string
}
/** Elasticsearch panel types */
type ElasticPanel = 'cluster' | 'indices' | 'query'

/** Check if a connection type is ES-like (elasticsearch adapter). */
function isElasticsearchLike(type: string): boolean {
  return (
    hasCapability(defaultConnectorRegistry, type, 'run-query') &&
    type === 'elasticsearch'
  )
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
    localStorage.setItem(
      RECENT_EXPORTS_KEY,
      JSON.stringify(exports.slice(0, MAX_RECENT_EXPORTS)),
    )
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
  // ── Folder management ──
  folders: Folder[]
  handleCreateFolder: (name: string) => string
  handleRenameFolder: (id: string, name: string) => void
  handleDeleteFolder: (id: string) => void
  handleMoveConnectionToFolder: (connectionId: string, folderId: string | null) => void
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
  elasticIndices: Record<string, ElasticIndex[]>
  elasticIndicesError: Record<string, string>
  elasticLoading: Record<string, boolean>
  openedTableTabs: OpenedTableTab[]
  tableInfoTab: 'data' | 'structure' | 'indexes' | 'relationships'
  queryResultTab: 'results' | 'messages' | 'statistics'
  lastRefreshedAt: string
  sidebarWidth: number
  isResizing: boolean
  explorerData: ReturnType<typeof useExplorerData>
  queryExecution: ReturnType<typeof useQueryExecution>
  detailsStats: DetailStat[]
  openCreateConnection: () => void
  handleConnectionSelectionChange: (id: string | null) => void
  openConnectionFromUrl: (id: string) => void
  handleOpenEditModal: (itemId: string) => void
  handleDuplicateConnection: (itemId: string) => void
  handleExportConnection: (itemId: string) => void
  handleRefreshConnection: (itemId: string) => Promise<void>
  handleCloseConnection: (itemId: string) => void
  handleSaveConnection: (
    profile: ConnectionProfile,
    password?: string,
    sshPassword?: string,
    keyPassphrase?: string,
  ) => void
  handleToggleTreeNode: (path: string) => void
  handleFetchDatabaseDetails: (dbName: string) => void
  wrappedHandleTreeNodeClick: (
    nodeLabel: string,
    databaseName?: string,
    nodePath?: string,
  ) => void
  handleCloseTableTab: (tabId: string) => void
  handleActiveTableTabChange: (tabId: string) => void
  handleRetryElasticIndices: (connectionId: string) => void
  handleDeleteConnection: (itemId: string) => void
  deleteConnectionTarget: { id: string; name: string } | null
  handleConfirmDeleteConnection: (connectionId: string) => Promise<void>
  handleCloseDeleteConnectionModal: () => void
  handleCloseAddModal: () => void
  connectionModalNonce: number
  deleteTableTarget: DeleteTableTarget | null
  handleRequestDeleteTable: (tableName: string) => void
  handleRequestDeleteTableFromMenu: (
    connectionId: string,
    tableName: string,
  ) => void
  handleCloseDeleteTableModal: () => void
  dataOperationTarget: DataOperationTarget | null
  handleRequestDataOperation: (
    tableName: string,
    operation: 'empty' | 'truncate',
  ) => void
  handleRequestDataOperationFromMenu: (
    connectionId: string,
    tableName: string,
    operation: 'empty' | 'truncate',
  ) => void
  handleCloseDataOperationModal: () => void
  setExpandedConnectionId: (id: string | null) => void
  // ── Table export ──
  exportModalTarget: TableExportTarget | null
  exportEstimate: TableExportEstimate
  exportJob: TableExportJob
  recentExports: RecentTableExport[]
  handleRequestExport: (tableName: string) => void
  handleRequestExportFromMenu: (connectionId: string, tableName: string) => void
  handleSubmitExport: (
    target: TableExportTarget,
    options: TableExportOptions,
  ) => Promise<void>
  handleUseRecentExport: (recent: RecentTableExport) => void
  handleCloseExportModal: () => void
  setContextMenu: (state: ContextMenuState | null) => void
  setSelectedTreeNode: (node: string | null) => void
  focusedNodePath: string | null
  setFocusedNodePath: (path: string | null) => void
  setTableInfoTab: (
    tab: 'data' | 'structure' | 'indexes' | 'relationships',
  ) => void
  setQueryResultTab: (tab: 'results' | 'messages' | 'statistics') => void
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
  const refreshStore = useConnectionStore((state) => state.refresh)

  const navigate = useNavigate()

  // ── Folder store ──────────────────────────────────────────────
  const folders = useFolderStore((s) => s.items)
  const folderCreate = useFolderStore((s) => s.create)
  const folderRename = useFolderStore((s) => s.rename)
  const folderRemove = useFolderStore((s) => s.remove)
  const folderRefresh = useFolderStore((s) => s.refresh)

  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null)
  const [expandedConnectionId, setExpandedConnectionId] = useState<
    string | null
  >(null)
  const [selectedTreeNode, setSelectedTreeNode] = useState<string | null>(null)
  const [expandedTreePaths, setExpandedTreePaths] = useState<string[]>([])
  const [focusedNodePath, setFocusedNodePath] = useState<string | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [connectionModalNonce, setConnectionModalNonce] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [connectionStatuses, setConnectionStatuses] = useState<
    Record<string, ConnectionStatus>
  >({})
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() =>
    new Date().toLocaleTimeString(),
  )
  const [tableInfoTab, setTableInfoTab] = useState<
    'data' | 'structure' | 'indexes' | 'relationships'
  >('data')
  const [queryResultTab, setQueryResultTab] = useState<
    'results' | 'messages' | 'statistics'
  >('results')
  const [openedTableTabs, setOpenedTableTabs] = useState<OpenedTableTab[]>([])
  const [activeTableTabId, setActiveTableTabId] = useState<string | null>(null)
  const [isDetailsPanelOpen, _setIsDetailsPanelOpen] = useState(false)
  const [elasticIndices, setElasticIndices] = useState<
    Record<string, ElasticIndex[]>
  >({})
  const [elasticIndicesError, setElasticIndicesError] = useState<
    Record<string, string>
  >({})
  const [elasticLoading, setElasticLoading] = useState<Record<string, boolean>>(
    {},
  )
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [isResizing, setIsResizing] = useState(false)
  const [deleteTableTarget, setDeleteTableTarget] =
    useState<DeleteTableTarget | null>(null)
  const [deleteConnectionTarget, setDeleteConnectionTarget] = useState<{
    id: string
    name: string
  } | null>(null)
  const [dataOperationTarget, setDataOperationTarget] =
    useState<DataOperationTarget | null>(null)

  // ── Export state ───────────────────────────────────────────────
  const [exportModalTarget, setExportModalTarget] =
    useState<TableExportTarget | null>(null)
  const [exportEstimate, setExportEstimate] = useState<TableExportEstimate>({
    rowCount: null,
    estimatedSizeBytes: null,
    loading: false,
    error: null,
  })
  const [exportJob, setExportJob] = useState<TableExportJob>({
    status: 'idle',
    progress: null,
    savedPath: null,
    error: null,
  })
  const [recentExports, setRecentExports] = useState<RecentTableExport[]>(() =>
    loadRecentExports(),
  )
  const exportProgressUnlistenRef = useRef<(() => void) | null>(null)

  // ── Load persisted connections from backend on startup ──────
  useEffect(() => {
    refreshStore()
  }, [refreshStore])

  // ── One-time migration: tags[0] → folderId ──────────────────
  const migrationRanRef = useRef(false)
  useEffect(() => {
    if (migrationRanRef.current || items.length === 0) return
    migrationRanRef.current = true

    const hasUnmigrated = items.some((c) => !c.folderId && c.tags[0])
    if (!hasUnmigrated) return

    const migrated = migrateGroupByTag(items, folders)

    // Persist new folders
    if (migrated.folders.length > folders.length) {
      localStorage.setItem(
        'pinnacle_folders',
        JSON.stringify(migrated.folders),
      )
      folderRefresh()
    }

    // Update connections that need folder assignment
    for (const conn of migrated.connections) {
      const old = items.find((c) => c.id === conn.id)
      if (old && old.folderId !== conn.folderId) {
        upsert(conn)
      }
    }
  }, [items])

  // ── Trigger estimate when export modal opens ─────────────────
  useEffect(() => {
    if (!exportModalTarget) return

    const conn = items.find(
      (item) => item.id === exportModalTarget.connectionId,
    )
    if (!conn) return

    let cancelled = false

    // Fetch password from keyring and add to payload
    getConnectionPassword(conn.id).then((password) => {
      const payload = {
        ...getConnPayload(conn, exportModalTarget.schema),
        database: exportModalTarget.database || conn.database,
        password,
      }

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
            rowCount: null,
            estimatedSizeBytes: null,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          })
        })
    })

    return () => {
      cancelled = true
    }
  }, [exportModalTarget, items])

  // ── Cleanup progress listener on unmount ──────────────────────
  useEffect(() => {
    return () => {
      exportProgressUnlistenRef.current?.()
      exportProgressUnlistenRef.current = null
    }
  }, [])

  // ── Derived state (via domain services) ──────────────────────────

  const filtered = useMemo(
    () => filterConnections(items, search),
    [items, search],
  )
  const groupedConnections = useMemo(
    () => groupConnectionsByFolder(filtered, folders),
    [filtered, folders],
  )
  const recentConnections = useMemo(
    () => getRecentConnections(items, 5),
    [items],
  )

  const selectedConnection = useMemo(
    () => items.find((item) => item.id === selectedConnectionId) ?? null,
    [items, selectedConnectionId],
  )

  // ── Fetch Elasticsearch indices when an ES connection is expanded ──
  useEffect(() => {
    if (!expandedConnectionId) return
    const conn = items.find((item) => item.id === expandedConnectionId)
    if (!conn || !isElasticsearchLike(conn.type)) return

    let cancelled = false

    const loadElasticIndices = async () => {
      setElasticLoading((prev) => ({ ...prev, [conn.id]: true }))

      // Fetch password from keyring
      const password = conn.passwordRef
        ? await getConnectionPassword(conn.id)
        : ''

      const payload = {
        type: conn.type,
        host: conn.host,
        port: conn.port,
        database: conn.database ?? '',
        username: conn.username,
        password,
        ssl: conn.ssl ?? false,
      }

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
  const handleRetryElasticIndices = useCallback(
    (connectionId: string) => {
      const conn = items.find((item) => item.id === connectionId)
      if (!conn || !isElasticsearchLike(conn.type)) return

      setElasticIndicesError((prev) => {
        const next = { ...prev }
        delete next[conn.id]
        return next
      })

      setElasticLoading((prev) => ({ ...prev, [conn.id]: true }))

      // Fetch password from keyring
      getConnectionPassword(conn.id).then((password) => {
        const payload = {
          type: conn.type,
          host: conn.host,
          port: conn.port,
          database: conn.database ?? '',
          username: conn.username,
          password,
          ssl: conn.ssl ?? false,
        }

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
      })
    },
    [items],
  )

  // ── Sidebar resize handlers ──────────────────────────────────────

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
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
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
    onQueryTabChange: setQueryResultTab,
  })

  // Detail stats
  const detailsStats = useMemo((): DetailStat[] => {
    if (explorerData.realDbStats.length > 0) return explorerData.realDbStats
    if (!selectedConnection) return []
    return [
      {
        label: 'Status',
        value: connectionStatuses[selectedConnection.id] ?? 'disconnected',
      },
    ]
  }, [explorerData.realDbStats, selectedConnection, connectionStatuses])

  // ── Handlers ─────────────────────────────────────────────────────

  const openCreateConnection = () => {
    setEditingId(null)
    setIsAddModalOpen(true)
    setConnectionModalNonce((n) => n + 1)
  }

  const handleConnectionSelectionChange = (id: string | null) => {
    setSelectedConnectionId(id)
    setOpenedTableTabs([])
    setActiveTableTabId(null)
    setSelectedTreeNode(null)
    explorerData.setSelectedTable(null)
  }

  // Open a connection reached via URL/search (not a sidebar tree click):
  // expand its tree node + fetch data. Sidebar clicks expand via
  // handleConnectionToggle, so this stays out of that path to avoid a
  // double-toggle (expand then collapse) regression.
  const openConnectionFromUrl = (id: string) => {
    const profile = items.find((item) => item.id === id)
    if (!profile) return
    const group = profile.tags[0] || 'Ungrouped'
    const connectionPath = `${group}/${profile.name}`

    setExpandedTreePaths((prev) => {
      if (prev.includes(connectionPath)) return prev
      const next = prev.slice()
      if (!next.includes(group)) next.push(group)
      next.push(connectionPath)
      return next
    })

    if (hasCapabilityWithAdapter(profile.type, 'connect')) {
      const treeData = explorerData.treeDataMap[id]
      if (!treeData) {
        explorerData.refreshConnectionData(id, profile)
      } else if (treeData.databases?.[0]) {
        explorerData.fetchDatabaseDetails(id, profile, treeData.databases[0].name)
      }
    } else if (isElasticsearchLike(profile.type)) {
      setExpandedConnectionId(id)
    }
  }

  const handleOpenEditModal = (itemId: string) => {
    setEditingId(itemId)
    setIsAddModalOpen(true)
    setConnectionModalNonce((n) => n + 1)
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

    if (expandedConnectionId === itemId) {
      setExpandedConnectionId(null)
    }

    // ── Full lifecycle reset for the closed connection ──────────────

    // 1. Clear tree expansion paths
    setExpandedTreePaths([])

    // 2. Clear explorer tree data + table detail data
    explorerData.resetConnectionData(itemId)

    // 2a. Rollback any open transaction for this connection
    if (queryExecution.activeTransactionId) {
      const conn = selectedConnection
      if (conn) {
        // Build a lightweight payload for rollback + ignore errors (idempotent)
        getConnectionPassword(conn.id).then((password) => {
          const payload = {
            type: conn.type,
            host: conn.host,
            port: conn.port,
            database: conn.database ?? '',
            username: conn.username,
            password,
            ssl: conn.ssl ?? false,
            sslConfig: conn.sslConfig,
          }
          sqlRollbackTransaction(
            payload,
            queryExecution.activeTransactionId!,
          ).catch(() => {
            /* idempotent — ignore */
          })
        })
      }
    }
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

    // 5. Clear local table/elastic sub-tabs and tree selection
    setOpenedTableTabs([])
    setActiveTableTabId(null)
    explorerData.setSelectedTable(null)

    // 6. Close ALL global tabs belonging to this connection
    //    (connection tab + child tabs like tables, queries, indices).
    useTabStore.getState().closeTabsByConnectionId(itemId)

    if (selectedConnectionId === itemId) {
      const nextActiveId = useTabStore.getState().activeTabId ?? null
      setSelectedConnectionId(nextActiveId)
    }
  }

  const handleSaveConnection = (
    profile: ConnectionProfile,
    password?: string,
    sshPassword?: string,
    keyPassphrase?: string,
  ) => {
    upsert(profile, password, sshPassword, keyPassphrase)
    setConnectionStatuses((prev) => ({
      ...prev,
      [profile.id]: 'idle',
    }))
    handleConnectionSelectionChange(profile.id)
    setEditingId(null)
    setIsAddModalOpen(false)
  }

  // ── Folder CRUD handlers ──────────────────────────────────────
  const handleCreateFolder = (name: string): string => {
    return folderCreate(name)
  }

  const handleRenameFolder = (id: string, name: string) => {
    folderRename(id, name)
  }

  const handleDeleteFolder = (id: string) => {
    // Move all connections in this folder to ungrouped
    const connsToMove = items.filter((c) => c.folderId === id)
    for (const conn of connsToMove) {
      upsert({ ...conn, folderId: null })
    }
    folderRemove(id)
  }

  const handleMoveConnectionToFolder = (
    connectionId: string,
    folderId: string | null,
  ) => {
    const conn = items.find((c) => c.id === connectionId)
    if (!conn) return
    upsert({ ...conn, folderId })
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
        explorerData.fetchDatabaseDetails(
          selectedConnection.id,
          selectedConnection,
          dbName,
        )
      }
    }
  }

  /** Map sidebar label to elastic panel key */
  const ELASTIC_LABEL_TO_PANEL: Record<string, ElasticPanel> = {
    Cluster: 'cluster',
    Indices: 'indices',
    'Query Console': 'query',
  }

  const ELASTIC_PANEL_TO_ROUTE: Record<string, string> = {
    cluster: 'cluster',
    indices: 'indices',
    query: 'query',
  }

  const ELASTIC_PANEL_TO_PAGE_TYPE: Record<string, string> = {
    cluster: 'elastic-cluster',
    indices: 'elastic-indices',
    query: 'elastic-query',
  }

  const wrappedHandleTreeNodeClick = async (
    nodeLabel: string,
    databaseName?: string,
    nodePath?: string,
  ) => {
    // Use capability check instead of raw `type === 'postgresql' || type === 'mysql'`
    const isTablesNode = nodePath?.endsWith('/Tables')
    const isViewsNode = nodePath?.endsWith('/Views')
    if (
      (isTablesNode || isViewsNode) &&
      selectedConnection &&
      hasCapabilityWithAdapter(selectedConnection.type, 'load-navigation-tree')
    ) {
      const pathParts = nodePath!.split('/').filter(Boolean)
      const targetDatabase =
        databaseName || pathParts[0] || selectedConnection.database
      const targetSchema =
        selectedConnection.type === 'postgresql' && pathParts.length >= 3
          ? pathParts[pathParts.length - 2]
          : undefined

      setSelectedTreeNode(nodePath ?? null)
      setActiveTableTabId(null)

      if (targetDatabase) {
        void explorerData.fetchSqlTableList(
          selectedConnection,
          targetDatabase,
          targetSchema,
        )
        queryExecution.onQueryDatabaseChange(targetDatabase)
        queryExecution.onQuerySchemaChange(targetSchema || '')
      }

      return
    }

    // Handle elasticsearch sidebar navigation — use capability check
    // Derive connection from node path (user may click index child without selecting connection)
    const esPathName = nodePath?.split('/')[1]
    const esConn =
      selectedConnection && isElasticsearchLike(selectedConnection.type)
        ? selectedConnection
        : esPathName
          ? items.find(
              (item) =>
                item.name === esPathName && item.type === 'elasticsearch',
            )
          : null

    if (esConn && isElasticsearchLike(esConn.type)) {
      if (nodePath?.includes('/Indices/')) {
        setSelectedTreeNode(nodePath)
        // Create global tab for the elastic index with per-index route
        const globalTabId = `${esConn.id}:index:${nodeLabel}`
        useTabStore.getState().openTab({
          id: globalTabId,
          label: nodeLabel,
          type: esConn.type,
          pageType: 'elastic-index',
          route: `/elasticsearch/${esConn.id}/indices/${nodeLabel}`,
          connectionId: esConn.id,
        })
        navigate(`/elasticsearch/${esConn.id}/indices/${nodeLabel}`)
        return
      }
      if (ELASTIC_LABEL_TO_PANEL[nodeLabel]) {
        const panel = ELASTIC_LABEL_TO_PANEL[nodeLabel]
        setSelectedTreeNode(nodePath || nodeLabel)

        const routeSuffix = ELASTIC_PANEL_TO_ROUTE[panel] || panel
        const pageType = ELASTIC_PANEL_TO_PAGE_TYPE[panel] || 'elastic-cluster'
        const route = `/elasticsearch/${esConn.id}/${routeSuffix}`
        const globalTabId = `${esConn.id}:${panel}`
        useTabStore.getState().openTab({
          id: globalTabId,
          label: nodeLabel,
          type: esConn.type,
          pageType: pageType as TabPageType,
          route,
          connectionId: esConn.id,
          treePath: nodePath || undefined,
        })
        navigate(route)
        return
      }
    }
    // Set context without fetching — TableDetailPage will fetch via useEffect.
    // This avoids double-fetch: once here and once in TableDetailPage.
    const treeData = explorerData.treeDataMap[selectedConnection?.id ?? '']
    if (treeData && selectedConnection) {
      if (selectedConnection.type === 'postgresql') {
        for (const db of treeData.databases) {
          for (const schema of db.schemas) {
            if (schema.views.includes(nodeLabel)) {
              explorerData.setSelectedTable(nodeLabel)
              explorerData.setSelectedSchema(schema.name)
              explorerData.setSelectedDatabase(db.name)
              queryExecution.onQueryDatabaseChange(db.name)
              queryExecution.onQuerySchemaChange(schema.name)
              break
            }
            if (schema.tables.includes(nodeLabel)) {
              explorerData.setSelectedTable(nodeLabel)
              explorerData.setSelectedSchema(schema.name)
              explorerData.setSelectedDatabase(db.name)
              queryExecution.onQueryDatabaseChange(db.name)
              queryExecution.onQuerySchemaChange(schema.name)
              break
            }
          }
        }
      } else if (selectedConnection.type === 'mysql') {
        for (const db of treeData.databases) {
          const views = db.schemas[0]?.views ?? []
          const tables = db.schemas[0]?.tables ?? []
          if (views.includes(nodeLabel)) {
            explorerData.setSelectedTable(nodeLabel)
            explorerData.setSelectedSchema(db.name)
            explorerData.setSelectedDatabase(db.name)
            queryExecution.onQueryDatabaseChange(db.name)
            queryExecution.onQuerySchemaChange('')
            break
          }
          if (tables.includes(nodeLabel)) {
            explorerData.setSelectedTable(nodeLabel)
            explorerData.setSelectedSchema(db.name)
            explorerData.setSelectedDatabase(db.name)
            queryExecution.onQueryDatabaseChange(db.name)
            queryExecution.onQuerySchemaChange('')
            break
          }
        }
      }
    }
    // Open global tab and navigate
    if (selectedConnection) {
      const globalTabId = `${selectedConnection.id}:table:${nodeLabel}`
      const navigateRoute = `/sql/${selectedConnection.id}/tables/${encodeURIComponent(nodeLabel)}`

      // Check if we already have an internal tab for this table
      const existingTab = openedTableTabs.find((tab) => tab.label === nodeLabel)
      if (existingTab) {
        setActiveTableTabId(existingTab.id)
      } else {
        const tabId = crypto.randomUUID()
        setOpenedTableTabs((prev) => [
          ...prev,
          { id: tabId, label: nodeLabel, nodePath },
        ])
        setActiveTableTabId(tabId)
      }
      setTableInfoTab('data')

      useTabStore.getState().openTab({
        id: globalTabId,
        label: nodeLabel,
        type: selectedConnection.type,
        pageType: 'table',
        route: navigateRoute,
        connectionId: selectedConnection.id,
        treePath: nodePath,
      })
      navigate(navigateRoute)
    }
  }

  const handleCloseTableTab = (tabId: string) => {
    // Find the table name from the internal tab to remove the global tab
    const closingTab = openedTableTabs.find((t) => t.id === tabId)
    if (closingTab && selectedConnection) {
      const globalTabId = `${selectedConnection.id}:table:${closingTab.label}`
      useTabStore.getState().closeTab(globalTabId)
    }

    setOpenedTableTabs((prev) => {
      const nextTabs = prev.filter((tab) => tab.id !== tabId)

      if (activeTableTabId === tabId) {
        const fallbackTab = nextTabs[nextTabs.length - 1] ?? null
        setActiveTableTabId(fallbackTab?.id ?? null)
        if (fallbackTab) {
          setSelectedTreeNode(fallbackTab.nodePath || fallbackTab.label)
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
    setSelectedTreeNode(targetTab.nodePath || targetTab.label)
    explorerData.handleTreeNodeClick(targetTab.label)
    setTableInfoTab('data')
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
    focusedNodePath,
    connectionStatuses,
    isAddModalOpen,
    editingId,
    contextMenu,
    contextMenuRef,
    isDetailsPanelOpen,
    elasticIndices,
    elasticIndicesError,
    elasticLoading,
    openedTableTabs,
    tableInfoTab,
    queryResultTab,
    lastRefreshedAt,
    sidebarWidth,
    isResizing,
    explorerData,
    queryExecution,
    detailsStats,
    openCreateConnection,
    connectionModalNonce,
    handleConnectionSelectionChange,
    openConnectionFromUrl,
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
    folders,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleMoveConnectionToFolder,
    handleActiveTableTabChange,
    setSelectedConnectionId,
    setEditingId,
    setIsAddModalOpen,
    setExpandedConnectionId,
    setContextMenu,
    setSelectedTreeNode,
    setFocusedNodePath,
    setTableInfoTab,
    setQueryResultTab,
    handleRetryElasticIndices,
    handleDeleteConnection: (itemId: string) => {
      const conn = items.find((item) => item.id === itemId)
      setDeleteConnectionTarget({ id: itemId, name: conn?.name ?? 'Unknown' })
    },
    deleteConnectionTarget,
    handleConfirmDeleteConnection: async (connectionId: string) => {
      await remove(connectionId)
      useTabStore.getState().closeTabsByConnectionId(connectionId)
      if (selectedConnectionId === connectionId) {
        setSelectedConnectionId(useTabStore.getState().activeTabId ?? null)
      }
      if (expandedConnectionId === connectionId) setExpandedConnectionId(null)
    },
    handleCloseDeleteConnectionModal: () => {
      setDeleteConnectionTarget(null)
    },
    handleCloseAddModal: () => {
      setEditingId(null)
      setIsAddModalOpen(false)
    },
    deleteTableTarget,
    handleRequestDeleteTable: (tableName: string) => {
      if (!selectedConnection) return
      const databaseName =
        queryExecution.queryDatabase ||
        explorerData.selectedDatabase ||
        selectedConnection.database
      const schemaName =
        selectedConnection.type === 'postgresql'
          ? queryExecution.querySchema ||
            explorerData.selectedSchema ||
            'public'
          : (databaseName ?? '')
      setDeleteTableTarget({
        connectionId: selectedConnection.id,
        connectionName: selectedConnection.name,
        connectionType: selectedConnection.type,
        database: databaseName ?? '',
        schema: schemaName ?? '',
        tableName,
      })
    },
    handleRequestDeleteTableFromMenu: (
      connectionId: string,
      tableName: string,
    ) => {
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
    handleRequestDataOperation: (
      tableName: string,
      operation: 'empty' | 'truncate',
    ) => {
      if (!selectedConnection) return
      const databaseName =
        queryExecution.queryDatabase ||
        explorerData.selectedDatabase ||
        selectedConnection.database
      const schemaName =
        selectedConnection.type === 'postgresql'
          ? queryExecution.querySchema ||
            explorerData.selectedSchema ||
            'public'
          : (databaseName ?? '')
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
    handleRequestDataOperationFromMenu: (
      connectionId: string,
      tableName: string,
      operation: 'empty' | 'truncate',
    ) => {
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
      const databaseName =
        queryExecution.queryDatabase ||
        explorerData.selectedDatabase ||
        selectedConnection.database
      const schemaName =
        selectedConnection.type === 'postgresql'
          ? queryExecution.querySchema ||
            explorerData.selectedSchema ||
            'public'
          : (databaseName ?? '')
      setExportModalTarget({
        connectionId: selectedConnection.id,
        connectionName: selectedConnection.name,
        connectionType: selectedConnection.type,
        database: databaseName ?? '',
        schema: schemaName ?? '',
        tableName,
      })
      setExportEstimate({
        rowCount: null,
        estimatedSizeBytes: null,
        loading: false,
        error: null,
      })
      setExportJob({
        status: 'idle',
        progress: null,
        savedPath: null,
        error: null,
      })
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
      setExportEstimate({
        rowCount: null,
        estimatedSizeBytes: null,
        loading: false,
        error: null,
      })
      setExportJob({
        status: 'idle',
        progress: null,
        savedPath: null,
        error: null,
      })
    },

    handleSubmitExport: async (
      target: TableExportTarget,
      options: TableExportOptions,
    ) => {
      const conn = items.find((item) => item.id === target.connectionId)
      if (!conn) {
        setExportJob({
          status: 'error',
          progress: null,
          savedPath: null,
          error: 'Connection not found',
        })
        return
      }

      // 1. Show native save dialog with suggested filename
      const ext = options.format === 'xlsx' ? 'xlsx' : options.format
      const nameParts = [
        target.connectionName,
        target.database,
        target.schema,
        target.tableName,
      ]
        .filter(Boolean)
        .map((p) => p.replaceAll(/[^a-zA-Z0-9_-]/g, '_'))
      const suggestedName = `${nameParts.join('_')}.${ext}`

      const savePath = await showExportSaveDialog(suggestedName)
      if (!savePath) {
        // User cancelled the save dialog
        return
      }

      // 2. Set loading state
      setExportJob({
        status: 'exporting',
        progress: 0,
        savedPath: null,
        error: null,
      })

      // 3. Listen for progress events
      const unlisten = await listen<TableExportProgressEvent>(
        'export://progress',
        (event) => {
          const progress = event.payload
          if (progress.totalRows > 0) {
            const pct = Math.round(
              (progress.rowsExported / progress.totalRows) * 100,
            )
            setExportJob((prev) => ({ ...prev, progress: pct }))
          }
          if (progress.error) {
            setExportJob({
              status: 'error',
              progress: null,
              savedPath: null,
              error: progress.error,
            })
          }
        },
      )
      exportProgressUnlistenRef.current = unlisten

      // 4. Build payload for Rust command (convert frontend values to Rust-expected format)
      // Fetch password from keyring
      const password = await getConnectionPassword(conn.id)
      const connection = {
        ...getConnPayload(conn, target.schema),
        database: target.database || conn.database,
        password,
      }
      const rustFormat = options.format.toUpperCase()
      const rustEncoding =
        options.encoding === 'utf-8'
          ? 'UTF8'
          : options.encoding === 'utf-16'
            ? 'UTF16'
            : 'ASCII'
      const rustSqlMode =
        options.sqlMode === 'data-only'
          ? 'dataOnly'
          : options.sqlMode === 'schema-only'
            ? 'schemaOnly'
            : 'schemaAndData'
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
          setExportJob({
            status: 'success',
            progress: 100,
            savedPath: savedFilePath,
            error: null,
          })
        } else {
          setExportJob({
            status: 'error',
            progress: null,
            savedPath: null,
            error: result.error ?? 'Export failed',
          })
        }
      } catch (err) {
        // Cleanup progress listener on error
        unlisten()
        exportProgressUnlistenRef.current = null

        setExportJob({
          status: 'error',
          progress: null,
          savedPath: null,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },

    handleUseRecentExport: (recent: RecentTableExport) => {
      setExportModalTarget(recent.target)
      setExportEstimate({
        rowCount: null,
        estimatedSizeBytes: null,
        loading: false,
        error: null,
      })
      setExportJob({
        status: 'idle',
        progress: null,
        savedPath: null,
        error: null,
      })
    },

    handleCloseExportModal: () => {
      setExportModalTarget(null)
      setExportJob({
        status: 'idle',
        progress: null,
        savedPath: null,
        error: null,
      })
    },
  }
}
