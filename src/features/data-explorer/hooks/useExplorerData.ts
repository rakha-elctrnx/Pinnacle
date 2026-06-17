import { useCallback, useEffect, useState } from 'react'
import { executeSql, sqlGetAllColumns, sqlGetAllForeignKeys } from '../../../services/tauriClient'
import type { ConnectionProfile, SchemaColumn, SchemaForeignKey } from '../../../types/domain'
import type {
  ExplorerTreeData,
  TreeNode,
  TreeSchema,
  TreeDatabase,
  TableStats,
  DetailStat,
  ConnectionStatus,
  SqlTableListItem,
} from "../types";
import {
  isSqlConnectionType,
  getConnPayload,
  sqlString,
  quoteIdentifier,
} from "../utils";

interface UseExplorerDataParams {
  expandedConnectionId: string | null;
  selectedConnection: ConnectionProfile | null;
  setConnectionStatuses: React.Dispatch<
    React.SetStateAction<Record<string, ConnectionStatus>>
  >;
}

export type TableIndex = {
  /**
   * The name of the database/schema the index belongs to.
   * For PostgreSQL, this would be the schema name.
   * For MySQL, this would be the database name.
   */
  schemaName: string;
  /**
   * The name of the table the index belongs to.
   */
  tableName: string;
  /**
   * The name of the columns the index is on.
   * Because an index can be on multiple columns, this is an array.
   */
  columnName: string[];

  /**
   * The name of the index.
   *  For PostgreSQL, this would be the `indexname` from `pg_indexes`. For MySQL, this would be the `Key_name` from `SHOW INDEX`.
   */
  indexName: string;
  /**
   * Index definition or details.
   * For PostgreSQL, this could be the output of `pg_get_indexdef()`.
   * For MySQL, it could be a string summarizing the index type and columns.
   */
  indexDefinition?: string | null;
  /**
   * Indicates if this index enforces uniqueness.
   * For PostgreSQL, this would be true if `indexdef` contains "UNIQUE".
   * For MySQL, this would be true if `Non_unique` is 0 in the `SHOW INDEX` output.
   */
  isUnique: boolean;
  /**
   * Indicates if this index is a primary key.
   * For PostgreSQL, this would be true if `indexdef` contains "PRIMARY KEY".
   * For MySQL, this would be true if `Key_name` is "PRIMARY".
   */
  isPrimary: boolean;
  /**
   * The type of the index, if available.
   * This could be "btree", "hash", etc.
   *  for PostgreSQL, or "BTREE", "HASH" for MySQL.
   */
  indexType?: string | null;
};

function mapQueryIndexesToTableIndexes(
  records: Record<string, any>[],
): TableIndex[] {
  return records.map((rec) => {
    const schemaName = rec.schema_name || "unknown_schema";
    const tableName = rec.table_name || "unknown_table";
    const indexName = rec.index_name || "unknown_index";
    const indexDef = rec.index_definition || null;
    const isUnique = rec.is_unique || null;
    const isPrimary = rec.is_primary || null;
    const indexType = rec.index_type || null;
    const columnName = rec.column_name || [];

    return {
      schemaName,
      tableName,
      columnName,
      indexName,
      indexDefinition: indexDef,
      isUnique,
      isPrimary,
      indexType,
    };
  });
}

function getQueryIndexPostgres(schema: string, table: string): string {
  return `SELECT 
  distinct on (c.relname) i.schemaname as schema_name, 
  i.tablename as table_name, 
  ARRAY_AGG(pattr.attname) OVER(PARTITION BY c.relname) as column_name, 
  i.indexname as index_name, 
  i.indexdef as index_definition, 
  idx.indisunique as is_unique, 
  idx.indisprimary as is_primary, 
  am.amname AS index_type 
FROM 
  pg_indexes i 
  JOIN pg_class c ON c.relname = i.indexname 
  JOIN pg_index idx ON idx.indexrelid = c.oid 
  JOIN pg_am am ON am.oid = c.relam 
  join pg_attribute pattr on pattr.attrelid = c.oid 
WHERE 
  i.schemaname = ${sqlString(schema)}
  and i.tablename = ${sqlString(table)}
ORDER BY 
  c.relname, 
  pattr.attnum;
`;
}

