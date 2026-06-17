import { useState } from "react";
import {
  Activity,
  Braces,
  ChevronRight,
  Database,
  FileText,
  Folder,
  FolderOpen,
  Hash,
  Layers,
  List,
  MessageSquare,
  Plus,
  Search,
  Table,
  Terminal,
  Zap,
} from "lucide-react";
import { CenteredLoadingState } from "./shared/CenteredLoadingState";
import type { ConnectionProfile, ConnectionType, ElasticIndex } from "../../../types/domain";
import type { TreeNode, SavedQuery } from "../types";
import { databaseTypeOptions } from "../constants";
import { isSqlConnectionType } from "../utils";

interface ConnectionSidebarProps {
  search: string;
  onSearchChange: (value: string) => void;
  groupedConnections: Record<string, ConnectionProfile[]>;
  selectedConnection: ConnectionProfile | null;
  expandedConnectionId: string | null;
  treeLoading: Record<string, boolean>;
  selectedTreeNode: string | null;
  expandedTreePaths: string[];
  savedQueries: Record<string, SavedQuery[]>;
  onOpenCreateWizard: () => void;
  onSelectConnection: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onContextMenu: (event: React.MouseEvent, itemId: string) => void;
  getTreeNodesForConnection: (conn: ConnectionProfile) => TreeNode[];
  onTreeNodeClick: (
    nodeLabel: string,
    databaseName?: string,
    nodePath?: string,
  ) => void;
  onSelectedTreeNode: (label: string | null) => void;
  onToggleTreeNode: (path: string) => void;
  onFetchDatabaseDetails?: (dbName: string) => void;
  onUseSavedQuery?: (sql: string) => void;
  onTableNodeContextMenu?: (event: React.MouseEvent, connectionId: string, tableName: string) => void;
  /** Elasticsearch indices per connection id */
  elasticIndices?: Record<string, ElasticIndex[]>;
  /** Elasticsearch indices fetch errors per connection id */
  elasticIndicesError?: Record<string, string>;
  /** Elasticsearch indices currently loading per connection id */
  elasticLoading?: Record<string, boolean>;
  /** Callback to retry fetching Elasticsearch indices */
  onRetryElasticIndices?: (connectionId: string) => void;
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
    } else if (!hasChildren || (node.children && node.children.length === 0)) {
      if (isCategoryNode(node.label)) {
        onToggleTreeNode(nodePath);
        return;
      }
      onSelectedTreeNode(node.label);
      const databaseName = parentPath.split("/")[0];
      onTreeNodeClick(node.label, databaseName, nodePath);
    } else {
      onToggleTreeNode(nodePath);
      if (node.label === "Tables") {
        onSelectedTreeNode(node.label);
        const databaseName = parentPath.split("/")[0];
        onTreeNodeClick(node.label, databaseName, nodePath);
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
          "flex w-full items-center gap-1 px-2 py-1 text-[11px] font-medium hover:bg-surface-variant overflow-hidden cursor-pointer",
          selectedTreeNode === node.label
            ? "bg-surface-variant/80 text-primary"
            : "text-on-surface",
        ].join(" ")}
        style={{ paddingLeft: `${depth * 12 + 18}px` }}
      >
        {/* Chevron indicator for expandable nodes with children (left-most) */}
        {hasChildren && !isLeaf ? (
          <ChevronRight
            size={11}
            className={[
              "shrink-0 text-slate-400 transition-transform",
              isExpanded ? "rotate-90" : "",
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
                    "flex w-full items-center gap-1 rounded px-2 py-1 text-[11px] hover:bg-surface-variant overflow-hidden",
                    selectedTreeNode === sq.id
                      ? "bg-surface-variant/80 text-primary"
                      : "text-on-surface",
                  ].join(" ")}
                  style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
                  title={sq.sql}
                >
                  <FileText size={11} className="shrink-0 text-amber-500" />
                  <span className="min-w-0 flex-1 truncate">{sq.title}</span>
                  <span className="shrink-0 text-[10px] text-slate-400">
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
              savedQueries={savedQueries}
              onUseSavedQuery={onUseSavedQuery}
              onTableNodeContextMenu={onTableNodeContextMenu}
            />
          ))
        ))}
    </div>
  );
}

