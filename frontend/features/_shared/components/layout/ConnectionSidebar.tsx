import { useCallback, useMemo, useRef, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FolderPlus, X, Check } from 'lucide-react'
import { ActionButton } from '../ui/ActionButton'
import { TreeNodeItem } from '../ui/TreeNodeItem'
import type { ConnectionProfile, ConnectionType, Folder } from '../../types/domain'
import type { ElasticIndex } from '../../../elasticsearch/types/elasticsearch'
import type { TreeNode, ExplorerTreeData } from '../../types/shared'
import { isSqlConnectionType, isElasticsearchType } from '../../utils'

interface ExplorerDataContext {
  treeDataMap: Record<string, ExplorerTreeData>
  treeLoading: Record<string, boolean>
  getTreeNodesForConnection: (profile: ConnectionProfile) => TreeNode[]
  fetchDatabaseDetails: (
    connectionId: string,
    profile: ConnectionProfile,
    dbName: string,
  ) => Promise<void>
  refreshConnectionData: (
    connId: string,
    conn: ConnectionProfile,
  ) => Promise<void>
}
import { useDataExplorerContext } from '../../context/DataExplorerContext'
import {
  getVisibleNodes,
  getNextNode,
  getPreviousNode,
  getParentPath,
  getFirstVisibleNode,
  getLastVisibleNode,
} from '../../utils/treeNavigation'
import { useTabStore } from '../../store/tabStore'
import { getConnectionDefaultRoute } from '../../utils'

/**
 * ConnectionSidebar — connection tree panel.
 *
 * After the five-region layout refactor (task-025) this component no
 * longer receives props. All state is read from `useDataExplorerContext`,
 * eliminating the ~21-prop drilling surface from the legacy `AppShell`
 * era.
 */
/**
 * Returns static tree nodes for non-SQL connection types.
 * SQL types (postgresql, mysql) use dynamic tree from getTreeNodesForConnection.
 * @param indices - optional Elasticsearch indices to populate the "Indices" node children.
 */
function getStaticTreeNodes(
  type: ConnectionType,
  indices?: ElasticIndex[],
): TreeNode[] {
  switch (type) {
    case 'redis':
      return [
        { label: 'Keys', children: [] },
        { label: 'Indexes', children: [] },
        { label: 'Queries', children: [] },
      ]
    case 'mongodb':
      return [
        { label: 'Tables', children: [] },
        { label: 'Views', children: [] },
        { label: 'Indexes', children: [] },
        { label: 'Queries', children: [] },
      ]
    case 'elasticsearch':
      return [
        { label: 'Cluster', children: [] },
        {
          label: 'Indices',
          children: indices
            ? indices
                .filter((idx) => !idx.index.startsWith('.'))
                .map((idx) => ({ label: idx.index }))
            : [],
        },
        { label: 'Query Console', children: [] },
      ]
    case 'rabbitmq':
      return [
        { label: 'Exchanges', children: [] },
        { label: 'Queues', children: [] },
        { label: 'Channels', children: [] },
      ]
    default:
      return []
  }
}
/**
 * Build a unified tree structure where folders and connections are first-class nodes.
 * Connections without folderId appear as top-level connection nodes (ungrouped).
 */