function getQueryIndexMySQL(table: string): string {
  return `SELECT distinct
    TABLE_SCHEMA AS schema_name,
    TABLE_NAME AS table_name,
    INDEX_NAME AS index_name,
    JSON_ARRAYAGG(COLUMN_NAME) as column_name,
    NON_UNIQUE = 0 AS is_unique,
    INDEX_NAME = 'PRIMARY' AS is_primary,
    INDEX_TYPE AS index_type
FROM 
    INFORMATION_SCHEMA.STATISTICS
WHERE 
    TABLE_SCHEMA = ${sqlString(table)}
 GROUP BY
 schema_name,
 index_name,
 table_name,
 NON_UNIQUE,
 INDEX_TYPE
ORDER BY index_name;`;
}

interface UseExplorerDataReturn {
  treeDataMap: Record<string, ExplorerTreeData>
  treeLoading: Record<string, boolean>
  loadingDatabaseNames: Set<string>
  realTableColumns: string[]
  realTableRows: Record<string, string>[]
  realTableStats: TableStats | null
  realTableStructure: Record<string, string>[]
  realTableIndexes: TableIndex[]
  realDbStats: DetailStat[]
  selectedSchema: string
  selectedDatabase: string
  selectedTable: string | null
  tableDataLoading: boolean
  sqlTableListLoading: boolean
  sqlTableList: SqlTableListItem[]
  schemaForeignKeys: SchemaForeignKey[]
  schemaColumns: SchemaColumn[]
  setSelectedSchema: (schema: string) => void
  setSelectedDatabase: (db: string) => void
  setSelectedTable: (table: string | null) => void
  getTreeNodesForConnection: (conn: ConnectionProfile) => TreeNode[]
  handleTreeNodeClick: (nodeLabel: string, databaseName?: string) => boolean
  fetchSqlTableList: (conn: ConnectionProfile, databaseName: string, schemaName?: string) => Promise<void>
  fetchDatabaseDetails: (connId: string, conn: ConnectionProfile, dbName: string) => Promise<void>
  refreshConnectionData: (connId: string, conn: ConnectionProfile) => Promise<void>
  /** Reset all cached/fetched data associated with a specific connection ID. */
  resetConnectionData: (connId: string) => void
}

