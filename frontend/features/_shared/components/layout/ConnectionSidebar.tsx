import { useCallback, useMemo, useRef, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FolderPlus, X, Check, Search, ChevronsDownUp } from 'lucide-react'
import { ActionButton } from '../ui/ActionButton'
import { TreeNodeItem } from '../ui/TreeNodeItem'
import type {
  ConnectionProfile,
  ConnectionType,
  Folder,
} from '../../types/domain'
import type { ElasticIndex } from '../../../elasticsearch/types/elasticsearch'
import type {
  TreeNode,
  ExplorerTreeData,
  TreeNodeContextMenuMeta,
} from '../../types/shared'
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
  encodePathSegment,
  buildPath,
  decodePathSegment,
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
      return []
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
  search: string,
): TreeNode[] {
  if (!groupedConnections) return []

  const tree: TreeNode[] = []
  // A filter is active: folders with no matching connections are hidden so the
  // tree collapses to matches only. Without a filter, empty folders stay
  // visible as drop targets.
  const filtering = search.trim().length > 0

  // Render folder nodes first
  for (const folder of folders) {
    const folderProfiles = groupedConnections[folder.name]
    // Empty folders (array with 0 items) are still rendered as group nodes
    if (folderProfiles === undefined) continue
    if (filtering && folderProfiles.length === 0) continue

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

      const dynamicTreeNodes =
        isSqlConnectionType(profile.type) || profile.type === 'mongodb'
          ? explorerData.getTreeNodesForConnection(profile)
          : []
      const connectionIndices = elasticIndices?.[profile.id]
      const staticTreeNodes =
        isSqlConnectionType(profile.type) || profile.type === 'mongodb'
          ? []
          : getStaticTreeNodes(profile.type, connectionIndices)
      const treeNodes =
        dynamicTreeNodes.length > 0 ? dynamicTreeNodes : staticTreeNodes

      const connectionPath = buildPath(folder.name, profile.name)
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

      const dynamicTreeNodes =
        isSqlConnectionType(profile.type) || profile.type === 'mongodb'
          ? explorerData.getTreeNodesForConnection(profile)
          : []
      const connectionIndices = elasticIndices?.[profile.id]
      const staticTreeNodes =
        isSqlConnectionType(profile.type) || profile.type === 'mongodb'
          ? []
          : getStaticTreeNodes(profile.type, connectionIndices)
      const treeNodes =
        dynamicTreeNodes.length > 0 ? dynamicTreeNodes : staticTreeNodes

      // For ungrouped connections, the path is the encoded profile name
      const connectionPath = encodePathSegment(profile.name)
      if (expandedTreePaths.includes(connectionPath)) {
        connectionNode.children = treeNodes
      }

      tree.push(connectionNode)
    }
  }

  return tree
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
    connectionStatuses,
    search,
    setSearch,
    setExpandedTreePaths,
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
      search,
    )
  }, [
    groupedConnections,
    folders,
    explorerData,
    elasticIndices,
    expandedTreePaths,
    search,
  ])

  // At least one connection exists (or a filter is active — keep the box
  // reachable so the user can clear a filter that matches nothing).
  const hasConnections =
    search.trim().length > 0 ||
    Object.values(groupedConnections ?? {}).some((list) => list.length > 0)

  // Compute visible nodes from the unified tree
  const visibleNodes = useMemo(
    () => getVisibleNodes(unifiedTree, expandedTreePaths),
    [unifiedTree, expandedTreePaths],
  )

  // Latest-value ref so tree-mutation callbacks passed to every memoized
  // TreeNodeItem can stay reference-stable (the memo compares callbacks by
  // reference) while always reading fresh state.
  const expandedTreePathsRef = useRef(expandedTreePaths)
  useEffect(() => {
    expandedTreePathsRef.current = expandedTreePaths
  }, [expandedTreePaths])

  // Keep DOM focus synchronized without changing the user's scroll position.
  // Mouse, keyboard, and programmatic selection must never move the sidebar;
  // only direct user scrolling changes its viewport.
  const treeContainerRef = useRef<HTMLDivElement>(null)
  const focusEffect = () => {
    if (!focusedNodePath || !treeContainerRef.current) return
    const row = treeContainerRef.current.querySelector<HTMLElement>(
      `[data-node-path="${CSS.escape(focusedNodePath)}"]`,
    )
    row?.focus({ preventScroll: true })
  }
  useEffect(focusEffect, [focusedNodePath])

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
          const connectionId = current.node.connectionId ?? null
          if (connectionId) {
            handleConnectionToggle(focusedNodePath, connectionId)
          } else {
            handleToggleTreeNode(focusedNodePath)
          }
        } else if (
          isExpanded &&
          current.node.children &&
          current.node.children.length > 0
        ) {
          const childPath = buildPath(
            focusedNodePath,
            current.node.children[0].label,
          )
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
      case 'ContextMenu': // Actual menu/context key
      case 'F10': { // Shift+F10 is the Windows menu key equivalent
        if (e.key === 'F10' && !e.shiftKey) break
        e.preventDefault()
        const el = treeContainerRef.current?.querySelector<HTMLElement>(
          `[data-node-path="${CSS.escape(focusedNodePath)}"]`,
        )
        if (el) {
          const rect = el.getBoundingClientRect()
          el.dispatchEvent(
            new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              clientX: rect.left + rect.width / 2,
              clientY: rect.top + rect.height / 2,
            }),
          )
        }
        break
      }
      case 'Enter':
      case ' ': {
        e.preventDefault()
        // The focused row div (TreeNodeItem) owns the deterministic per-node
        // action: Enter = primary action, Space = select action. Route to the
        // row and let its handler decide — never simulate a generic click.
        const el = treeContainerRef.current?.querySelector<HTMLElement>(
          `[data-node-path="${CSS.escape(focusedNodePath)}"]`,
        )
        if (!el) break
        if (document.activeElement !== el) el.focus()
        el.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: e.key,
            bubbles: true,
            cancelable: true,
          }),
        )
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

      default: {
        // Typeahead: jump to the next visible node whose label starts with the
        // typed character, wrapping around the visible list. Only consume the
        // key when a match exists, so unmatched keystrokes still bubble.
        // Skip while a text field inside the tree owns the keystroke (inline
        // folder rename) — those characters belong to the input.
        const target = e.target as HTMLElement | null
        const typingInField =
          !!target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)
        if (
          !typingInField &&
          e.key.length === 1 &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey
        ) {
          const prefix = e.key.toLowerCase()
          const total = visibleNodes.length
          for (let step = 1; step <= total; step += 1) {
            const candidate = visibleNodes[(idx + step) % total]
            if (candidate.node.label.toLowerCase().startsWith(prefix)) {
              e.preventDefault()
              setFocusedNodePath(candidate.path)
              break
            }
          }
        }
        break
      }
    }
  }

  const openTab = useTabStore((s) => s.openTab)

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

  const handleTablesCategoryClick = useCallback(
    async (
      nodePath: string,
      databaseName?: string,
      schemaName?: string,
      connectionId?: string,
    ) => {
      const pathParts = nodePath.split('/').map(decodePathSegment)
      const profiles = Object.values(groupedConnections ?? {}).flat()
      const profile =
        profiles.find((item) => item.id === connectionId) ??
        profiles.find((item) => pathParts.includes(item.name)) ??
        selectedConnection
      const targetDatabase = databaseName || profile?.database
      if (!profile || !targetDatabase) return

      const targetSchema =
        profile.type === 'postgresql' ? schemaName || 'public' : undefined
      handleConnectionSelectionChange(profile.id)
      setSelectedTreeNode(nodePath)
      queryExecution.onQueryDatabaseChange(targetDatabase)
      queryExecution.onQuerySchemaChange(targetSchema || '')
      await explorerData.fetchSqlTableList(
        profile,
        targetDatabase,
        targetSchema,
      )

      const route = `/sql/${profile.id}/tables`
      openTab({
        id: `${profile.id}:tables`,
        label: 'Tables',
        type: profile.type,
        pageType: 'table',
        route,
        connectionId: profile.id,
        treePath: nodePath,
      })
      navigate(route)
    },
    [
      selectedConnection,
      groupedConnections,
      handleConnectionSelectionChange,
      setSelectedTreeNode,
      queryExecution,
      explorerData,
      navigate,
      openTab,
    ],
  )

  // Context-menu handlers are passed down to every TreeNodeItem. Memoized so
  // the memoized TreeNodeItem's comparator sees stable references and can skip
  // re-rendering siblings on focus/selection/expansion changes.
  const handleContextMenu = useCallback(
    (event: React.MouseEvent, meta: TreeNodeContextMenuMeta) => {
      event.preventDefault()
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        itemId: meta.connectionId,
        tableName: meta.tableName,
        viewName: meta.viewName,
        indexName: meta.indexName,
        databaseName: meta.databaseName,
        schemaName: meta.schemaName,
        categoryName: meta.categoryName,
      })
    },
    [setContextMenu],
  )

  const handleTableNodeContextMenu = useCallback(
    (event: React.MouseEvent, meta: TreeNodeContextMenuMeta) => {
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        itemId: meta.connectionId,
        databaseName: meta.databaseName,
        schemaName: meta.schemaName,
        tableName: meta.tableName,
      })
    },
    [setContextMenu],
  )

  const handleViewNodeContextMenu = useCallback(
    (event: React.MouseEvent, meta: TreeNodeContextMenuMeta) => {
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        itemId: meta.connectionId,
        databaseName: meta.databaseName,
        schemaName: meta.schemaName,
        viewName: meta.viewName,
      })
    },
    [setContextMenu],
  )

  const handleIndexNodeContextMenu = useCallback(
    (event: React.MouseEvent, meta: TreeNodeContextMenuMeta) => {
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        itemId: meta.connectionId,
        databaseName: meta.databaseName,
        schemaName: meta.schemaName,
        indexName: meta.indexName,
      })
    },
    [setContextMenu],
  )

  const handleDatabaseNodeContextMenu = useCallback(
    (event: React.MouseEvent, meta: TreeNodeContextMenuMeta) => {
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        itemId: meta.connectionId,
        databaseName: meta.databaseName,
      })
    },
    [setContextMenu],
  )

  const handleSchemaNodeContextMenu = useCallback(
    (event: React.MouseEvent, meta: TreeNodeContextMenuMeta) => {
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        itemId: meta.connectionId,
        databaseName: meta.databaseName,
        schemaName: meta.schemaName,
      })
    },
    [setContextMenu],
  )

  const handleTablesCategoryContextMenu = useCallback(
    (event: React.MouseEvent, meta: TreeNodeContextMenuMeta) => {
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        itemId: meta.connectionId,
        databaseName: meta.databaseName,
        schemaName: meta.schemaName,
        categoryName: meta.categoryName ?? 'Tables',
      })
    },
    [setContextMenu],
  )
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
      const wasExpanded = expandedTreePathsRef.current.includes(connectionPath)
      handleToggleTreeNode(connectionPath)

      // When expanding a connection, trigger the initial data fetch if needed
      if (!wasExpanded) {
        const profile = Object.values(groupedConnections ?? {})
          .flat()
          .find((p) => p.id === connectionId)
        if (
          profile &&
          (isSqlConnectionType(profile.type) || profile.type === 'mongodb')
        ) {
          const treeData = explorerData.treeDataMap[connectionId]
          if (!treeData) {
            explorerData.refreshConnectionData(connectionId, profile)
          } else if (
            isSqlConnectionType(profile.type) &&
            treeData.databases?.[0]
          ) {
            handleFetchDatabaseDetails(treeData.databases[0].name, connectionId)
          }
        } else if (profile && isElasticsearchType(profile.type)) {
          setExpandedConnectionId(connectionId)
        }
      }
    },
    [
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
            icon={<ChevronsDownUp size={14} />}
            aria-label="Collapse all"
            variant="secondary"
            className="duration-150 active:scale-95"
            onClick={() => setExpandedTreePaths([])}
          />
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

      {/* Filter box — hidden when there are no connections at all; the empty
          state below already guides the user toward creating one. */}
      {hasConnections && (
        <div className="flex shrink-0 items-center gap-1.5 px-3 pb-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border-default bg-bg-base px-2 py-1 transition-colors focus-within:border-border-focus">
            <Search size={12} className="shrink-0 text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSearch('')
              }}
              placeholder="Filter connections…"
              aria-label="Filter connections"
              className="min-w-0 flex-1 bg-transparent text-caption text-text-primary outline-none placeholder:text-text-muted"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear filter"
                onClick={() => setSearch('')}
                className="shrink-0 text-text-muted transition-colors hover:text-text-secondary"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      )}

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
            className="flex shrink-0 items-center justify-center rounded p-1 text-success hover:bg-bg-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowNewFolderInput(false)
              setNewFolderName('')
            }}
            className="flex shrink-0 items-center justify-center rounded p-1 text-text-muted hover:bg-bg-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Scrollable connection list (scrollbar scoped here) */}
      <div
        data-sidebar-area="ungrouped"
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-text-muted/20 [&::-webkit-scrollbar-thumb:hover]:bg-text-muted/40 [&::-webkit-scrollbar-track]:bg-transparent"
      >
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
            // When tree receives focus via Tab, set focus to selected or first node.
            // Focused paths are always in encoded form.
            if (!focusedNodePath && unifiedTree.length > 0) {
              setFocusedNodePath(
                selectedTreeNode || encodePathSegment(unifiedTree[0].label),
              )
            }
          }}
          onKeyDown={handleTreeKeyDown}
          className="outline-none"
        >
          {unifiedTree.map((node) => (
            <TreeNodeItem
              key={
                node.nodeType === 'group'
                  ? `group:${node.label}`
                  : node.connectionId
                    ? `conn:${node.connectionId}`
                    : node.label
              }
              node={node}
              depth={0}
              parentPath=""
              selectedTreeNode={selectedTreeNode}
              expandedTreePaths={expandedTreePaths}
              onTreeNodeClick={wrappedHandleTreeNodeClick}
              onSelectedTreeNode={setSelectedTreeNode}
              onToggleTreeNode={handleToggleTreeNode}
              onFetchDatabaseDetails={handleFetchDatabaseDetails}
              onQueryNavigate={handleQueryNavigate}
              onTablesCategoryClick={handleTablesCategoryClick}
              onTableNodeContextMenu={handleTableNodeContextMenu}
              onGroupToggle={handleGroupToggle}
              onConnectionToggle={handleConnectionToggle}
              onConnectionSelect={handleConnectionNodeSelect}
              onViewNodeContextMenu={handleViewNodeContextMenu}
              onIndexNodeContextMenu={handleIndexNodeContextMenu}
              onConnectionContextMenu={handleContextMenu}
              onDatabaseNodeContextMenu={handleDatabaseNodeContextMenu}
              onSchemaNodeContextMenu={handleSchemaNodeContextMenu}
              onTablesCategoryContextMenu={handleTablesCategoryContextMenu}
              groupedConnections={groupedConnections}
              explorerData={explorerData}
              elasticIndicesError={elasticIndicesError}
              elasticLoading={elasticLoading}
              connectionStatuses={connectionStatuses}
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
        {unifiedTree.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <p className="text-label text-text-secondary">
              {search ? 'No connections match' : 'No connections yet'}
            </p>
            <p className="text-caption text-text-muted">
              {search
                ? 'Try a different search term.'
                : 'Connect to a database to start exploring.'}
            </p>
            {!search && (
              <button
                type="button"
                onClick={openCreateConnection}
                className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-label text-text-inverse transition-colors hover:bg-primary-hover active:scale-95"
              >
                <Plus size={14} />
                New connection
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
