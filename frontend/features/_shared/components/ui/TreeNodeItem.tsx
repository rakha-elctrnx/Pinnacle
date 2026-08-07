import {
  Activity,
  Braces,
  ChevronRight,
  Code,
  Database,
  Eye,
  FileText,
  Hash,
  Layers,
  List,
  MessageSquare,
  Table,
  Terminal,
  Zap,
  Folder,
  Pencil,
  Trash2,
} from 'lucide-react'
import type {
  TreeNode,
  ExplorerTreeData,
  TreeNodeContextMenuMeta,
} from '../../types/shared'
import type {
  ConnectionProfile,
  Folder as FolderType,
} from '../../types/domain'
import { databaseTypeOptions } from '../../constants'
import { CenteredLoadingState } from './CenteredLoadingState'
import { useState, useRef, useCallback, useEffect } from 'react'

interface ExplorerDataContext {
  treeDataMap: Record<string, ExplorerTreeData>
  treeLoading: Record<string, boolean>
}

const CATEGORY_LABELS = [
  'Tables',
  'Views',
  'Functions',
  'Queries',
  'Keys',
  'Indexes',
  'Exchanges',
  'Queues',
  'Channels',
  // Elasticsearch
  'Cluster',
  'Indices',
  'Query Console',
  'Mapping',
]

function isCategoryNode(label: string): boolean {
  return CATEGORY_LABELS.includes(label)
}


/**
 * Returns an icon component to use for a given category label.
 */
function getCategoryIcon(label: string) {
  switch (label) {
    case 'Tables':
      return <Table size={11} className="shrink-0 text-primary" />
    case 'Views':
      return <Eye size={11} className="shrink-0 text-sky-500" />
    case 'Functions':
      return <Code size={11} className="shrink-0 text-amber-500" />
    case 'Queries':
      return <FileText size={11} className="shrink-0 text-emerald-500" />
    case 'Keys':
      return <Hash size={11} className="shrink-0 text-purple-500" />
    case 'Indexes':
      return <Zap size={11} className="shrink-0 text-orange-500" />
    case 'Cluster':
      return <Activity size={11} className="shrink-0 text-emerald-500" />
    case 'Indices':
      return <Database size={11} className="shrink-0 text-sky-500" />
    case 'Query Console':
      return <Terminal size={11} className="shrink-0 text-amber-500" />
    case 'Mapping':
      return <Braces size={11} className="shrink-0 text-violet-500" />
    case 'Exchanges':
      return <Layers size={11} className="shrink-0 text-green-500" />
    case 'Queues':
      return <List size={11} className="shrink-0 text-sky-500" />
    case 'Channels':
      return <MessageSquare size={11} className="shrink-0 text-pink-500" />
    default:
      return null
  }
}

