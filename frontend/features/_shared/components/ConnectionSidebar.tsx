import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Braces,
  ChevronRight,
  ChevronsLeftRightEllipsis,
  Database,
  FileText,
  Folder,
  FolderOpen,
  Hash,
  Layers,
  List,
  MessageSquare,
  Plus,
  Table,
  Terminal,
  Zap,
} from "lucide-react";
import { CenteredLoadingState } from "./CenteredLoadingState";
import type { ConnectionType } from "../types/domain";
import type { ElasticIndex } from "../../elasticsearch/types/elasticsearch";
import type { TreeNode, SavedQuery } from "../types/shared";
import { databaseTypeOptions } from "../constants";
import { isSqlConnectionType } from "../utils";
import { useDataExplorerContext } from "../context/DataExplorerContext";

/**
 * ConnectionSidebar — connection tree panel.
 *
 * After the five-region layout refactor (task-025) this component no
 * longer receives props. All state is read from `useDataExplorerContext`,
 * eliminating the ~21-prop drilling surface from the legacy `AppShell`
 * era.
 */
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
 * Returns static tree nodes for non-SQL connection types.
 * SQL types (postgresql, mysql) use dynamic tree from getTreeNodesForConnection.
 * @param indices - optional Elasticsearch indices to populate the "Indices" node children.
 */
function getStaticTreeNodes(type: ConnectionType, indices?: ElasticIndex[]): TreeNode[] {
  switch (type) {
    case "redis":
      return [
        { label: "Keys", children: [] },
        { label: "Indexes", children: [] },
        { label: "Queries", children: [] },
      ];
    case "mongodb":
      return [
        { label: "Tables", children: [] },
        { label: "Views", children: [] },
        { label: "Indexes", children: [] },
        { label: "Queries", children: [] },
      ];
    case "elasticsearch":
      return [
        { label: "Cluster", children: [] },
        {
          label: "Indices",
          children: indices
            ? indices
              .filter((idx) => !idx.index.startsWith("."))
              .map((idx) => ({ label: idx.index }))
            : [],
        },
        { label: "Query Console", children: [] },
        { label: "Mapping", children: [] },
      ];
    case "rabbitmq":
      return [
        { label: "Exchanges", children: [] },
        { label: "Queues", children: [] },
        { label: "Channels", children: [] },
      ];
    default:
      return [];
  }
}

/**
 * Returns an icon component to use for a given category label.
 */