export function ConnectionSidebar({
  search,
  onSearchChange,
  groupedConnections,
  selectedConnection,
  expandedConnectionId,
  treeLoading,
  selectedTreeNode,
  expandedTreePaths,
  savedQueries,
  onOpenCreateWizard,
  onSelectConnection,
  onToggleExpand,
  onContextMenu,
  getTreeNodesForConnection,
  onTreeNodeClick,
  onSelectedTreeNode,
  onToggleTreeNode,
  onFetchDatabaseDetails,
  onUseSavedQuery,
  onTableNodeContextMenu,
  elasticIndices,
  elasticIndicesError,
  elasticLoading,
  onRetryElasticIndices,
}: ConnectionSidebarProps) {
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

  return (
    <aside className="h-full overflow-x-hidden overflow-y-auto min-w-0">
      <div className="mb-2 flex items-center justify-between px-3 pt-3">
        <p className="text-sm font-semibold text-on-surface">Connections</p>
        <button
          type="button"
          onClick={onOpenCreateWizard}
          className="rounded-lg p-1.5 text-on-surface hover:bg-surface-variant"
        >
          <Plus size={15} />
        </button>
      </div>

      <label className="relative mb-3 block mx-3">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-2.5 text-on-surface-variant"
        />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search connections"
          className="w-full rounded-xl border border-outline bg-surface-variant py-2 focus:outline-none focus:ring-1 focus:ring-on-surface pl-8 pr-3 text-xs text-on-surface-variant placeholder:text-on-surface-variant/70"
        />
      </label>

      <div className="space-y-3">
        {Object.entries(groupedConnections).map(([group, profiles]) => {
          const collapsed = isGroupCollapsed(group);
          return (
            <section key={group}>
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                aria-expanded={!collapsed}
                aria-controls={`group-${group}-content`}
                className="mb-1.5 flex w-full items-center gap-1.5 px-3 text-left transition-colors text-[11px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-500"
              >
                <ChevronRight
                  size={11}
                  className={[
                    "shrink-0 text-slate-400 transition-transform duration-200",
                    collapsed ? "" : "rotate-90",
                  ].join(" ")}
                />
                {collapsed ? (
                  <Folder
                    size={11}
                    className="shrink-0 text-slate-500"
                  />
                ) : (
                  <FolderOpen
                    size={11}
                    className="shrink-0 text-slate-400"
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{group}</span>
              </button>
              <div
                id={`group-${group}-content`}
                className={[
                  "overflow-hidden transition-all duration-200 ease-in-out",
                  collapsed
                    ? "max-h-0 opacity-0"
                    : "max-h-500 opacity-100",
                ].join(" ")}
                aria-hidden={collapsed}
              >
                <div className="space-y-1 ml-2">
                  {profiles.map((item) => {
                    const active = selectedConnection?.id === item.id;
                    const logo = databaseTypeOptions.find(
                      (option) => option.value === item.type,
                    )?.logoSrc;
                    const isLoading = treeLoading[item.id] || !!elasticLoading?.[item.id];
                    const connectionSavedQueries = savedQueries[item.id] ?? [];

                    // Get tree nodes based on connection type
                    const sqlTreeNodes = isSqlConnectionType(item.type)
                      ? getTreeNodesForConnection(item)
                      : [];
                    const connectionIndices = elasticIndices?.[item.id];
                    const staticTreeNodes = isSqlConnectionType(item.type)
                      ? []
                      : getStaticTreeNodes(item.type, connectionIndices);
                    const treeNodes =
                      sqlTreeNodes.length > 0 ? sqlTreeNodes : staticTreeNodes;

                    return (
                      <div key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectConnection(item.id);
                            onToggleExpand(item.id);
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            onContextMenu(event, item.id);
                          }}
                          className={[
                            "w-full px-3 py-2 text-left transition hover:bg-slate-100 overflow-hidden",
                            active ? "bg-blue-100" : "",
                          ].join(" ")}
                        >
                          <span className="flex items-center gap-2">
                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-white">
                              {logo ? (
                                <img
                                  src={logo}
                                  alt={item.type}
                                  className="h-3 w-3 object-contain"
                                />
                              ) : (
                                <Database size={14} />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span
                                className={[
                                  "block truncate text-xs font-medium",
                                  active ? "text-blue-800" : "text-slate-800",
                                ].join(" ")}
                              >
                                {item.name}
                              </span>
                            </span>
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
                                size={14}
                                className={[
                                  "shrink-0 text-slate-400 transition-transform",
                                  expandedConnectionId === item.id
                                    ? "rotate-90"
                                    : "",
                                ].join(" ")}
                              />
                            )}
                          </span>
                        </button>
                        {expandedConnectionId === item.id && (
                          <div className="border-l-2 border-blue-200">
                            {elasticIndicesError?.[item.id] && (
                              <div className="mx-2 my-1 rounded border border-red-200 bg-red-50 px-2 py-1.5">
                                <p className="text-[11px] text-red-600 font-medium">Failed to load indices</p>
                                <p className="text-[10px] text-red-400 truncate mt-0.5">{elasticIndicesError[item.id]}</p>
                                {onRetryElasticIndices && (
                                  <button
                                    type="button"
                                    onClick={() => onRetryElasticIndices(item.id)}
                                    className="mt-1 text-[10px] font-medium text-blue-600 hover:text-blue-700 hover:underline"
                                  >
                                    Retry
                                  </button>
                                )}
                              </div>
                            )}
                            {treeNodes.length === 0 && !treeLoading[item.id] && !elasticIndicesError?.[item.id] && (
                              <p className="px-2 py-1 text-[11px] text-slate-400 italic">
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
                                onTreeNodeClick={onTreeNodeClick}
                                onSelectedTreeNode={onSelectedTreeNode}
                                onToggleTreeNode={onToggleTreeNode}
                                onFetchDatabaseDetails={onFetchDatabaseDetails}
                                savedQueries={connectionSavedQueries}
                                onUseSavedQuery={onUseSavedQuery}
                                onTableNodeContextMenu={onTableNodeContextMenu}
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