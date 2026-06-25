import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import type { SqlTableListItem } from "../../../_shared/types/shared";
import type { SchemaColumn, SchemaForeignKey } from '../../types/sql';

/* ─── Custom table node ────────────────────────────────────────────────── */

interface ColumnDef {
  name: string;
  dataType: string;
}

interface TableNodeData {
  tableName: string;
  columns: ColumnDef[];
  highlighted: boolean;
  onSelectTable?: (tableName: string) => void;
  [key: string]: unknown;
}

function TableNode({ data }: { data: TableNodeData }) {
  const { tableName, columns, highlighted, onSelectTable } = data;

  return (
    <div
      className={[
        "rounded-lg border bg-bg-base shadow-sm transition-all duration-150",
        "min-w-[200px] max-w-[260px]",
        highlighted
          ? "border-primary shadow-md ring-2 ring-primary-subtle"
          : "border-border-default hover:border-border-strong hover:shadow-md",
      ].join(" ")}
    >
      <Handle type="target" position={Position.Top} className="!bg-bg-muted" />
      {/* Header */}
      <div
        className={[
          "flex items-center gap-1.5 border-b px-3 py-2 text-xs font-semibold",
          highlighted
            ? "border-primary-subtle bg-primary-subtle text-primary"
            : "border-border-default bg-bg-subtle text-text-primary",
        ].join(" ")}
      >
        <span className="truncate font-mono">{tableName}</span>
      </div>
      {/* Columns */}
      <div className="max-h-[240px] overflow-y-auto">
        {columns.length === 0 ? (
          <div className="px-3 py-2 text-[11px] italic text-text-muted">
            No columns
          </div>
        ) : (
          columns.map((col, i) => (
            <div
              key={col.name}
              className={[
                "flex items-center justify-between gap-2 px-3 py-[5px] text-[11px]",
                i > 0 ? "border-t border-border-default" : "",
              ].join(" ")}
            >
              <span className="truncate font-mono font-medium text-text-primary">
                {col.name}
              </span>
              <span className="shrink-0 text-text-muted">{col.dataType}</span>
            </div>
          ))
        )}
      </div>
      {/* Open link */}
      {onSelectTable && (
        <div className="border-t border-border-default px-3 py-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectTable(tableName);
            }}
            className="w-full text-center text-[10px] font-medium text-primary hover:text-primary-hover hover:underline"
          >
            Open table →
          </button>
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-bg-muted"
      />
    </div>
  );
}

/* ─── Runtime CSS variable reader ────────────────────────────────────────── */

function readToken(name: string, fallback: string): string {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim() || fallback
  );
}

const nodeTypes: NodeTypes = {
  tableNode: TableNode,
};

/* ─── Dagre layout helper ──────────────────────────────────────────────── */

function getLayoutedElements(
  nodes: Node<TableNodeData>[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB",
) {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const nodeWidth = 230;
  // Dynamic height: header(36) + columns(N*21) + link(30) + padding(10)
  const getNodeHeight = (colCount: number) => Math.max(76, 36 + colCount * 21 + 30 + 10);

  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 50,
    ranksep: 60,
    marginx: 20,
    marginy: 20,
  });

  for (const node of nodes) {
    const colCount = (node.data.columns as ColumnDef[] | undefined)?.length ?? 0;
    dagreGraph.setNode(node.id, { width: nodeWidth, height: getNodeHeight(colCount) });
  }

  for (const edge of edges) {
    dagreGraph.setEdge(edge.source, edge.target);
  }

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const colCount = (node.data.columns as ColumnDef[] | undefined)?.length ?? 0;
    const h = getNodeHeight(colCount);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - h / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

/* ─── Auto-fit helper component ────────────────────────────────────────── */

function AutoFitView({
  nodeCount,
  depsKey,
}: {
  nodeCount: number;
  depsKey: string;
}) {
  const { fitView } = useReactFlow();
  const ran = useRef(false);

  useEffect(() => {
    if (nodeCount > 0 && !ran.current) {
      const t = setTimeout(() => {
        fitView({ padding: 0.15, duration: 300 });
        ran.current = true;
      }, 100);
      return () => clearTimeout(t);
    }
  }, [nodeCount, depsKey, fitView]);

  return null;
}

/* ─── Component props ──────────────────────────────────────────────────── */

interface ERDiagramViewerProps {
  rows: SqlTableListItem[];
  searchQuery: string;
  foreignKeys?: SchemaForeignKey[];
  columns?: SchemaColumn[];
  onSelectTable?: (tableName: string) => void;
}

/* ─── ERDiagramViewer ──────────────────────────────────────────────────── */