export function useExplorerData({
  expandedConnectionId,
  selectedConnection,
  setConnectionStatuses,
}: UseExplorerDataParams): UseExplorerDataReturn {
  const [treeDataMap, setTreeDataMap] = useState<
    Record<string, ExplorerTreeData>
  >({});
  const [treeLoading, setTreeLoading] = useState<Record<string, boolean>>({});
  const [loadingDatabaseNames, setLoadingDatabaseNames] = useState<Set<string>>(
    new Set(),
  );

  const [realTableColumns, setRealTableColumns] = useState<string[]>([])
  const [realTableRows, setRealTableRows] = useState<Record<string, string>[]>([])
  const [realTableStats, setRealTableStats] = useState<TableStats | null>(null)
  const [realTableStructure, setRealTableStructure] = useState<Record<string, string>[]>([])
  const [realTableIndexes, setRealTableIndexes] = useState<TableIndex[]>([])
  const [realDbStats, setRealDbStats] = useState<DetailStat[]>([])
  const [selectedSchema, setSelectedSchema] = useState<string>('public')
  const [selectedDatabase, setSelectedDatabase] = useState<string>('')
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tableDataLoading, setTableDataLoading] = useState(false)
  const [sqlTableListLoading, setSqlTableListLoading] = useState(false)
  const [sqlTableList, setSqlTableList] = useState<SqlTableListItem[]>([])
  const [schemaForeignKeys, setSchemaForeignKeys] = useState<SchemaForeignKey[]>([])
  const [schemaColumns, setSchemaColumns] = useState<SchemaColumn[]>([])

  // Fetch all database names for a connection
  const fetchTreeData = useCallback(
    async (connId: string, conn: ConnectionProfile) => {
      if (!isSqlConnectionType(conn.type)) return;
      setTreeLoading((prev) => ({ ...prev, [connId]: true }));
      try {
        const payload = getConnPayload(conn);

        let databaseNames: string[] = [];

        if (conn.type === "postgresql") {
          const dbRes = await executeSql({
            connection: payload,
            sql: `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`,
          });
          databaseNames = dbRes.rows.map((r) => String(r.datname || ""));
        } else if (conn.type === "mysql") {
          const dbRes = await executeSql({
            connection: payload,
            sql: `SHOW DATABASES`,
          });
          const dbNameKey = dbRes.columns[0] || "Database";
          databaseNames = dbRes.rows.map((r) => String(r[dbNameKey] || ""));
        }

        const databases: TreeDatabase[] = databaseNames.map((name) => ({
          name,
          schemas: [],
          loaded: false,
        }));

        setTreeDataMap((prev) => ({
          ...prev,
          [connId]: { databases, flatTables: [] },
        }));

        // Fetch db stats for the initial connection database
        if (conn.type === "postgresql") {
          const statsRes = await executeSql({
            connection: payload,
            sql: `SELECT COUNT(*) as table_count FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`,
          });
          const tableCount = statsRes.rows[0]?.table_count ?? "0";
          setRealDbStats([
            { label: "Databases", value: String(databaseNames.length) },
            { label: "Table Count", value: String(tableCount) },
          ]);
        } else if (conn.type === "mysql") {
          const statsRes = await executeSql({
            connection: payload,
            sql: `SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = ${sqlString(conn.database)}`,
          });
          const tableCount = statsRes.rows[0]?.table_count ?? "0";
          setRealDbStats([
            { label: "Databases", value: String(databaseNames.length) },
            { label: "Table Count", value: String(tableCount) },
            { label: "Current Database", value: conn.database },
          ]);
        }

        setConnectionStatuses((prev) => ({ ...prev, [connId]: "connected" }));
      } catch (error) {
        console.error("Failed to fetch tree data:", error);
        setConnectionStatuses((prev) => ({ ...prev, [connId]: "error" }));
      } finally {
        setTreeLoading((prev) => ({ ...prev, [connId]: false }));
      }
    },
    [setConnectionStatuses],
  );

  // Fetch schemas/tables for a specific database
  const fetchDatabaseDetails = useCallback(
    async (connId: string, conn: ConnectionProfile, dbName: string) => {
      if (!isSqlConnectionType(conn.type)) return;
      setTreeLoading((prev) => ({ ...prev, [connId]: true }));
      setLoadingDatabaseNames((prev) => new Set([...prev, dbName]));
      try {
        // Create payload pointing to the specific database
        const payload = { ...getConnPayload(conn), database: dbName };

        if (conn.type === "postgresql") {
          const schemaRes = await executeSql({
            connection: payload,
            sql: `SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast') ORDER BY schema_name`,
          });
          const schemaNames = schemaRes.rows.map((r) =>
            String(r.schema_name || ""),
          );

          const schemas: TreeSchema[] = [];
          for (const schemaName of schemaNames) {
            const tableRes = await executeSql({
              connection: payload,
              sql: `SELECT tablename FROM pg_tables WHERE schemaname = ${sqlString(schemaName)} ORDER BY tablename`,
            });
            const viewRes = await executeSql({
              connection: payload,
              sql: `SELECT viewname FROM pg_views WHERE schemaname = ${sqlString(schemaName)} ORDER BY viewname`,
            });
            const funcRes = await executeSql({
              connection: payload,
              sql: `SELECT routine_name FROM information_schema.routines WHERE routine_schema = ${sqlString(schemaName)} ORDER BY routine_name`,
            });
            schemas.push({
              name: schemaName,
              tables: tableRes.rows.map((r) => String(r.tablename || "")),
              views: viewRes.rows.map((r) => String(r.viewname || "")),
              functions: funcRes.rows.map((r) => String(r.routine_name || "")),
            });
          }

          setTreeDataMap((prev) => {
            const existing = prev[connId];
            if (!existing) return prev;
            const databases = existing.databases.map((db) =>
              db.name === dbName ? { ...db, schemas, loaded: true } : db,
            );
            const flatTables = databases.flatMap((db) =>
              db.schemas.flatMap((s) => s.tables),
            );
            return { ...prev, [connId]: { databases, flatTables } };
          });
        } else if (conn.type === "mysql") {
          const tableRes = await executeSql({
            connection: payload,
            sql: `SHOW TABLES`,
          });
          const tableNameKey = tableRes.columns[0] || "Tables_in_" + dbName;
          const tables = tableRes.rows.map((r) =>
            String(r[tableNameKey] || ""),
          );

          const schemas: TreeSchema[] = [
            {
              name: dbName,
              tables,
              views: [],
              functions: [],
            },
          ];

          setTreeDataMap((prev) => {
            const existing = prev[connId];
            if (!existing) return prev;
            const databases = existing.databases.map((db) =>
              db.name === dbName ? { ...db, schemas, loaded: true } : db,
            );
            const flatTables = databases.flatMap((db) =>
              db.schemas.flatMap((s) => s.tables),
            );
            return { ...prev, [connId]: { databases, flatTables } };
          });
        }
      } catch (error) {
        console.error("Failed to fetch database details:", error);
      } finally {
        setTreeLoading((prev) => ({ ...prev, [connId]: false }));
        setLoadingDatabaseNames((prev) => {
          const next = new Set(prev);
          next.delete(dbName);
          return next;
        });
      }
    },
    [],
  );

  const fetchTableData = useCallback(
    async (
      conn: ConnectionProfile,
      schema: string,
      table: string,
      dbName?: string,
    ) => {
      if (!isSqlConnectionType(conn.type)) return;
      setTableDataLoading(true);
      try {
        // Use the specified database or fall back to the connection's default
        const payload = {
          ...getConnPayload(conn),
          database: dbName || conn.database,
        };
        const fromClause =
          conn.type === "postgresql"
            ? `${quoteIdentifier(schema, '"')}.${quoteIdentifier(table, '"')}`
            : quoteIdentifier(table, "`");

        const dataRes = await executeSql({
          connection: payload,
          sql: `SELECT * FROM ${fromClause} LIMIT 100`,
        });
        setRealTableColumns(dataRes.columns);
        setRealTableRows(dataRes.rows);

        const structRes = await executeSql({
          connection: payload,
          sql:
            conn.type === "postgresql"
              ? `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = ${sqlString(schema)} AND table_name = ${sqlString(table)} ORDER BY ordinal_position`
              : `SHOW COLUMNS FROM ${quoteIdentifier(table, "`")}`,
        });
        setRealTableStructure(structRes.rows);

        const indexRes = await executeSql({
          connection: payload,
          sql:
            conn.type === "postgresql"
              ? getQueryIndexPostgres(schema, table)
              : getQueryIndexMySQL(table),
        });
        setRealTableIndexes(mapQueryIndexesToTableIndexes(indexRes.rows));

        const countRes = await executeSql({
          connection: payload,
          sql: `SELECT COUNT(*) as count FROM ${fromClause}`,
        });
        setRealTableStats({
          rows: String(countRes.rows[0]?.count ?? "0"),
          columns: String(dataRes.columns.length),
          size: "-",
          indexes: String(
            conn.type === "postgresql"
              ? indexRes.rows.length
              : new Set(indexRes.rows.map((r) => String(r.Key_name || "")))
                  .size,
          ),
        });
      } catch (error) {
        console.error("Failed to fetch table data:", error);
      } finally {
        setTableDataLoading(false);
      }
    },
    [],
  );

  const fetchSqlTableList = useCallback(
    async (
      conn: ConnectionProfile,
      databaseName: string,
      schemaName?: string,
    ) => {
      if (!isSqlConnectionType(conn.type)) return;
      setSqlTableListLoading(true);

      try {
        const payload = {
          ...getConnPayload(conn),
          database: databaseName || conn.database,
        };

        const listRes = await executeSql({
          connection: payload,
          sql:
            conn.type === "postgresql"
              ? `SELECT
                   c.relname AS table_name,
                   c.oid::text AS oid,
                   pg_get_userbyid(c.relowner) AS owner,
                   CASE c.relkind
                     WHEN 'r' THEN 'BASE TABLE'
                     WHEN 'p' THEN 'PARTITIONED TABLE'
                     WHEN 'f' THEN 'FOREIGN TABLE'
                     ELSE c.relkind::text
                   END AS table_type,
                   COALESCE(st.n_live_tup::bigint, c.reltuples::bigint, 0)::text AS row_count
                 FROM pg_class c
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                 LEFT JOIN pg_stat_user_tables st ON st.relid = c.oid
                 WHERE n.nspname = ${sqlString(schemaName || "public")}
                   AND c.relkind IN ('r', 'p', 'f')
                 ORDER BY c.relname`
              : `SELECT
                   table_name,
                   '-' AS oid,
                   '-' AS owner,
                   table_type,
                   COALESCE(table_rows, 0) AS row_count
                 FROM information_schema.tables
                 WHERE table_schema = ${sqlString(databaseName)}
                 ORDER BY table_name`,
        });

        setSqlTableList(
          listRes.rows.map((row) => ({
            tableName: String(row.table_name || ""),
            oid: String(row.oid || "-"),
            owner: String(row.owner || "-"),
            tableType: String(row.table_type || "-"),
            rowCount: String(row.row_count || "0"),
          })),
        )

        // Fetch all foreign keys and columns for the schema (used by ER diagram)
        try {
          const fkPayload = {
            ...getConnPayload(conn),
            database: databaseName || conn.database,
            schema: schemaName || (conn.type === 'postgresql' ? 'public' : databaseName || conn.database),
          }
          const [fks, cols] = await Promise.all([
            sqlGetAllForeignKeys(fkPayload),
            sqlGetAllColumns(fkPayload),
          ])
          setSchemaForeignKeys(fks)
          setSchemaColumns(cols)
        } catch (fkError) {
          console.warn('Failed to fetch FK/columns for ER diagram:', fkError)
          setSchemaForeignKeys([])
          setSchemaColumns([])
        }
      } catch (error) {
        console.error('Failed to fetch SQL table list:', error)
        setSqlTableList([])
        setSchemaForeignKeys([])
      } finally {
        setSqlTableListLoading(false);
      }
    },
    [],
  );

  // Fetch database list when connection expands
  useEffect(() => {
    if (
      expandedConnectionId &&
      selectedConnection &&
      isSqlConnectionType(selectedConnection.type)
    ) {
      const existing = treeDataMap[expandedConnectionId];
      if (!existing) {
        // eslint-disable-next-line
        fetchTreeData(expandedConnectionId, selectedConnection);
      }
    }
  }, [expandedConnectionId, selectedConnection, fetchTreeData, treeDataMap]);

  const getTreeNodesForConnection = useCallback(
    (conn: ConnectionProfile): TreeNode[] => {
      if (!isSqlConnectionType(conn.type)) return [];

      const treeData = treeDataMap[conn.id];
      if (!treeData) return [];

      return treeData.databases.map((db) => {
        if (!db.loaded) {
          return { label: db.name };
        }

        if (conn.type === "postgresql") {
          return {
            label: db.name,
            children: db.schemas.map((schema) => ({
              label: schema.name,
              children: [
                ...(schema.tables.length > 0
                  ? [
                      {
                        label: "Tables",
                        children: schema.tables.map((t) => ({ label: t })),
                      },
                    ]
                  : []),
                ...(schema.views.length > 0
                  ? [
                      {
                        label: "Views",
                        children: schema.views.map((v) => ({ label: v })),
                      },
                    ]
                  : []),
                ...(schema.functions.length > 0
                  ? [
                      {
                        label: "Functions",
                        children: schema.functions.map((f) => ({ label: f })),
                      },
                    ]
                  : []),
                { label: "Queries", children: [] },
              ],
            })),
          };
        }

        if (conn.type === "mysql") {
          const allTables = db.schemas[0]?.tables ?? [];
          return {
            label: db.name,
            children: [
              ...(allTables.length > 0
                ? [
                    {
                      label: "Tables",
                      children: allTables.map((t) => ({ label: t })),
                    },
                  ]
                : []),
              { label: "Views", children: [] },
              { label: "Functions", children: [] },
              { label: "Queries", children: [] },
            ],
          };
        }

        return { label: db.name };
      });
    },
    [treeDataMap],
  );

  const resetConnectionData = useCallback((connId: string) => {
    // Clear tree data for this connection
    setTreeDataMap((prev) => {
      const next = { ...prev }
      delete next[connId]
      return next
    })

    // Clear table-level detail data — these are only meaningful for the currently
    // selected connection, so reset them unconditionally.
    setRealTableColumns([])
    setRealTableRows([])
    setRealTableStats(null)
    setRealTableStructure([])
    setRealTableIndexes([])
    setRealDbStats([])
    setSelectedTable(null)
    setSelectedSchema('public')
    setSelectedDatabase('')
    setSqlTableList([])
    setSchemaForeignKeys([])
    setSchemaColumns([])
  }, [])

  const handleTreeNodeClick = useCallback(
    (nodeLabel: string, databaseName?: string) => {
      if (selectedConnection && isSqlConnectionType(selectedConnection.type)) {
        const treeData = treeDataMap[selectedConnection.id];
        if (!treeData) return false;

        let isTable = false;
        let schemaName = selectedSchema;
        let targetDbName = databaseName;

        if (selectedConnection.type === "postgresql") {
          for (const db of treeData.databases) {
            for (const schema of db.schemas) {
              if (schema.tables.includes(nodeLabel)) {
                isTable = true;
                schemaName = schema.name;
                targetDbName = targetDbName || db.name;
                break;
              }
            }
            if (isTable) break;
          }
        } else if (selectedConnection.type === "mysql") {
          for (const db of treeData.databases) {
            const allTables = db.schemas[0]?.tables ?? [];
            if (allTables.includes(nodeLabel)) {
              isTable = true;
              schemaName = db.name;
              targetDbName = db.name;
              break;
            }
          }
        }

        if (isTable) {
          setSelectedTable(nodeLabel);
          setSelectedSchema(schemaName);
          setSelectedDatabase(targetDbName || "");
          fetchTableData(
            selectedConnection,
            schemaName,
            nodeLabel,
            targetDbName,
          );
          return true;
        }
      }

      return false;
    },
    [selectedConnection, selectedSchema, treeDataMap, fetchTableData],
  );

  return {
    treeDataMap,
    treeLoading,
    loadingDatabaseNames,
    realTableColumns,
    realTableRows,
    realTableStats,
    realTableStructure,
    realTableIndexes,
    realDbStats,
    selectedSchema,
    selectedDatabase,
    selectedTable,
    tableDataLoading,
    sqlTableListLoading,
    sqlTableList,
    schemaForeignKeys,
    schemaColumns,
    setSelectedSchema,
    setSelectedDatabase,
    setSelectedTable,
    getTreeNodesForConnection,
    handleTreeNodeClick,
    fetchSqlTableList,
    fetchDatabaseDetails,
    refreshConnectionData: fetchTreeData,
    resetConnectionData,
  }
}