function getCategoryIcon(label: string) {
  switch (label) {
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

function TreeNodeItem({
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
  savedQueries,
  onUseSavedQuery,
  onTableNodeContextMenu,
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
  savedQueries?: SavedQuery[];
  onUseSavedQuery?: (sql: string) => void;
  onTableNodeContextMenu?: (event: React.MouseEvent, connectionId: string, tableName: string) => void;
}) {
  const nodePath = parentPath ? `${parentPath}/${node.label}` : node.label;
  const hasChildren = node.children !== undefined;
  const isExpanded = expandedTreePaths.includes(nodePath);
  const isDatabaseNode = depth === 0;
  const isLeaf =
    !hasChildren ||
    (node.children && node.children.length === 0 && isCategoryNode(node.label));
  const isTableItem =
    isLeaf && !isCategoryNode(node.label) && parentPath.endsWith("/Tables");
  const isDbOpen = isDatabaseNode && isExpanded;
  const isQueriesFolder = node.label === "Queries";
  const categoryIcon = isCategoryNode(node.label)
    ? getCategoryIcon(node.label)
    : null;

  const handleClick = () => {
    if (isDatabaseNode && isCategoryNode(node.label)) {
      // ES-style category nodes at depth 0 (Cluster, Indices, Documents, etc.)
      // Navigate to panel and toggle expansion
      onSelectedTreeNode(node.label);
      onToggleTreeNode(nodePath);
      onTreeNodeClick(node.label, undefined, nodePath);
    } else if (isDatabaseNode) {
      onToggleTreeNode(nodePath);
      if (!isExpanded) {
        onFetchDatabaseDetails?.(node.label);
      }
    } else if (node.label === "Queries") {
      onSelectedTreeNode(node.label);
      onToggleTreeNode(nodePath);
      onQueryNavigate?.();
    } else if (!hasChildren || (node.children && node.children.length === 0)) {
      if (isCategoryNode(node.label)) {
        onToggleTreeNode(nodePath);
        return;
      }
      onSelectedTreeNode(node.label);
      const databaseName = parentPath.split("/")[0];
      onTreeNodeClick(node.label, databaseName, nodePath);
      // Navigate to table detail if this is a table item
      if (isTableItem) {
        onTableNavigate?.(node.label);
      }
    } else {
      onToggleTreeNode(nodePath);
      if (node.label === "Tables") {
        onSelectedTreeNode(node.label);
        const databaseName = parentPath.split("/")[0];
        onTreeNodeClick(node.label, databaseName, nodePath);
        onTablesCategoryClick?.();
      }
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleClick();
        }}
        onContextMenu={(e) => {
          if (isTableItem && onTableNodeContextMenu) {
            e.preventDefault()
            e.stopPropagation()
            // Derive connectionId from the top-level parent path (database node is the connection)
            const connectionId = parentPath.split("/")[0]
            onTableNodeContextMenu(e, connectionId, node.label)
          }
        }}
        className={[
          "group flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium overflow-hidden cursor-pointer transition-all duration-150",
          selectedTreeNode === node.label
            ? "bg-primary/10 text-primary"
            : "text-on-surface hover:bg-surface-variant/70 hover:text-on-surface-variant",
        ].join(" ")}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {/* Chevron indicator for expandable nodes with children (left-most) */}
        {hasChildren && !isLeaf ? (
          <ChevronRight
            size={11}
            className={[
              "shrink-0 text-slate-400 transition-transform duration-150 group-hover:text-slate-500",
              isExpanded ? "rotate-90 text-blue-500" : "",
            ].join(" ")}
          />
        ) : (
          <span className="shrink-0" style={{ width: 11 }} />
        )}
        {/* Primary icon */}
        {isTableItem ? (
          <Table size={11} className="shrink-0 text-primary-container" />
        ) : categoryIcon ? (
          categoryIcon
        ) : isDatabaseNode ? (
          <Database
            size={11}
            className={`shrink-0 ${isDbOpen ? "text-success" : "text-on-surface-variant"}`}
          />
        ) : null}
        <span className="truncate min-w-0">{node.label}</span>
      </button>
      {isExpanded &&
        (isQueriesFolder ? (
          <div>
            {savedQueries && savedQueries.length > 0 ? (
              savedQueries.map((sq) => (
                <button
                  key={sq.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectedTreeNode?.(sq.id);
                    onUseSavedQuery?.(sq.sql);
                  }}
                  className={[
                    "group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] overflow-hidden cursor-pointer transition-all duration-150",
                    selectedTreeNode === sq.id
                      ? "bg-primary/10 text-primary"
                      : "text-on-surface hover:bg-surface-variant/70 hover:text-on-surface-variant",
                  ].join(" ")}
                  style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
                  title={sq.sql}
                >
                  <FileText size={11} className="shrink-0 text-amber-500" />
                  <span className="min-w-0 flex-1 truncate">{sq.title}</span>
                  <span className="shrink-0 rounded bg-surface-variant/60 px-1 text-[9px] font-medium tabular-nums text-slate-500">
                    {new Date(sq.updatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </button>
              ))
            ) : (
              <p
                className="px-2 py-1 text-[11px] italic text-slate-400"
                style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
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
              savedQueries={savedQueries}
              onUseSavedQuery={onUseSavedQuery}
              onTableNodeContextMenu={onTableNodeContextMenu}
            />
          ))
        ))}
    </div>
  );
}

export function ConnectionSidebar() {
  const {
    groupedConnections,
    selectedConnection,
    expandedConnectionId,
    selectedTreeNode,
    expandedTreePaths,
    openCreateWizard,
    handleConnectionSelectionChange,
    setExpandedConnectionId,
    setContextMenu,
    explorerData,
    wrappedHandleTreeNodeClick,
    setSelectedTreeNode,
    handleToggleTreeNode,
    handleFetchDatabaseDetails,
    queryExecution,
    elasticIndices,
    elasticIndicesError,
    elasticLoading,
    handleRetryElasticIndices,
  } = useDataExplorerContext()

  const navigate = useNavigate()
  const savedQueriesByConnection = queryExecution.savedQueriesByConnection

  // URL-driven navigation handlers
  const handleTableNavigate = useCallback(
    (tableName: string) => {
      const connectionId = selectedConnection?.id;
      if (!connectionId) return;
      navigate(`/sql/${connectionId}/tables/${encodeURIComponent(tableName)}`);
    },
    [selectedConnection?.id, navigate],
  );

  const handleQueryNavigate = useCallback(() => {
    const connectionId = selectedConnection?.id;
    if (!connectionId) return;
    navigate(`/sql/${connectionId}/query`);
  }, [selectedConnection?.id, navigate]);

  const handleTablesCategoryClick = useCallback(() => {
    const connectionId = selectedConnection?.id;
    if (!connectionId) return;
    navigate(`/sql/${connectionId}/tables`);
  }, [selectedConnection?.id, navigate]);

  const handleConnectionSelect = useCallback(
    (connectionId: string) => {
      handleConnectionSelectionChange(connectionId);
      navigate(`/sql/${connectionId}`);
    },
    [handleConnectionSelectionChange, navigate],
  );

  // Track which groups are collapsed; default is expanded (empty set).
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );

  const isGroupCollapsed = (group: string): boolean =>
    collapsedGroups.has(group);

  const toggleGroup = (group: string): void => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  const handleToggleExpand = (id: string) => {
    setExpandedConnectionId(expandedConnectionId === id ? null : id)
  }

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

  const applySavedQueryToActiveTab = queryExecution.applySavedQueryToActiveTab

  return (
    <aside className="flex h-full min-w-0 flex-col overflow-hidden bg-surface-container-low/40">
      {/* Header (fixed) */}
      <div className="flex shrink-0 items-center justify-between border-b border-outline-variant/60 bg-surface-container-lowest/60 pl-3 pr-2.5 py-2.5 backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <ChevronsLeftRightEllipsis size={14} className="text-on-surface-variant" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface">
            Connections
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateWizard}
          className="rounded-md p-1 text-on-surface-variant transition-all duration-150 hover:bg-surface-variant hover:text-primary active:scale-95"
          aria-label="Create connection"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Scrollable connection list (scrollbar scoped here) */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-2">
        {Object.entries(groupedConnections).map(([group, profiles]) => {
          const collapsed = isGroupCollapsed(group);
          return (
            <section key={group} className="space-y-0.5">
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                aria-expanded={!collapsed}
                aria-controls={`group-${group}-content`}
                className="group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 transition-all duration-150 hover:bg-surface-variant/60 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                
                {collapsed ? (
                  <Folder
                    size={11}
                    className="shrink-0 text-slate-400 transition-colors group-hover:text-slate-500"
                  />
                ) : (
                  <FolderOpen
                    size={11}
                    className="shrink-0 text-blue-500 transition-colors"
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{group}</span>
                {/* Horizontal separator */}
                <span
                  aria-hidden
                  className="mx-1 h-px flex-1 bg-gradient-to-r from-outline-variant/70 via-outline-variant/40 to-transparent"
                />
                <ChevronRight
                  size={11}
                  className={[
                    "shrink-0 text-slate-400 transition-transform duration-200 group-hover:text-slate-500",
                    collapsed ? "" : "rotate-90",
                  ].join(" ")}
                />
              </button>
              <div
                id={`group-${group}-content`}
                className={[
                  "overflow-hidden transition-all duration-200 ease-in-out",
                  collapsed
                    ? "max-h-0 opacity-0"
                    : "max-h-[5000px] opacity-100",
                ].join(" ")}
                aria-hidden={collapsed}
              >
                <div className="space-y-0.5 pt-0.5">
                  {profiles.map((item) => {
                    const active = selectedConnection?.id === item.id;
                    const logo = databaseTypeOptions.find(
                      (option) => option.value === item.type,
                    )?.logoSrc;
                    const isLoading = explorerData.treeLoading[item.id] || !!elasticLoading?.[item.id];
                    const connectionSavedQueries = savedQueriesByConnection[item.id] ?? [];

                    // Get tree nodes based on connection type
                    const sqlTreeNodes = isSqlConnectionType(item.type)
                      ? explorerData.getTreeNodesForConnection(item)
                      : [];
                    const connectionIndices = elasticIndices?.[item.id];
                    const staticTreeNodes = isSqlConnectionType(item.type)
                      ? []
                      : getStaticTreeNodes(item.type, connectionIndices);
                    const treeNodes =
                      sqlTreeNodes.length > 0 ? sqlTreeNodes : staticTreeNodes;

                    return (
                      <div key={item.id} className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            handleConnectionSelect(item.id);
                            handleToggleExpand(item.id);
                          }}
                          onContextMenu={(event) => handleContextMenu(event, item.id)}
                          className={[
                            "group flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-[11px] transition-all duration-150 overflow-hidden",
                            active
                              ? "bg-gradient-to-r from-blue-50/80 to-transparent pl-[9px] text-on-surface-variant shadow-[inset_0_0_0_1px_rgba(59,130,246,0.12)] dark:from-blue-950/30"
                              : "pl-[7px] text-on-surface hover:bg-surface-variant/60 hover:text-on-surface-variant active:scale-[0.99]",
                          ].join(" ")}
                        >
                          {isLoading ? (
                            <span className="shrink-0">
                              <CenteredLoadingState
                                loading={true}
                                label=""
                                iconSize={3}
                                showElapsed={false}
                              />
                            </span>
                          ) : (
                            <ChevronRight
                              size={12}
                              className={[
                                "shrink-0 transition-all duration-150",
                                expandedConnectionId === item.id
                                  ? "rotate-90 text-blue-500"
                                  : "text-slate-400 group-hover:text-slate-500",
                              ].join(" ")}
                            />
                          )}
                          <span
                            className={[
                              "grid h-5 w-5 shrink-0 place-items-center rounded-md transition-all duration-150",
                              active
                                ? "bg-blue-100/80 text-blue-600 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.2)] dark:bg-blue-950/50"
                                : "bg-surface-variant/60 text-on-surface-variant group-hover:bg-surface-variant",
                            ].join(" ")}
                          >
                            {logo ? (
                              <img
                                src={logo}
                                alt={item.type}
                                className="h-3 w-3 object-contain"
                              />
                            ) : (
                              <Database size={11} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {item.name}
                          </span>
                        </button>
                        {expandedConnectionId === item.id && (
                          <div className="relative ml-2 mt-0.5 pl-1.5">
                            {/* Gradient thread connecting to parent */}
                            <span
                              aria-hidden
                              className="absolute bottom-2 left-0 top-0 w-px bg-gradient-to-b from-outline-variant/80 via-outline-variant/40 to-transparent"
                            />
                            {elasticIndicesError?.[item.id] && (
                              <div className="mx-1 my-1 rounded-md border border-red-200/80 bg-red-50/80 px-2 py-1.5 dark:border-red-900/50 dark:bg-red-950/30">
                                <p className="text-[11px] font-medium text-red-600 dark:text-red-400">Failed to load indices</p>
                                <p className="mt-0.5 truncate text-[10px] text-red-500/80 dark:text-red-400/70">{elasticIndicesError[item.id]}</p>
                                {handleRetryElasticIndices && (
                                  <button
                                    type="button"
                                    onClick={() => handleRetryElasticIndices(item.id)}
                                    className="mt-1 text-[10px] font-medium text-blue-600 transition-colors hover:text-blue-700 hover:underline"
                                  >
                                    Retry
                                  </button>
                                )}
                              </div>
                            )}
                            {treeNodes.length === 0 && !explorerData.treeLoading[item.id] && !elasticIndicesError?.[item.id] && (
                              <p className="px-2 py-1 text-[11px] italic text-slate-400">
                                No metadata available
                              </p>
                            )}
                            {treeNodes.map((node) => (
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
                                savedQueries={connectionSavedQueries}
                                onUseSavedQuery={applySavedQueryToActiveTab}
                                onTableNodeContextMenu={handleTableNodeContextMenu}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