export function ERDiagramViewer({
  rows,
  searchQuery,
  foreignKeys = [],
  columns = [],
  onSelectTable,
}: ERDiagramViewerProps) {
  const normalizedSearch = searchQuery.trim().toLowerCase();

  // Set of table names for filtering FK edges
  const tableNames = useMemo(
    () => new Set(rows.map((r) => r.tableName)),
    [rows],
  );

  // Group columns by table name for quick lookup
  const columnsByTable = useMemo(() => {
    const map = new Map<string, ColumnDef[]>();
    for (const col of columns) {
      const arr = map.get(col.tableName);
      if (arr) {
        arr.push({ name: col.columnName, dataType: col.dataType });
      } else {
        map.set(col.tableName, [{ name: col.columnName, dataType: col.dataType }]);
      }
    }
    return map;
  }, [columns]);

  const { initialNodes, initialEdges } = useMemo(() => {
    const primaryColor = readToken('--color-primary', '#3b60cd');
    const primarySubtle = readToken('--color-primary-subtle', '#e8edf9');

    const nodes: Node<TableNodeData>[] = rows.map((row) => ({
      id: row.tableName,
      type: "tableNode",
      position: { x: 0, y: 0 },
      data: {
        tableName: row.tableName,
        columns: columnsByTable.get(row.tableName) ?? [],
        highlighted: false,
        onSelectTable,
      },
    }));

    // Build edges from foreign key data
    const edges: Edge[] = [];
    const seen = new Set<string>();
    for (const fk of foreignKeys) {
      // Only include edges where both source and target tables are visible
      if (!tableNames.has(fk.sourceTable) || !tableNames.has(fk.referencedTable)) continue;
      // Skip self-references
      if (fk.sourceTable === fk.referencedTable) continue;

      const edgeId = `${fk.sourceTable}:${fk.constraintName}->${fk.referencedTable}`;
      if (seen.has(edgeId)) continue;
      seen.add(edgeId);

      edges.push({
        id: edgeId,
        source: fk.sourceTable,
        target: fk.referencedTable,
        label: fk.columns.join(', '),
        type: 'smoothstep',
        animated: true,
        style: { stroke: primaryColor, strokeWidth: 1.5 },
        labelStyle: { fontSize: 10, fill: primaryColor, fontWeight: 500 },
        labelBgStyle: { fill: primarySubtle, fillOpacity: 0.9 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
        markerEnd: { type: 'arrowclosed' as const, color: primaryColor },
      });
    }

    const layouted = getLayoutedElements(nodes, edges, "TB");
    return { initialNodes: layouted.nodes, initialEdges: layouted.edges };
  }, [rows, foreignKeys, tableNames, columnsByTable, onSelectTable]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView } = useReactFlow();

  // Re-layout when rows change
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Apply search highlighting + focus
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        const tableName = node.data.tableName as string;
        const cols = node.data.columns as ColumnDef[];
        const matchTable = normalizedSearch
          ? tableName.toLowerCase().includes(normalizedSearch)
          : false;
        const matchCol = normalizedSearch
          ? cols.some((c) => c.name.toLowerCase().includes(normalizedSearch))
          : false;
        return {
          ...node,
          data: { ...node.data, highlighted: matchTable || matchCol },
        };
      }),
    );

    // Focus on highlighted nodes
    if (normalizedSearch) {
      const matchIds = rows
        .filter((r) => {
          const nameMatch = r.tableName.toLowerCase().includes(normalizedSearch);
          const colMatch = columnsByTable
            .get(r.tableName)
            ?.some((c) => c.name.toLowerCase().includes(normalizedSearch));
          return nameMatch || colMatch;
        })
        .map((r) => r.tableName);

      if (matchIds.length > 0) {
        const t = setTimeout(() => {
          fitView({
            nodes: matchIds.map((id) => ({ id })),
            padding: 0.3,
            duration: 400,
          });
        }, 50);
        return () => clearTimeout(t);
      }
    }
  }, [normalizedSearch, rows, columnsByTable, setNodes, fitView]);

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onSelectTable?.(node.id);
    },
    [onSelectTable],
  );

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted text-xs">
        No tables to display
      </div>
    );
  }

  const borderColor = readToken('--color-border-default', '#e3e4de');

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDoubleClick={onNodeDoubleClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color={borderColor} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={borderColor}
          maskColor="rgba(255,255,255,0.7)"
          style={{ width: 120, height: 80 }}
        />
        <AutoFitView nodeCount={rows.length} depsKey={rows.map(r => r.tableName).join(',')} />
      </ReactFlow>
    </div>
  );
}