function buildUnifiedTree(
  groupedConnections: Record<string, ConnectionProfile[]> | null,
  folders: Folder[],
  explorerData: ExplorerDataContext,
  elasticIndices: Record<string, ElasticIndex[]> | null,
  expandedTreePaths: string[],
): TreeNode[] {
  if (!groupedConnections) return []

  const tree: TreeNode[] = []

  // Render folder nodes first
  for (const folder of folders) {
    const folderProfiles = groupedConnections[folder.name]
    // Empty folders (array with 0 items) are still rendered as group nodes
    if (folderProfiles === undefined) continue

    const groupNode: TreeNode = {
      label: folder.name,
      nodeType: 'group',
      children: [],
    }

    for (const profile of folderProfiles) {
      const connectionNode: TreeNode = {
        label: profile.name,
        nodeType: 'connection',
        connectionId: profile.id,
        children: [],
      }

      const sqlTreeNodes = isSqlConnectionType(profile.type)
        ? explorerData.getTreeNodesForConnection(profile)
        : []
      const connectionIndices = elasticIndices?.[profile.id]
      const staticTreeNodes = isSqlConnectionType(profile.type)
        ? []
        : getStaticTreeNodes(profile.type, connectionIndices)
      const treeNodes = sqlTreeNodes.length > 0 ? sqlTreeNodes : staticTreeNodes

      const connectionPath = `${folder.name}/${profile.name}`
      if (expandedTreePaths.includes(connectionPath)) {
        connectionNode.children = treeNodes
      }

      groupNode.children?.push(connectionNode)
    }

    tree.push(groupNode)
  }

  // Render ungrouped connections as top-level nodes (no folder wrapper)
  const ungrouped = groupedConnections['__ungrouped__']
  if (ungrouped) {
    for (const profile of ungrouped) {
      const connectionNode: TreeNode = {
        label: profile.name,
        nodeType: 'connection',
        connectionId: profile.id,
        children: [],
      }

      const sqlTreeNodes = isSqlConnectionType(profile.type)
        ? explorerData.getTreeNodesForConnection(profile)
        : []
      const connectionIndices = elasticIndices?.[profile.id]
      const staticTreeNodes = isSqlConnectionType(profile.type)
        ? []
        : getStaticTreeNodes(profile.type, connectionIndices)
      const treeNodes = sqlTreeNodes.length > 0 ? sqlTreeNodes : staticTreeNodes

      // For ungrouped connections, the path is just the profile name
      if (expandedTreePaths.includes(profile.name)) {
        connectionNode.children = treeNodes
      }

      tree.push(connectionNode)
    }
  }

  return tree
}

/**
 * Get connection profile from a node path.
 * Path format: "groupName/connectionName" or just "connectionName" (ungrouped).
 */
function getConnectionFromPath(
  path: string,
  groupedConnections: Record<string, ConnectionProfile[]> | null,
): ConnectionProfile | null {
  if (!groupedConnections || !path) return null

  const parts = path.split('/')
  if (parts.length < 1) return null

  // Try as groupName/connectionName
  if (parts.length >= 2) {
    const groupName = parts[0]
    const connectionName = parts[1]

    const profiles = groupedConnections[groupName]
    if (profiles) {
      const found = profiles.find((p) => p.name === connectionName)
      if (found) return found
    }
  }

  // Try as ungrouped connection (just name)
  const ungrouped = groupedConnections['__ungrouped__']
  if (ungrouped) {
    return ungrouped.find((p) => p.name === parts[0]) ?? null
  }

  return null
}

/**
 * Get connection ID from a node path.
 */