export function TreeNodeItem({
  node,
  depth,
  parentPath,
  selectedTreeNode,
  expandedTreePaths,
  onTreeNodeClick,
  onSelectedTreeNode,
  onToggleTreeNode,
  onFetchDatabaseDetails,
  onQueryNavigate,
  onTablesCategoryClick,
  onConnectionSelect,
  onGroupToggle,
  onConnectionToggle,
  onTableNodeContextMenu,
  onIndexNodeContextMenu,
  onConnectionContextMenu,
  onViewNodeContextMenu,
  onDatabaseNodeContextMenu,
  onSchemaNodeContextMenu,
  onTablesCategoryContextMenu,
  parentConnectionId,
  groupedConnections,
  explorerData,
  elasticIndicesError,
  elasticLoading,
  handleRetryElasticIndices,
  focusedNodePath,
  setFocusedNodePath,
  folders,
  onRenameFolder,
  onDeleteFolder,
  onMoveConnectionToFolder,
}: {
  node: TreeNode
  depth: number
  parentConnectionId?: string
  parentPath: string
  selectedTreeNode: string | null
  expandedTreePaths: string[]
  onTreeNodeClick: (
    nodeLabel: string,
    databaseName?: string,
    nodePath?: string,
    schemaName?: string,
  ) => void
  onSelectedTreeNode: (label: string | null) => void
  onToggleTreeNode: (path: string) => void
  onFetchDatabaseDetails?: (dbName: string) => void
  onQueryNavigate?: () => void
  onTablesCategoryClick?: () => void
  onConnectionSelect?: (nodePath: string, connectionId: string) => void
  onGroupToggle?: (groupPath: string) => void
  onConnectionToggle?: (connectionPath: string, connectionId: string) => void
  onTableNodeContextMenu?: (
    event: React.MouseEvent,
    meta: TreeNodeContextMenuMeta,
  ) => void
  onIndexNodeContextMenu?: (
    event: React.MouseEvent,
    meta: TreeNodeContextMenuMeta,
  ) => void
  onConnectionContextMenu?: (
    event: React.MouseEvent,
    meta: TreeNodeContextMenuMeta,
  ) => void
  onViewNodeContextMenu?: (
    event: React.MouseEvent,
    meta: TreeNodeContextMenuMeta,
  ) => void
  onDatabaseNodeContextMenu?: (
    event: React.MouseEvent,
    meta: TreeNodeContextMenuMeta,
  ) => void
  onSchemaNodeContextMenu?: (
    event: React.MouseEvent,
    meta: TreeNodeContextMenuMeta,
  ) => void
  onTablesCategoryContextMenu?: (
    event: React.MouseEvent,
    meta: TreeNodeContextMenuMeta,
  ) => void
  groupedConnections?: Record<string, ConnectionProfile[]> | null
  explorerData?: ExplorerDataContext
  elasticIndicesError?: Record<string, string>
  elasticLoading?: Record<string, boolean>
  handleRetryElasticIndices?: (connectionId: string) => void
  focusedNodePath: string | null
  setFocusedNodePath: (path: string | null) => void
  folders?: FolderType[]
  onRenameFolder?: (id: string, name: string) => void
  onDeleteFolder?: (id: string) => void
  onMoveConnectionToFolder?: (
    connectionId: string,
    folderId: string | null,
  ) => void
}) {
  const nodePath = parentPath ? `${parentPath}/${node.label}` : node.label
  const hasChildren = node.children !== undefined
  const isExpanded = expandedTreePaths.includes(nodePath)
  const isGroupNode = node.nodeType === 'group'
  const isConnectionNode = node.nodeType === 'connection'
  const isDatabaseNode =
    node.nodeType === 'database' ||
    (!isGroupNode &&
      !isConnectionNode &&
      !isCategoryNode(node.label) &&
      !!node.databaseName &&
      node.databaseName === node.label)
  // Parent category for leaf classification — derived from the category
  // ancestor's label (Tables/Views/Indices) via the explicit parentPath
  // contract, never positional string splitting of the full path.
  const parentCategory = parentPath.slice(parentPath.lastIndexOf('/') + 1)
  const isSchemaNode = node.nodeType === 'schema'
  const isLeaf =
    !hasChildren ||
    (node.children && node.children.length === 0 && isCategoryNode(node.label))
  const isLeafItem = isLeaf && !isCategoryNode(node.label)
  const isTableItem = isLeafItem && parentCategory === 'Tables'
  const isViewItem = isLeafItem && parentCategory === 'Views'
  const isIndexItem = isLeafItem && parentCategory === 'Indices'
  const isQueriesFolder = node.label === 'Queries'
  const categoryIcon = isCategoryNode(node.label)
    ? getCategoryIcon(node.label)
    : null
  // Explicit node identity for context-menu callbacks. Every node in the
  // unified tree inherits connectionId from its connection ancestor, so the
  // clicked node's connection is always resolved — never the active selection.
  const contextMenuMeta: TreeNodeContextMenuMeta = {
    connectionId: node.connectionId ?? parentConnectionId ?? '',
    databaseName: node.databaseName,
    schemaName: node.schemaName,
    tableName: isTableItem ? node.label : undefined,
    viewName: isViewItem ? node.label : undefined,
    indexName: isIndexItem ? node.label : undefined,
    categoryName: isCategoryNode(node.label) ? node.label : undefined,
  }

  // ── Folder rename state ───────────────────────────────────────
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(node.label)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [isRenaming])

  // ── Drag & Drop state ─────────────────────────────────────────
  const [isDragOver, setIsDragOver] = useState(false)

  // ── Get folder id for group nodes ─────────────────────────────
  const getFolderId = useCallback((): string | null => {
    if (!isGroupNode || !folders) return null
    const folder = folders.find((f) => f.name === node.label)
    return folder?.id ?? null
  }, [isGroupNode, folders, node.label])

  // ── Handle rename submission ──────────────────────────────────
  const handleRenameSubmit = useCallback(() => {
    const folderId = getFolderId()
    if (folderId && onRenameFolder && renameValue.trim()) {
      onRenameFolder(folderId, renameValue.trim())
    }
    setIsRenaming(false)
  }, [getFolderId, onRenameFolder, renameValue])

  // ── Drag & Drop handlers with threshold and click suppression ─
  const isDraggingRef = useRef(false)
  const suppressClickRef = useRef(false)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)

  const cleanupDrag = useCallback(() => {
    if (dragCleanupRef.current) {
      dragCleanupRef.current()
      dragCleanupRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      cleanupDrag()
    }
  }, [cleanupDrag])

  // ── Single vs double click detection ─────────────────────────
  // A single click waits ~200ms to see whether a second click (double
  // click) follows before firing the select action. Double click cancels
  // the pending select and runs the primary action instead.
  const clickTimeoutRef = useRef<number | null>(null)
  const clearClickTimer = useCallback(() => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => clearClickTimer()
  }, [clearClickTimer])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isConnectionNode || !node.connectionId) return
      if (e.button !== 0) return // Only primary button
      const startX = e.clientX
      const startY = e.clientY
      const threshold = 5 // 4-6 px movement threshold
      let isDragActive = false

      const handleMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY

        if (!isDragActive) {
          if (Math.hypot(dx, dy) < threshold) return

          isDragActive = true
          isDraggingRef.current = true

          const ghost = document.createElement('div')
          ghost.textContent = node.label
          ghost.style.cssText = `
            position: fixed; z-index: 9999; pointer-events: none;
            padding: 4px 10px; border-radius: 6px;
            background: var(--color-bg-emphasis, #333);
            color: var(--color-text-on-emphasis, #fff);
            font-size: 12px; white-space: nowrap;
            opacity: 0.9; transform: scale(0.95);
          `
          document.body.appendChild(ghost)
          ghostRef.current = ghost
          document.body.dataset.dragging = 'connection'
          document.body.dataset.draggedConnectionId = node.connectionId!
        }

        if (ghostRef.current) {
          ghostRef.current.style.left = `${ev.clientX + 10}px`
          ghostRef.current.style.top = `${ev.clientY + 10}px`
        }

        const target = document.elementFromPoint(ev.clientX, ev.clientY)
        const groupEl = target?.closest('[data-is-group="true"]')
        const sidebar = target?.closest('[data-sidebar-area="ungrouped"]')
        setIsDragOver(!!groupEl || !!sidebar)
      }

      const handleUp = (ev: PointerEvent) => {
        cleanup()

        if (isDragActive) {
          suppressClickRef.current = true
          const target = document.elementFromPoint(ev.clientX, ev.clientY)
          const groupEl = target?.closest('[data-is-group="true"]')

          if (groupEl) {
            const folderName = groupEl.getAttribute('data-folder-name')
            if (folderName && onMoveConnectionToFolder) {
              const folder = folders?.find((f) => f.name === folderName)
              onMoveConnectionToFolder(node.connectionId!, folder?.id ?? null)
            }
          } else if (target?.closest('[data-sidebar-area="ungrouped"]')) {
            onMoveConnectionToFolder?.(node.connectionId!, null)
          }
        }
      }

      const handleKeyDown = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') {
          cleanup()
        }
      }

      const cleanup = () => {
        document.removeEventListener('pointermove', handleMove)
        document.removeEventListener('pointerup', handleUp)
        document.removeEventListener('pointercancel', cleanup)
        window.removeEventListener('keydown', handleKeyDown)

        if (ghostRef.current) {
          ghostRef.current.remove()
          ghostRef.current = null
        }
        delete document.body.dataset.dragging
        delete document.body.dataset.draggedConnectionId
        setIsDragOver(false)
        isDraggingRef.current = false
        dragCleanupRef.current = null
      }

      dragCleanupRef.current = cleanup

      document.addEventListener('pointermove', handleMove)
      document.addEventListener('pointerup', handleUp)
      document.addEventListener('pointercancel', cleanup)
      window.addEventListener('keydown', handleKeyDown)
    },
    [
      isConnectionNode,
      node.connectionId,
      node.label,
      folders,
      onMoveConnectionToFolder,
    ],
  )

  const [showFolderMenu, setShowFolderMenu] = useState(false)
  const [folderMenuPos, setFolderMenuPos] = useState({ x: 0, y: 0 })
  const folderMenuRef = useRef<HTMLDivElement>(null)

  // Close folder context menu on outside click
  useEffect(() => {
    if (!showFolderMenu) return
    const handlePointerDown = (e: PointerEvent) => {
      if (
        folderMenuRef.current &&
        !folderMenuRef.current.contains(e.target as Node)
      ) {
        setShowFolderMenu(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [showFolderMenu])

  // Get connection profile for connection nodes
  const connectionProfile =
    isConnectionNode && node.connectionId && groupedConnections
      ? Object.values(groupedConnections)
          .flat()
          .find((p) => p.id === node.connectionId)
      : null

  // Get database type icon for connection nodes
  const getConnectionIcon = () => {
    if (!connectionProfile)
      return <Database size={11} className="shrink-0 text-text-secondary" />
    const dbOption = databaseTypeOptions.find(
      (opt) => opt.value === connectionProfile.type,
    )
    return dbOption?.Icon ? (
      <dbOption.Icon size={11} className="shrink-0 text-text-secondary" />
    ) : (
      <Database size={11} className="shrink-0 text-text-secondary" />
    )
  }

  // Get count for group nodes
  const getGroupCount = () => {
    if (!isGroupNode || !groupedConnections) return 0
    return groupedConnections[node.label]?.length ?? 0
  }

  // Check if connection is loading
  const isConnectionLoading = () => {
    if (!isConnectionNode || !node.connectionId) return false
    return (
      explorerData?.treeLoading?.[node.connectionId] ||
      elasticLoading?.[node.connectionId]
    )
  }

  // Check if connection is active (selected)
  const isConnectionActive = () => {
    if (!isConnectionNode || !node.connectionId || !selectedTreeNode)
      return false
    // Check if this connection or any of its children are selected
    return (
      selectedTreeNode === nodePath || selectedTreeNode?.startsWith(nodePath)
    )
  }

  // Toggle expand/collapse for container nodes (shared by chevron and the
  // primary double-click/Enter action). Database nodes also lazy-fetch their
  // children when expanding. Never navigates or opens tabs.
  const handleToggleExpand = () => {
    if (isGroupNode) {
      onGroupToggle?.(nodePath)
    } else if (isConnectionNode && node.connectionId) {
      onConnectionToggle?.(nodePath, node.connectionId)
    } else if (isDatabaseNode && !isCategoryNode(node.label)) {
      if (!isExpanded) {
        onToggleTreeNode(nodePath)
        onFetchDatabaseDetails?.(node.databaseName ?? node.label)
      } else {
        onToggleTreeNode(nodePath)
      }
    } else {
      onToggleTreeNode(nodePath)
    }
  }

  // Chevron click: toggles expand/collapse only. Never navigates or tabs.
  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    handleToggleExpand()
  }

  // Select action (single click / Space): selects a node — or, for category
  // and connection nodes, shows their list/active page. Never opens a leaf
  // detail tab and never toggles expansion.
  const handleSelectAction = () => {
    setFocusedNodePath(nodePath)

    if (isGroupNode) {
      // Folder: select/focus only
      onSelectedTreeNode(nodePath)
    } else if (isConnectionNode && node.connectionId) {
      // Connection: make it the active connection
      onConnectionSelect?.(nodePath, node.connectionId)
      onSelectedTreeNode(nodePath)
    } else if (node.label === 'Queries') {
      // Queries category: select + open query list
      onSelectedTreeNode(nodePath)
      onQueryNavigate?.()
    } else if (isCategoryNode(node.label)) {
      // Category: select + show its list page
      onSelectedTreeNode(nodePath)
      onTreeNodeClick(node.label, node.databaseName, nodePath, node.schemaName)
      if (node.label === 'Tables') {
        onTablesCategoryClick?.()
      }
    } else {
      // Database, schema, leaf table/view/index: select only
      onSelectedTreeNode(nodePath)
    }

    clickTimeoutRef.current = null
  }


  // Single click: select immediately + debounce the select action so a
  // following double click can replace it with the primary action.
  const handleRowClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    setFocusedNodePath(nodePath)
    clearClickTimer()
    clickTimeoutRef.current = setTimeout(() => {
      handleSelectAction()
    }, 200)
  }

  // Double click: cancel the pending single-click select and run the primary
  // action (toggle expansion or open a leaf detail tab once).
  const handleRowDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    clearClickTimer()
    handlePrimaryAction()
  }

  // Keyboard: Enter = primary action, Space = select action. Stop propagation
  // so the tree container's Enter/Space simulation can't double-fire.
  const handleRowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      handlePrimaryAction()
    } else if (e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      setFocusedNodePath(nodePath)
      handleSelectAction()
    }
  }

  // Primary action (double click / Enter): toggle expansion, or for a leaf
  // table/view/index open its detail tab exactly once.
  // The leaf detail navigation carries full explicit node identity (label,
  // database, path, schema) so the resolver never has to guess from path shape.
  const handlePrimaryAction = () => {
    const isLeafNode = !hasChildren || node.children?.length === 0
    if (isLeafNode && !isCategoryNode(node.label)) {
      // Leaf table/view/index: open detail tab once (single owner = onTreeNodeClick)
      onTreeNodeClick(
        node.label,
        node.databaseName,
        nodePath,
        node.schemaName,
      )
    } else {
      handleToggleExpand()
    }
  }

  // Check if this is an active connection (for styling)
  const isActiveConnection = isConnectionNode && isConnectionActive()

  return (
    <div
      id={`treeitem-${nodePath.replace(/\//g, '-')}`}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-selected={selectedTreeNode === nodePath}
    >
      <div
        data-node-path={nodePath}
        tabIndex={focusedNodePath === nodePath ? 0 : -1}
        data-is-group={isGroupNode ? 'true' : undefined}
        data-folder-name={isGroupNode ? node.label : undefined}
        data-drag-over={isDragOver && isGroupNode ? 'true' : undefined}
        onClick={handleRowClick}
        onDoubleClick={handleRowDoubleClick}
        onKeyDown={handleRowKeyDown}
        onPointerDown={(e) => {
          if (isConnectionNode) {
            handlePointerDown(e)
          }
        }}
        onContextMenu={(e) => {
          if (isGroupNode && folders) {
            e.preventDefault()
            e.stopPropagation()
            setFolderMenuPos({ x: e.clientX, y: e.clientY })
            setShowFolderMenu(true)
          } else if (isViewItem && onViewNodeContextMenu) {
            e.preventDefault()
            e.stopPropagation()
            onViewNodeContextMenu(e, contextMenuMeta)
          } else if (isTableItem && onTableNodeContextMenu) {
            e.preventDefault()
            e.stopPropagation()
            onTableNodeContextMenu(e, contextMenuMeta)
          } else if (
            isConnectionNode &&
            contextMenuMeta.connectionId &&
            onConnectionContextMenu
          ) {
            e.preventDefault()
            e.stopPropagation()
            onConnectionContextMenu(e, contextMenuMeta)
          } else if (
            isDatabaseNode &&
            !isCategoryNode(node.label) &&
            onDatabaseNodeContextMenu
          ) {
            e.preventDefault()
            e.stopPropagation()
            onDatabaseNodeContextMenu(e, contextMenuMeta)
          } else if (isSchemaNode && onSchemaNodeContextMenu) {
            e.preventDefault()
            e.stopPropagation()
            onSchemaNodeContextMenu(e, contextMenuMeta)
          } else if (
            isCategoryNode(node.label) &&
            node.label === 'Tables' &&
            onTablesCategoryContextMenu
          ) {
            e.preventDefault()
            e.stopPropagation()
            onTablesCategoryContextMenu(e, contextMenuMeta)
          } else if (isIndexItem && onIndexNodeContextMenu) {
            e.preventDefault()
            e.stopPropagation()
            onIndexNodeContextMenu(e, contextMenuMeta)
          }
        }}
        className={[
          'group flex w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-xs overflow-hidden cursor-pointer transition-all duration-150 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none',
          isGroupNode
            ? isDragOver
              ? 'ring-1 ring-inset ring-primary/40 bg-primary-subtle/30 text-text-secondary'
              : 'text-text-muted hover:text-text-secondary'
            : isActiveConnection
              ? 'bg-gradient-to-r from-primary-subtle/80 to-transparent text-text-secondary ring-1 ring-inset ring-focus-ring'
              : selectedTreeNode === nodePath
                ? 'bg-primary/15 text-primary dark:text-white ring-1 ring-inset ring-primary/20'
                : 'text-text-primary hover:text-text-secondary',
        ].join(' ')}
        style={{ paddingLeft: `${depth * 10 + 6}px` }}
      >
        {/* Chevron button: separate click target for expand/collapse */}
        {((hasChildren && !isLeaf) || isDatabaseNode) &&
        node.label !== 'Cluster' &&
        node.label !== 'Query Console' ? (
          <button
            type="button"
            onClick={handleChevronClick}
            className="flex shrink-0 items-center justify-center min-w-[18px] min-h-[18px] rounded-sm cursor-pointer"
          >
            <ChevronRight
              size={isGroupNode ? 9 : 11}
              className={[
                'text-text-muted transition-transform duration-150 group-hover:text-text-secondary',
                isExpanded ? 'rotate-90 text-primary' : '',
              ].join(' ')}
            />
          </button>
        ) : (
          <span className="shrink-0 min-w-[18px] min-h-[18px]" />
        )}
        {/* Primary icon */}
        {isGroupNode ? (
          <Folder size={11} className="shrink-0 text-text-muted" />
        ) : categoryIcon ? (
          categoryIcon
        ) : isConnectionNode ? (
          getConnectionIcon()
        ) : isDatabaseNode ? (
          <Database size={11} className="shrink-0 text-success" />
        ) : isTableItem ? (
          <Table size={11} className="shrink-0 text-primary" />
        ) : parentCategory === 'Views' ? (
          <Layers size={11} className="shrink-0 text-sky-500" />
        ) : parentCategory === 'Functions' ? (
          <Zap size={11} className="shrink-0 text-amber-500" />
        ) : parentCategory === 'Keys' ? (
          <Hash size={11} className="shrink-0 text-purple-500" />
        ) : parentCategory === 'Indexes' ? (
          <Zap size={11} className="shrink-0 text-orange-500" />
        ) : parentCategory === 'Exchanges' ? (
          <Layers size={11} className="shrink-0 text-green-500" />
        ) : parentCategory === 'Queues' ? (
          <List size={11} className="shrink-0 text-sky-500" />
        ) : parentCategory === 'Channels' ? (
          <MessageSquare size={11} className="shrink-0 text-pink-500" />
        ) : parentCategory === 'Indices' ? (
          <Database size={11} className="shrink-0 text-sky-500" />
        ) : (
          <FileText size={11} className="shrink-0 text-text-muted" />
        )}
        {isGroupNode && isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit()
              if (e.key === 'Escape') setIsRenaming(false)
            }}
            onBlur={handleRenameSubmit}
            className="min-w-0 flex-1 rounded border border-border-default bg-bg-base px-1 py-0 text-xs outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate min-w-0">{node.label}</span>
        )}

        {/* Group count badge */}
        {isGroupNode && (
          <span className="shrink-0 tabular-nums text-micro text-text-muted/60">
            {getGroupCount()}
          </span>
        )}

        {/* Loading indicator on the right */}
        {isConnectionNode && isConnectionLoading() && (
          <span className="shrink-0 ml-auto">
            <CenteredLoadingState
              loading={true}
              label=""
              iconSize={3}
              showElapsed={false}
            />
          </span>
        )}
      </div>

      {/* Folder context menu */}
      {showFolderMenu && isGroupNode && (
        <div
          ref={folderMenuRef}
          style={{
            position: 'fixed',
            left: folderMenuPos.x,
            top: folderMenuPos.y,
            zIndex: 9999,
          }}
          className="min-w-[140px] rounded-lg border border-border-default bg-bg-base py-1 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-bg-subtle transition-colors"
            onClick={() => {
              setIsRenaming(true)
              setRenameValue(node.label)
              setShowFolderMenu(false)
            }}
          >
            <Pencil size={12} />
            Rename Folder
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-danger hover:bg-danger-subtle/20 transition-colors"
            onClick={() => {
              const folderId = getFolderId()
              if (folderId && onDeleteFolder) {
                if (
                  window.confirm(
                    `Delete folder "${node.label}"? Connections inside will be moved to ungrouped.`,
                  )
                ) {
                  onDeleteFolder(folderId)
                }
              }
              setShowFolderMenu(false)
            }}
          >
            <Trash2 size={12} />
            Delete Folder
          </button>
        </div>
      )}

      {/* Connection-specific content (error messages, loading states) */}
      {isConnectionNode && isExpanded && node.connectionId && (
        <div className="relative ml-2 mt-0.5 pl-1.5">
          {/* Gradient thread connecting to parent */}
          <span
            aria-hidden
            className="absolute bottom-2 left-0 top-0 w-px bg-gradient-to-b from-border-default/80 via-border-default/40 to-transparent"
          />
          {node.connectionId && elasticIndicesError?.[node.connectionId] && (
            <div className="mx-1 my-1 rounded-md border border-danger-subtle/80 bg-danger-subtle/80 px-2 py-1.5">
              <p className="text-caption text-danger">Failed to load indices</p>
              <p className="mt-0.5 truncate text-micro text-danger/80">
                {elasticIndicesError[node.connectionId]}
              </p>
              {handleRetryElasticIndices && (
                <button
                  type="button"
                  onClick={() => handleRetryElasticIndices(node.connectionId!)}
                  className="mt-1 text-micro text-primary transition-colors hover:text-primary-hover hover:underline"
                >
                  Retry
                </button>
              )}
            </div>
          )}
          {node.children?.length === 0 &&
            !explorerData?.treeLoading?.[node.connectionId] &&
            !elasticIndicesError?.[node.connectionId] && (
              <p className="px-2 py-1 text-caption italic text-text-muted">
                No metadata available
              </p>
            )}
        </div>
      )}

      <div className="relative">
        {/* Vertical guide line from chevron to last child */}
        {isExpanded &&
          !isQueriesFolder &&
          !isLeaf &&
          node.children &&
          node.children.length > 0 && (
            <span
              aria-hidden
              className="absolute top-0 bottom-0 w-px bg-border-default/40"
              style={{ left: `${depth * 10 + 15}px` }}
            />
          )}
        {isExpanded &&
          node.children?.map((child) => (
            <TreeNodeItem
              key={child.label}
              node={child}
              depth={depth + 1}
              parentPath={nodePath}
              parentConnectionId={node.connectionId ?? parentConnectionId}
              selectedTreeNode={selectedTreeNode}
              expandedTreePaths={expandedTreePaths}
              onTreeNodeClick={onTreeNodeClick}
              onSelectedTreeNode={onSelectedTreeNode}
              onToggleTreeNode={onToggleTreeNode}
              onFetchDatabaseDetails={onFetchDatabaseDetails}
              onQueryNavigate={onQueryNavigate}
              onTablesCategoryClick={onTablesCategoryClick}
              onConnectionSelect={onConnectionSelect}
              onGroupToggle={onGroupToggle}
              onConnectionToggle={onConnectionToggle}
              onViewNodeContextMenu={onViewNodeContextMenu}
              onTableNodeContextMenu={onTableNodeContextMenu}
              onIndexNodeContextMenu={onIndexNodeContextMenu}
              onConnectionContextMenu={onConnectionContextMenu}
              onDatabaseNodeContextMenu={onDatabaseNodeContextMenu}
              onSchemaNodeContextMenu={onSchemaNodeContextMenu}
              onTablesCategoryContextMenu={onTablesCategoryContextMenu}
              groupedConnections={groupedConnections}
              explorerData={explorerData}
              elasticIndicesError={elasticIndicesError}
              elasticLoading={elasticLoading}
              handleRetryElasticIndices={handleRetryElasticIndices}
              focusedNodePath={focusedNodePath}
              setFocusedNodePath={setFocusedNodePath}
              folders={folders}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onMoveConnectionToFolder={onMoveConnectionToFolder}
            />
          ))}
      </div>
    </div>
  )
}
