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
} from "lucide-react";
import type { TreeNode, SavedQuery, ExplorerTreeData } from "../types/shared";
import type { ConnectionProfile } from "../types/domain";
import { databaseTypeOptions } from "../constants";
import { CenteredLoadingState } from "./CenteredLoadingState";

interface ExplorerDataContext {
  treeDataMap: Record<string, ExplorerTreeData>;
  treeLoading: Record<string, boolean>;
}

const CATEGORY_LABELS = [
  "Tables",
  "Views",
  "Functions",
  "Queries",
  "Keys",
  "Indexes",
  "Exchanges",
  "Queues",
  "Channels",
  // Elasticsearch
  "Cluster",
  "Indices",
  "Query Console",
  "Mapping",
];

function isCategoryNode(label: string): boolean {
  return CATEGORY_LABELS.includes(label);
}

/**
 * Returns an icon component to use for a given category label.
 */
function getCategoryIcon(label: string) {
  switch (label) {
    case "Tables":
      return <Table size={11} className="shrink-0 text-primary" />;
    case "Views":
      return <Eye size={11} className="shrink-0 text-sky-500" />;
    case "Functions":
      return <Code size={11} className="shrink-0 text-amber-500" />;
    case "Queries":
      return <FileText size={11} className="shrink-0 text-emerald-500" />;
    case "Keys":
      return <Hash size={11} className="shrink-0 text-purple-500" />;
    case "Indexes":
      return <Zap size={11} className="shrink-0 text-orange-500" />;
    case "Cluster":
      return <Activity size={11} className="shrink-0 text-emerald-500" />;
    case "Indices":
      return <Database size={11} className="shrink-0 text-sky-500" />;
    case "Query Console":
      return <Terminal size={11} className="shrink-0 text-amber-500" />;
    case "Mapping":
      return <Braces size={11} className="shrink-0 text-violet-500" />;
    case "Exchanges":
      return <Layers size={11} className="shrink-0 text-green-500" />;
    case "Queues":
      return <List size={11} className="shrink-0 text-sky-500" />;
    case "Channels":
      return <MessageSquare size={11} className="shrink-0 text-pink-500" />;
    default:
      return null;
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
  onTableNavigate,
  onQueryNavigate,
  onTablesCategoryClick,
  onConnectionSelect,
  onGroupToggle,
  onConnectionToggle,
  savedQueries,
  onUseSavedQuery,
  onTableNodeContextMenu,
  onConnectionContextMenu,
  savedQueriesByConnection,
  groupedConnections,
  explorerData,
  elasticIndicesError,
  elasticLoading,
  handleRetryElasticIndices,
  focusedNodePath,
  setFocusedNodePath,
}: {
  node: TreeNode;
  depth: number;
  parentPath: string;
  selectedTreeNode: string | null;
  expandedTreePaths: string[];
  onTreeNodeClick: (
    nodeLabel: string,
    databaseName?: string,
    nodePath?: string,
  ) => void;
  onSelectedTreeNode: (label: string | null) => void;
  onToggleTreeNode: (path: string) => void;
  onFetchDatabaseDetails?: (dbName: string) => void;
  onTableNavigate?: (tableName: string) => void;
  onQueryNavigate?: () => void;
  onTablesCategoryClick?: () => void;
  onConnectionSelect?: (nodePath: string, connectionId: string) => void;
  onGroupToggle?: (groupPath: string) => void;
  onConnectionToggle?: (connectionPath: string, connectionId: string) => void;
  savedQueries?: SavedQuery[];
  onUseSavedQuery?: (sql: string) => void;
  onTableNodeContextMenu?: (event: React.MouseEvent, connectionId: string, tableName: string) => void;
  onConnectionContextMenu?: (event: React.MouseEvent, itemId: string) => void;
  savedQueriesByConnection?: Record<string, SavedQuery[]>;
  groupedConnections?: Record<string, ConnectionProfile[]> | null;
  explorerData?: ExplorerDataContext;
  elasticIndicesError?: Record<string, string>;
  elasticLoading?: Record<string, boolean>;
  handleRetryElasticIndices?: (connectionId: string) => void;
  focusedNodePath: string | null;
  setFocusedNodePath: (path: string | null) => void;
}) {
  const nodePath = parentPath ? `${parentPath}/${node.label}` : node.label;
  const hasChildren = node.children !== undefined;
  const isExpanded = expandedTreePaths.includes(nodePath);
  const isGroupNode = node.nodeType === 'group';
  const isConnectionNode = node.nodeType === 'connection';
  // In the unified tree: depth 0 = groups, depth 1 = connections, depth 2 = databases/categories
  const isDatabaseNode = depth === 2 && !isGroupNode && !isConnectionNode;
  const isLeaf =
    !hasChildren ||
    (node.children && node.children.length === 0 && isCategoryNode(node.label));
  const isTableItem =
    isLeaf && !isCategoryNode(node.label) && parentPath.endsWith("/Tables");
  const parentCategory = parentPath.split("/").pop() ?? "";
  const isQueriesFolder = node.label === "Queries";
  const categoryIcon = isCategoryNode(node.label)
    ? getCategoryIcon(node.label)
    : null;

  // Get connection profile for connection nodes
  const connectionProfile = isConnectionNode && node.connectionId && groupedConnections
    ? Object.values(groupedConnections).flat().find(p => p.id === node.connectionId)
    : null;

  // Get database type icon for connection nodes
  const getConnectionIcon = () => {
    if (!connectionProfile) return <Database size={11} className="shrink-0 text-text-secondary" />;
    const dbOption = databaseTypeOptions.find(opt => opt.value === connectionProfile.type);
    return dbOption?.Icon ? (
      <dbOption.Icon size={11} className="shrink-0 text-text-secondary" />
    ) : (
      <Database size={11} className="shrink-0 text-text-secondary" />
    );
  };

  // Get count for group nodes
  const getGroupCount = () => {
    if (!isGroupNode || !groupedConnections) return 0;
    return groupedConnections[node.label]?.length ?? 0;
  };

  // Check if connection is loading
  const isConnectionLoading = () => {
    if (!isConnectionNode || !node.connectionId) return false;
    return explorerData?.treeLoading?.[node.connectionId] || elasticLoading?.[node.connectionId];
  };

  // Check if connection is active (selected)
  const isConnectionActive = () => {
    if (!isConnectionNode || !node.connectionId || !selectedTreeNode) return false;
    // Check if this connection or any of its children are selected
    return selectedTreeNode === nodePath || selectedTreeNode?.startsWith(nodePath);
  };

  // Chevron click: only toggles expand/collapse
  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (isGroupNode) {
      onGroupToggle?.(nodePath);
    } else if (isConnectionNode && node.connectionId) {
      onConnectionToggle?.(nodePath, node.connectionId);
    } else if (isDatabaseNode && !isCategoryNode(node.label)) {
      if (!isExpanded) {
        onToggleTreeNode(nodePath);
        onFetchDatabaseDetails?.(node.label);
      } else {
        onToggleTreeNode(nodePath);
      }
    } else {
      onToggleTreeNode(nodePath);
    }
  };

  // Label click: selects the node, navigates, and expands if expandable
  const handleLabelClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFocusedNodePath(nodePath);
    
    if (isGroupNode) {
      // Groups are containers, just toggle expand
      onGroupToggle?.(nodePath);
    } else if (isConnectionNode && node.connectionId) {
      // Select connection and navigate
      onConnectionSelect?.(nodePath, node.connectionId);
      onSelectedTreeNode(nodePath);
      if (!isExpanded) {
        onConnectionToggle?.(nodePath, node.connectionId);
      }
    } else if (isDatabaseNode && isCategoryNode(node.label)) {
      // ES-style category nodes at depth 2 (direct children of connection)
      onSelectedTreeNode(nodePath);
      onTreeNodeClick(node.label, undefined, nodePath);
    } else if (isDatabaseNode) {
      onSelectedTreeNode(nodePath);
      if (!isExpanded) {
        onToggleTreeNode(nodePath);
        onFetchDatabaseDetails?.(node.label);
      }
    } else if (node.label === "Queries") {
      onSelectedTreeNode(nodePath);
      if (!isExpanded) {
        onToggleTreeNode(nodePath);
      }
      onQueryNavigate?.();
    } else if (!hasChildren || (node.children && node.children.length === 0)) {
      // Leaf nodes (including leaf category nodes like "Indexes" with no children)
      onSelectedTreeNode(nodePath);
      if (!isCategoryNode(node.label)) {
        // In unified tree: path is groupName/connName/dbName/..., so [2] is the database name
        const pathParts = parentPath.split("/");
        const databaseName = pathParts.length >= 3 ? pathParts[2] : pathParts[0];
        onTreeNodeClick(node.label, databaseName, nodePath);
        if (isTableItem) {
          onTableNavigate?.(node.label);
        }
      }
    } else {
      // Parent category nodes ("Tables", "Views", "Functions", "Keys", etc.)
      // Expand the node AND open the corresponding page simultaneously
      onSelectedTreeNode(nodePath);
      if (!isExpanded && node.label !== "Tables") {
        onToggleTreeNode(nodePath);
      }
      // In unified tree: path is groupName/connName/dbName/..., so [2] is the database name
      const pathParts = parentPath.split("/");
      const databaseName = pathParts.length >= 3 ? pathParts[2] : pathParts[0];
      onTreeNodeClick(node.label, databaseName, nodePath);
      if (node.label === "Tables") {
        onTablesCategoryClick?.();
      }
    }
  };

  // Get saved queries for this connection
  const connectionSavedQueries = isConnectionNode && node.connectionId && savedQueriesByConnection
    ? savedQueriesByConnection[node.connectionId]
    : savedQueries;

  // Check if this is an active connection (for styling)
  const isActiveConnection = isConnectionNode && isConnectionActive();

  return (
    <div id={`treeitem-${nodePath.replace(/\//g, "-")}`} role="treeitem" aria-level={depth + 1} aria-expanded={hasChildren ? isExpanded : undefined} aria-selected={selectedTreeNode === nodePath}>
      <div
        data-node-path={nodePath}
        tabIndex={focusedNodePath === nodePath ? 0 : -1}
        onClick={(e) => {
          e.stopPropagation();
          handleLabelClick(e);
        }}
        onContextMenu={(e) => {
          if (isTableItem && onTableNodeContextMenu) {
            e.preventDefault()
            e.stopPropagation()
            // In unified tree: path is groupName/connName/dbName/..., so [1] is the connection name
            const pathParts = parentPath.split("/");
            const connName = pathParts.length >= 3 ? pathParts[1] : pathParts[0];
            // Resolve connection name to ID via groupedConnections
            const conn = groupedConnections
              ? Object.values(groupedConnections).flat().find(p => p.name === connName || p.id === connName)
              : null;
            const connectionId = conn?.id ?? connName;
            onTableNodeContextMenu(e, connectionId, node.label)
          } else if (isConnectionNode && node.connectionId && onConnectionContextMenu) {
            e.preventDefault()
            e.stopPropagation()
            onConnectionContextMenu(e, node.connectionId)
          }
        }}
        className={[
          "group flex w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-xs overflow-hidden cursor-pointer transition-all duration-150 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none",
          isGroupNode
            ? "text-text-muted hover:text-text-secondary"
            : isActiveConnection
              ? "bg-gradient-to-r from-primary-subtle/80 to-transparent text-text-secondary ring-1 ring-inset ring-focus-ring"
              : selectedTreeNode === nodePath
                ? "bg-primary/10 text-primary"
                : "text-text-primary hover:text-text-secondary",
        ].join(" ")}
        style={{ paddingLeft: `${depth * 10 + 6}px` }}
      >
        {/* Chevron button: separate click target for expand/collapse */}
        {(hasChildren && !isLeaf) || isDatabaseNode ? (
          <button
            type="button"
            onClick={handleChevronClick}
            className="flex shrink-0 items-center justify-center min-w-[18px] min-h-[18px] rounded-sm cursor-pointer"
          >
            <ChevronRight
              size={isGroupNode ? 9 : 11}
              className={[
                "text-text-muted transition-transform duration-150 group-hover:text-text-secondary",
                isExpanded ? "rotate-90 text-primary" : "",
              ].join(" ")}
            />
          </button>
        ) : (
          <span className="shrink-0 min-w-[18px] min-h-[18px]" />
        )}
        
        {/* Loading indicator for connections */}
        {isConnectionNode && isConnectionLoading() ? (
          <span className="shrink-0">
            <CenteredLoadingState
              loading={true}
              label=""
              iconSize={3}
              showElapsed={false}
            />
          </span>
        ) : (
          <>
            {/* Primary icon */}
            {isGroupNode ? (
              <Folder size={11} className="shrink-0 text-text-muted" />
            ) : categoryIcon ? (
              categoryIcon
            ) : isConnectionNode ? (
              getConnectionIcon()
            ) : isDatabaseNode ? (
              <Database
                size={11}
                className="shrink-0 text-success"
              />
            ) : isTableItem ? (
              <Table size={11} className="shrink-0 text-primary" />
            ) : parentCategory === "Views" ? (
              <Layers size={11} className="shrink-0 text-sky-500" />
            ) : parentCategory === "Functions" ? (
              <Zap size={11} className="shrink-0 text-amber-500" />
            ) : parentCategory === "Keys" ? (
              <Hash size={11} className="shrink-0 text-purple-500" />
            ) : parentCategory === "Indexes" ? (
              <Zap size={11} className="shrink-0 text-orange-500" />
            ) : parentCategory === "Exchanges" ? (
              <Layers size={11} className="shrink-0 text-green-500" />
            ) : parentCategory === "Queues" ? (
              <List size={11} className="shrink-0 text-sky-500" />
            ) : parentCategory === "Channels" ? (
              <MessageSquare size={11} className="shrink-0 text-pink-500" />
            ) : parentCategory === "Indices" ? (
              <Database size={11} className="shrink-0 text-sky-500" />
            ) : (
              <FileText size={11} className="shrink-0 text-text-muted" />
            )}
            <span className="truncate min-w-0">{node.label}</span>
            
            {/* Group count badge */}
            {isGroupNode && (
              <span className="shrink-0 tabular-nums text-micro text-text-muted/60">
                {getGroupCount()}
              </span>
            )}
          </>
        )}
      </div>
      
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
              <p className="mt-0.5 truncate text-micro text-danger/80">{elasticIndicesError[node.connectionId]}</p>
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
          {node.children?.length === 0 && !explorerData?.treeLoading?.[node.connectionId] && !elasticIndicesError?.[node.connectionId] && (
            <p className="px-2 py-1 text-caption italic text-text-muted">
              No metadata available
            </p>
          )}
        </div>
      )}
      
      <div className="relative">
        {/* Vertical guide line from chevron to last child */}
        {isExpanded && !isQueriesFolder && !isLeaf && node.children && node.children.length > 0 && (
          <span
            aria-hidden
            className="absolute top-0 bottom-0 w-px bg-border-default/40"
            style={{ left: `${depth * 10 + 15}px` }}
          />
        )}
      {isExpanded &&
        (isQueriesFolder ? (
          <div>
            {connectionSavedQueries && connectionSavedQueries.length > 0 ? (
              connectionSavedQueries.map((sq) => (
                <button
                  key={sq.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const sqPath = `${nodePath}/${sq.id}`;
                    onSelectedTreeNode?.(sqPath);
                    onUseSavedQuery?.(sq.sql);
                  }}
                  className={[
                    "group flex w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-caption overflow-hidden cursor-pointer transition-all duration-150",
                    selectedTreeNode === `${nodePath}/${sq.id}`
                      ? "bg-primary/10 text-primary"
                      : "text-text-primary hover:bg-bg-hover/60 hover:text-text-secondary",
                  ].join(" ")}
                  style={{ paddingLeft: `${(depth + 1) * 10 + 6}px` }}
                  title={sq.sql}
                >
                  <span className="shrink-0 min-w-[20px] min-h-[20px]" />
                  <FileText size={11} className="shrink-0 text-amber-500" />
                  <span className="min-w-0 flex-1 truncate">{sq.title}</span>
                  <span className="shrink-0 rounded bg-bg-muted/60 px-1 text-mono text-micro tabular-nums text-text-secondary">
                    {new Date(sq.updatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </button>
              ))
            ) : (
              <p
                className="px-2 py-1 text-caption italic text-text-muted"
                style={{ paddingLeft: `${(depth + 1) * 10 + 6}px` }}
              >
                No saved queries
              </p>
            )}
          </div>
        ) : (
          node.children?.map((child) => (
            <TreeNodeItem
              key={child.label}
              node={child}
              depth={depth + 1}
              parentPath={nodePath}
              selectedTreeNode={selectedTreeNode}
              expandedTreePaths={expandedTreePaths}
              onTreeNodeClick={onTreeNodeClick}
              onSelectedTreeNode={onSelectedTreeNode}
              onToggleTreeNode={onToggleTreeNode}
              onFetchDatabaseDetails={onFetchDatabaseDetails}
              onTableNavigate={onTableNavigate}
              onQueryNavigate={onQueryNavigate}
              onTablesCategoryClick={onTablesCategoryClick}
              onConnectionSelect={onConnectionSelect}
              onGroupToggle={onGroupToggle}
              onConnectionToggle={onConnectionToggle}
              savedQueries={savedQueries}
              onUseSavedQuery={onUseSavedQuery}
              onTableNodeContextMenu={onTableNodeContextMenu}
              onConnectionContextMenu={onConnectionContextMenu}
              savedQueriesByConnection={savedQueriesByConnection}
              groupedConnections={groupedConnections}
              explorerData={explorerData}
              elasticIndicesError={elasticIndicesError}
              elasticLoading={elasticLoading}
              handleRetryElasticIndices={handleRetryElasticIndices}
              focusedNodePath={focusedNodePath}
              setFocusedNodePath={setFocusedNodePath}
            />
          ))
        ))}
      </div>
    </div>
  );
}
