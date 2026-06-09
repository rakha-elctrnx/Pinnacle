import {
  ChevronRight,
  Database,
  FileText,
  Loader2,
  Plus,
  Search,
  Table,
} from "lucide-react";
import type { ConnectionProfile } from "../../../types/domain";
import type { ConnectionStatus, TreeNode, SavedQuery } from "../types";
import { databaseTypeOptions } from "../constants";
import { isSqlConnectionType } from "../utils";

interface ConnectionSidebarProps {
  search: string;
  onSearchChange: (value: string) => void;
  groupedConnections: Record<string, ConnectionProfile[]>;
  selectedConnection: ConnectionProfile | null;
  connectionStatuses: Record<string, ConnectionStatus>;
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
}

const CATEGORY_LABELS = ["Tables", "Views", "Functions", "Queries"];

function isCategoryNode(label: string): boolean {
  return CATEGORY_LABELS.includes(label);
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

  const handleClick = () => {
    if (isDatabaseNode) {
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
        className={[
          "flex w-full items-center gap-1 rounded px-2 py-1 text-[11px] font-medium hover:bg-slate-100",
          selectedTreeNode === node.label
            ? "bg-blue-50 text-blue-600"
            : "text-slate-600",
        ].join(" ")}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isTableItem ? (
          <Table size={11} className="shrink-0 text-blue-500" />
        ) : hasChildren || isLeaf ? (
          <ChevronRight
            size={11}
            className={[
              "shrink-0 text-slate-400 transition-transform",
              isExpanded ? "rotate-90" : "",
            ].join(" ")}
          />
        ) : null}
        {isDatabaseNode && (
          <Database
            size={11}
            className={`shrink-0 ${isDbOpen ? "text-green-500" : "text-slate-400"}`}
          />
        )}
        {node.label}
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
                    "flex w-full items-center gap-1 rounded px-2 py-1 text-[11px] hover:bg-slate-100",
                    selectedTreeNode === sq.id
                      ? "bg-blue-50 text-blue-600"
                      : "text-slate-600",
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
}: ConnectionSidebarProps) {
  return (
    <aside className="border-b border-slate-200 p-3 lg:border-b-0 lg:border-r lg:overflow-y-auto">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Connections</p>
        <button
          type="button"
          onClick={onOpenCreateWizard}
          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
        >
          <Plus size={15} />
        </button>
      </div>

      <label className="relative mb-3 block">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-2.5 text-slate-400"
        />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search connections"
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-700"
        />
      </label>

      <div className="space-y-3">
        {Object.entries(groupedConnections).map(([group, profiles]) => (
          <section key={group}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {group}
            </p>
            <div className="space-y-1">
              {profiles.map((item) => {
                const active = selectedConnection?.id === item.id;
                const logo = databaseTypeOptions.find(
                  (option) => option.value === item.type,
                )?.logoSrc;
                const isLoading = treeLoading[item.id];
                const connectionSavedQueries = savedQueries[item.id] ?? [];

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
                        "w-full px-2 py-2 text-left transition hover:bg-slate-100 rounded-lg",
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
                          <Loader2
                            size={14}
                            className="shrink-0 animate-spin text-blue-500"
                          />
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
                    {expandedConnectionId === item.id &&
                      isSqlConnectionType(item.type) && (
                        <div className="ml-4 mt-1 space-y-0.5 border-l border-slate-200">
                          {getTreeNodesForConnection(item).length === 0 &&
                            !treeLoading[item.id] && (
                              <p className="px-2 py-1 text-[11px] text-slate-400 italic">
                                No metadata available
                              </p>
                            )}
                          {getTreeNodesForConnection(item).map((node) => (
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
                            />
                          ))}
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
