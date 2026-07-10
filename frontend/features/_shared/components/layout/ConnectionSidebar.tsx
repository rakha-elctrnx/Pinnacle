import { useCallback, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { ActionButton } from '../ui/ActionButton'
import { TreeNodeItem } from '../ui/TreeNodeItem'
import type { ConnectionProfile, ConnectionType } from '../../types/domain'
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
 * Build a unified tree structure where groups and connections are first-class nodes.
 * This allows consistent styling and behavior across all tree levels.
 */
function buildUnifiedTree(
  groupedConnections: Record<string, ConnectionProfile[]> | null,
  explorerData: ExplorerDataContext,
  elasticIndices: Record<string, ElasticIndex[]> | null,
  expandedTreePaths: string[],
): TreeNode[] {
  if (!groupedConnections) return []

  const tree: TreeNode[] = []

  for (const [groupName, profiles] of Object.entries(groupedConnections)) {
    // Group node
    const groupNode: TreeNode = {
      label: groupName,
      nodeType: 'group',
      children: [],
    }

    // Connection nodes under this group
    for (const profile of profiles) {
      const connectionNode: TreeNode = {
        label: profile.name,
        nodeType: 'connection',
        connectionId: profile.id,
        children: [],
      }

      // Get the subtree for this connection
      const sqlTreeNodes = isSqlConnectionType(profile.type)
        ? explorerData.getTreeNodesForConnection(profile)
        : []
      const connectionIndices = elasticIndices?.[profile.id]
      const staticTreeNodes = isSqlConnectionType(profile.type)
        ? []
        : getStaticTreeNodes(profile.type, connectionIndices)
      const treeNodes = sqlTreeNodes.length > 0 ? sqlTreeNodes : staticTreeNodes

      // Only include children if the connection is expanded
      const connectionPath = `${groupName}/${profile.name}`
      if (expandedTreePaths.includes(connectionPath)) {
        connectionNode.children = treeNodes
      }

      groupNode.children?.push(connectionNode)
    }

    tree.push(groupNode)
  }

  return tree
}

/**
 * Get connection profile from a node path.
 * Path format: "groupName/connectionName" or "groupName/connectionName/databaseName/..."
 */
function getConnectionFromPath(
  path: string,
  groupedConnections: Record<string, ConnectionProfile[]> | null,
): ConnectionProfile | null {
  if (!groupedConnections || !path) return null

  const parts = path.split('/')
  if (parts.length < 2) return null

  const groupName = parts[0]
  const connectionName = parts[1]

  const profiles = groupedConnections[groupName]
  if (!profiles) return null

  return profiles.find((p) => p.name === connectionName) ?? null
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
  } = useDataExplorerContext()

  const navigate = useNavigate()

  // Build unified tree with groups and connections as first-class nodes
  const unifiedTree = useMemo(() => {
    return buildUnifiedTree(
      groupedConnections,
      explorerData,
      elasticIndices,
      expandedTreePaths,
    )
  }, [groupedConnections, explorerData, elasticIndices, expandedTreePaths])

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
          {/* <ChevronsLeftRightEllipsis size={14} className="text-text-secondary" /> */}
          <p className="text-label text-text-primary">Connections</p>
        </div>
        <ActionButton
          icon={<Plus size={14} />}
          aria-label="Create connection"
          variant="secondary"
          className="duration-150 active:scale-95"
          onClick={openCreateConnection}
        />
      </div>

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
            />
          ))}
        </div>
      </div>
    </aside>
  )
}