function getConnectionIdFromPath(
  path: string,
  groupedConnections: Record<string, ConnectionProfile[]> | null,
): string | null {
  const profile = getConnectionFromPath(path, groupedConnections)
  return profile?.id ?? null
}
export function ConnectionSidebar() {
  const {
    groupedConnections,
    selectedConnection,
    selectedTreeNode,
    expandedTreePaths,
    openCreateConnection,
    handleConnectionSelectionChange,
    setContextMenu,
    explorerData,
    wrappedHandleTreeNodeClick,
    setSelectedTreeNode,
    handleToggleTreeNode,
    handleFetchDatabaseDetails,
    elasticIndices,
    elasticIndicesError,
    elasticLoading,
    handleRetryElasticIndices,
    focusedNodePath,
    setFocusedNodePath,
    queryExecution,
    setExpandedConnectionId,
    folders,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleMoveConnectionToFolder,
  } = useDataExplorerContext()

  const navigate = useNavigate()

  // ── Inline new folder input state ────────────────────────────
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const newFolderInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (showNewFolderInput) {
      newFolderInputRef.current?.focus()
    }
  }, [showNewFolderInput])

  // Build unified tree with folders and groups as first-class nodes
  const unifiedTree = useMemo(() => {
    return buildUnifiedTree(
      groupedConnections,
      folders,
      explorerData,
      elasticIndices,
      expandedTreePaths,
    )
  }, [groupedConnections, folders, explorerData, elasticIndices, expandedTreePaths])

  // Compute visible nodes from the unified tree
  const visibleNodes = useMemo(
    () => getVisibleNodes(unifiedTree, expandedTreePaths),
    [unifiedTree, expandedTreePaths],
  )

  // Focus management: imperatively focus DOM element when focusedNodePath changes
  const treeContainerRef = useRef<HTMLDivElement>(null)
  const focusEffect = () => {
    if (!focusedNodePath || !treeContainerRef.current) return
    const el = treeContainerRef.current.querySelector<HTMLElement>(
      `[data-node-path="${CSS.escape(focusedNodePath)}"]`,
    )
    el?.focus()
    el?.scrollIntoView({ block: 'nearest' })
  }
  useEffect(focusEffect, [focusedNodePath])

  // Scroll tree to show the selected node when it changes programmatically
  // (e.g. tab switch, tab close fallback) — without stealing focus from content.
  const scrollEffect = () => {
    if (!selectedTreeNode || !treeContainerRef.current) return
    // Already handled by focusEffect when focusedNodePath matches
    if (focusedNodePath === selectedTreeNode) return
    const el = treeContainerRef.current.querySelector<HTMLElement>(
      `[data-node-path="${CSS.escape(selectedTreeNode)}"]`,
    )
    el?.scrollIntoView({ block: 'nearest' })
  }
  useEffect(scrollEffect, [selectedTreeNode, focusedNodePath])

  // Reset focused node only on connection-scoped tree changes, not every re-render.
  // Observe only connection identity switches — the narrower scope prevents focus
  // from being wiped when e.g. a lazy subtree fills in.
  const prevConnectionId = useRef<string | null>(null)
  useEffect(() => {
    const currentConnectionId = selectedConnection?.id ?? null
    if (currentConnectionId !== prevConnectionId.current) {
      setFocusedNodePath(null)
      prevConnectionId.current = currentConnectionId
    }
  }, [selectedConnection, selectedTreeNode, setFocusedNodePath])

  // Root-level keyboard handler for the tree container
  const handleTreeKeyDown = (e: React.KeyboardEvent) => {
    if (!focusedNodePath) return

    const idx = visibleNodes.findIndex((n) => n.path === focusedNodePath)
    if (idx < 0) return
    const current = visibleNodes[idx]

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        const next = getNextNode(visibleNodes, focusedNodePath)
        if (next) setFocusedNodePath(next)
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        const prev = getPreviousNode(visibleNodes, focusedNodePath)
        if (prev) setFocusedNodePath(prev)
        break
      }
      case 'ArrowRight': {
        e.preventDefault()
        const isExpanded = expandedTreePaths.includes(focusedNodePath)
        const hasChildren = current.node.children !== undefined

        if (!isExpanded && hasChildren) {
          handleToggleTreeNode(focusedNodePath)
          // For connection nodes (depth 1), trigger lazy fetch
          if (current.depth === 1 && current.node.nodeType === 'connection') {
            const connectionId = getConnectionIdFromPath(
              focusedNodePath,
              groupedConnections,
            )
            if (connectionId) {
              const profile = Object.values(groupedConnections ?? {})
                .flat()
                .find((p) => p.id === connectionId)
              if (profile && isSqlConnectionType(profile.type)) {
                const treeData = explorerData.treeDataMap[connectionId]
                if (!treeData) {
                  explorerData.refreshConnectionData(connectionId, profile)
                } else if (treeData.databases?.[0]) {
                  handleFetchDatabaseDetails(treeData.databases[0].name)
                }
              }
            }
          }
        } else if (
          isExpanded &&
          current.node.children &&
          current.node.children.length > 0
        ) {
          const childPath = `${focusedNodePath}/${current.node.children[0].label}`
          setFocusedNodePath(childPath)
        }
        break
      }
      case 'ArrowLeft': {
        e.preventDefault()
        const isExpanded = expandedTreePaths.includes(focusedNodePath)
        if (isExpanded) {
          handleToggleTreeNode(focusedNodePath)
        } else {
          const parent = getParentPath(focusedNodePath)
          if (parent) setFocusedNodePath(parent)
        }
        break
      }
      case 'Enter':
      case ' ': {
        e.preventDefault()
        // Simulate click — the outer div with data-node-path now handles selection
        const el = treeContainerRef.current?.querySelector<HTMLElement>(
          `[data-node-path="${CSS.escape(focusedNodePath)}"]`,
        )
        el?.click()
        break
      }
      case 'Home': {
        e.preventDefault()
        const first = getFirstVisibleNode(visibleNodes)
        if (first) setFocusedNodePath(first)
        break
      }
      case 'End': {
        e.preventDefault()
        const last = getLastVisibleNode(visibleNodes)
        if (last) setFocusedNodePath(last)
        break
      }
    }
  }

  const openTab = useTabStore((s) => s.openTab)

  // URL-driven navigation handlers
  const handleTableNavigate = useCallback(
    (tableName: string, treePath?: string) => {
      const connectionId = selectedConnection?.id
      if (!connectionId || !selectedConnection) return
      const route = `/sql/${connectionId}/tables/${encodeURIComponent(tableName)}`
      openTab({
        id: `${connectionId}:table:${tableName}`,
        label: tableName,
        type: selectedConnection.type,
        pageType: 'table',
        route,
        connectionId,
        treePath,
      })
      navigate(route)
    },
    [selectedConnection, navigate, openTab],
  )

  const handleQueryNavigate = useCallback(() => {
    const connectionId = selectedConnection?.id
    if (!connectionId || !selectedConnection) return
    const qId = queryExecution.createQueryId()
    const route = `/sql/${connectionId}/query/${qId}`
    openTab({
      id: `${connectionId}:query:${qId}`,
      label: `Query_${qId}`,
      type: selectedConnection.type,
      pageType: 'query',
      route,
      connectionId,
    })
    navigate(route)
  }, [selectedConnection, navigate, openTab, queryExecution])

  const handleTablesCategoryClick = useCallback(() => {
    const connectionId = selectedConnection?.id
    if (!connectionId || !selectedConnection) return
    const route = `/sql/${connectionId}/tables`
    openTab({
      id: `${connectionId}:tables`,
      label: 'Tables',
      type: selectedConnection.type,
      pageType: 'table',
      route,
      connectionId,
    })
    navigate(route)
  }, [selectedConnection, navigate, openTab])

  const handleContextMenu = (event: React.MouseEvent, itemId: string) => {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, itemId })
  }

  const handleTableNodeContextMenu = (
    event: React.MouseEvent,
    connectionId: string,
    tableName: string,
  ) => {
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      itemId: connectionId,
      tableName,
    })
  }
  const handleViewNodeContextMenu = (
    event: React.MouseEvent,
    connectionId: string,
    viewName: string,
  ) => {
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      itemId: connectionId,
      viewName,
    })
  }

  const handleIndexNodeContextMenu = (
    event: React.MouseEvent,
    connectionId: string,
    indexName: string,
  ) => {
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      itemId: connectionId,
      indexName,
    })
  }

  // Handle connection node selection from tree — no tab created, just navigate
  const handleConnectionNodeSelect = useCallback(
    (nodePath: string, connectionId: string) => {
      handleConnectionSelectionChange(connectionId)
      setSelectedTreeNode(nodePath)

      // Find the connection profile to get its default route
      const profile = Object.values(groupedConnections ?? {})
        .flat()
        .find((p) => p.id === connectionId)
      if (profile) {
        const route = getConnectionDefaultRoute(profile.type, connectionId)
        navigate(route)
      } else {
        navigate(`/sql/${connectionId}`)
      }
    },
    [
      handleConnectionSelectionChange,
      navigate,
      setSelectedTreeNode,
      groupedConnections,
    ],
  )

  // Handle group node toggle
  const handleGroupToggle = useCallback(
    (groupPath: string) => {
      handleToggleTreeNode(groupPath)
    },
    [handleToggleTreeNode],
  )

  // Handle connection node toggle (expand/collapse)
  const handleConnectionToggle = useCallback(
    (connectionPath: string, connectionId: string) => {
      const wasExpanded = expandedTreePaths.includes(connectionPath)
      handleToggleTreeNode(connectionPath)

      // When expanding a connection, trigger the initial data fetch if needed
      if (!wasExpanded) {
        const profile = Object.values(groupedConnections ?? {})
          .flat()
          .find((p) => p.id === connectionId)
        if (profile && isSqlConnectionType(profile.type)) {
          const treeData = explorerData.treeDataMap[connectionId]
          if (!treeData) {
            // No data at all — fetch the database list first
            explorerData.refreshConnectionData(connectionId, profile)
          } else if (treeData.databases?.[0]) {
            // Database list exists — fetch details for the first database
            handleFetchDatabaseDetails(treeData.databases[0].name)
          }
        } else if (profile && isElasticsearchType(profile.type)) {
          setExpandedConnectionId(connectionId)
        }
      }
    },
    [
      expandedTreePaths,
      groupedConnections,
      explorerData,
      handleToggleTreeNode,
      handleFetchDatabaseDetails,
      setExpandedConnectionId,
    ],
  )

  return (
    <aside className="flex h-full min-w-0 flex-col overflow-hidden bg-bg-subtle/40">
      {/* Header (fixed) */}
      <div className="flex shrink-0 items-center justify-between border-b border-border-default/60 pl-4 pr-2.5 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <p className="text-label text-text-primary">Connections</p>
        </div>
        <div className="flex items-center gap-1">
          <ActionButton
            icon={<FolderPlus size={14} />}
            aria-label="New folder"
            variant="secondary"
            className="duration-150 active:scale-95"
            onClick={() => setShowNewFolderInput(true)}
          />
          <ActionButton
            icon={<Plus size={14} />}
            aria-label="Create connection"
            variant="secondary"
            className="duration-150 active:scale-95"
            onClick={openCreateConnection}
          />
        </div>
      </div>

      {/* Inline new folder input */}
      {showNewFolderInput && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border-default/60">
          <input
            ref={newFolderInputRef}
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newFolderName.trim()) {
                handleCreateFolder(newFolderName.trim())
                setShowNewFolderInput(false)
                setNewFolderName('')
              }
              if (e.key === 'Escape') {
                setShowNewFolderInput(false)
                setNewFolderName('')
              }
            }}
            placeholder="Folder name..."
            className="min-w-0 flex-1 rounded border border-border-default bg-bg-base px-2 py-1 text-xs outline-none focus:border-focus-ring"
            autoFocus
          />
          <button
            type="button"
            onClick={() => {
              if (newFolderName.trim()) {
                handleCreateFolder(newFolderName.trim())
                setShowNewFolderInput(false)
                setNewFolderName('')
              }
            }}
            className="flex shrink-0 items-center justify-center rounded p-1 text-success hover:bg-bg-hover transition-colors"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowNewFolderInput(false)
              setNewFolderName('')
            }}
            className="flex shrink-0 items-center justify-center rounded p-1 text-text-muted hover:bg-bg-hover transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Scrollable connection list (scrollbar scoped here) */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-text-muted/20 [&::-webkit-scrollbar-thumb:hover]:bg-text-muted/40 [&::-webkit-scrollbar-track]:bg-transparent">
        <div
          ref={treeContainerRef}
          role="tree"
          aria-label="Connections tree"
          aria-activedescendant={
            focusedNodePath
              ? `treeitem-${focusedNodePath.replace(/\//g, '-')}`
              : undefined
          }
          tabIndex={0}
          onFocus={() => {
            // When tree receives focus via Tab, set focus to selected or first node
            if (!focusedNodePath && unifiedTree.length > 0) {
              setFocusedNodePath(selectedTreeNode || unifiedTree[0].label)
            }
          }}
          onKeyDown={handleTreeKeyDown}
          className="outline-none"
        >
          {unifiedTree.map((node) => (
            <TreeNodeItem
              key={node.label}
              node={node}
              depth={0}
              parentPath=""
              selectedTreeNode={selectedTreeNode}
              expandedTreePaths={expandedTreePaths}
              onTreeNodeClick={wrappedHandleTreeNodeClick}
              onSelectedTreeNode={setSelectedTreeNode}
              onToggleTreeNode={handleToggleTreeNode}
              onFetchDatabaseDetails={handleFetchDatabaseDetails}
              onTableNavigate={handleTableNavigate}
              onQueryNavigate={handleQueryNavigate}
              onTablesCategoryClick={handleTablesCategoryClick}
              onTableNodeContextMenu={handleTableNodeContextMenu}
              onGroupToggle={handleGroupToggle}
              onConnectionToggle={handleConnectionToggle}
              onConnectionSelect={handleConnectionNodeSelect}
              onViewNodeContextMenu={handleViewNodeContextMenu}
              onIndexNodeContextMenu={handleIndexNodeContextMenu}
              onConnectionContextMenu={handleContextMenu}
              groupedConnections={groupedConnections}
              explorerData={explorerData}
              elasticIndicesError={elasticIndicesError}
              elasticLoading={elasticLoading}
              handleRetryElasticIndices={handleRetryElasticIndices}
              focusedNodePath={focusedNodePath}
              setFocusedNodePath={setFocusedNodePath}
              folders={folders}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              onMoveConnectionToFolder={handleMoveConnectionToFolder}
            />
          ))}
        </div>
      </div>
    </aside>
  )
}
