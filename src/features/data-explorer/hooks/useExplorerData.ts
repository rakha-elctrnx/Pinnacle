import { useCallback, useEffect, useState } from 'react'
import { executeSql } from '../../../services/tauriClient'
import type { ConnectionProfile } from '../../../types/domain'
import type { ExplorerTreeData, TreeNode, TreeSchema, TreeDatabase, TableStats, DetailStat, ConnectionStatus } from '../types'
import { isSqlConnectionType, getConnPayload, escapeSqlIdentifier } from '../utils'

interface UseExplorerDataParams {
  expandedConnectionId: string | null
  selectedConnection: ConnectionProfile | null
  setConnectionStatuses: React.Dispatch<React.SetStateAction<Record<string, ConnectionStatus>>>
}

interface UseExplorerDataReturn {
  treeDataMap: Record<string, ExplorerTreeData>
  treeLoading: Record<string, boolean>
  loadingDatabaseNames: Set<string>
  realTableColumns: string[]
  realTableRows: Record<string, string>[]
  realTableStats: TableStats | null
  realTableStructure: Record<string, string>[]
  realTableIndexes: string[]
  realDbStats: DetailStat[]
  selectedSchema: string
  selectedDatabase: string
  selectedTable: string | null
  tableDataLoading: boolean
  setSelectedSchema: (schema: string) => void
  setSelectedDatabase: (db: string) => void
  setSelectedTable: (table: string | null) => void
  getTreeNodesForConnection: (conn: ConnectionProfile) => TreeNode[]
  handleTreeNodeClick: (nodeLabel: string, databaseName?: string) => boolean
  fetchDatabaseDetails: (connId: string, conn: ConnectionProfile, dbName: string) => Promise<void>
  refreshConnectionData: (connId: string, conn: ConnectionProfile) => Promise<void>
}

export function useExplorerData({
  expandedConnectionId,
  selectedConnection,
  setConnectionStatuses,
}: UseExplorerDataParams): UseExplorerDataReturn {
  const [treeDataMap, setTreeDataMap] = useState<Record<string, ExplorerTreeData>>({})
  const [treeLoading, setTreeLoading] = useState<Record<string, boolean>>({})
  const [loadingDatabaseNames, setLoadingDatabaseNames] = useState<Set<string>>(new Set())

  const [realTableColumns, setRealTableColumns] = useState<string[]>([])
  const [realTableRows, setRealTableRows] = useState<Record<string, string>[]>([])
  const [realTableStats, setRealTableStats] = useState<TableStats | null>(null)
  const [realTableStructure, setRealTableStructure] = useState<Record<string, string>[]>([])
  const [realTableIndexes, setRealTableIndexes] = useState<string[]>([])
  const [realDbStats, setRealDbStats] = useState<DetailStat[]>([])
  const [selectedSchema, setSelectedSchema] = useState<string>('public')
  const [selectedDatabase, setSelectedDatabase] = useState<string>('')
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tableDataLoading, setTableDataLoading] = useState(false)

  // Fetch all database names for a connection
  const fetchTreeData = useCallback(
    async (connId: string, conn: ConnectionProfile) => {
      if (!isSqlConnectionType(conn.type)) return
      setTreeLoading((prev) => ({ ...prev, [connId]: true }))
      try {
        const payload = getConnPayload(conn)

        let databaseNames: string[] = []

        if (conn.type === 'postgresql') {
          const dbRes = await executeSql({
            connection: payload,
            sql: `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`,
          })
          databaseNames = dbRes.rows.map((r) => String(r.datname || ''))
        } else if (conn.type === 'mysql') {
          const dbRes = await executeSql({
            connection: payload,
            sql: `SHOW DATABASES`,
          })
          const dbNameKey = dbRes.columns[0] || 'Database'
          databaseNames = dbRes.rows.map((r) => String(r[dbNameKey] || ''))
        }

        const databases: TreeDatabase[] = databaseNames.map((name) => ({
          name,
          schemas: [],
          loaded: false,
        }))

        setTreeDataMap((prev) => ({ ...prev, [connId]: { databases, flatTables: [] } }))

        // Fetch db stats for the initial connection database
        if (conn.type === 'postgresql') {
          const statsRes = await executeSql({
            connection: payload,
            sql: `SELECT COUNT(*) as table_count FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`,
          })
          const tableCount = statsRes.rows[0]?.table_count ?? '0'
          setRealDbStats([
            { label: 'Databases', value: String(databaseNames.length) },
            { label: 'Table Count', value: String(tableCount) },
          ])
        } else if (conn.type === 'mysql') {
          const statsRes = await executeSql({
            connection: payload,
            sql: `SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = '${escapeSqlIdentifier(conn.database)}'`,
          })
          const tableCount = statsRes.rows[0]?.table_count ?? '0'
          setRealDbStats([
            { label: 'Databases', value: String(databaseNames.length) },
            { label: 'Table Count', value: String(tableCount) },
            { label: 'Current Database', value: conn.database },
          ])
        }

        setConnectionStatuses((prev) => ({ ...prev, [connId]: 'connected' }))
      } catch (error) {
        console.error('Failed to fetch tree data:', error)
        setConnectionStatuses((prev) => ({ ...prev, [connId]: 'error' }))
      } finally {
        setTreeLoading((prev) => ({ ...prev, [connId]: false }))
      }
    },
    [setConnectionStatuses],
  )

  // Fetch schemas/tables for a specific database
  const fetchDatabaseDetails = useCallback(
    async (connId: string, conn: ConnectionProfile, dbName: string) => {
      if (!isSqlConnectionType(conn.type)) return
      setTreeLoading((prev) => ({ ...prev, [connId]: true }))
      setLoadingDatabaseNames((prev) => new Set([...prev, dbName]))
      try {
        // Create payload pointing to the specific database
        const payload = { ...getConnPayload(conn), database: dbName }

        if (conn.type === 'postgresql') {
          const schemaRes = await executeSql({
            connection: payload,
            sql: `SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast') ORDER BY schema_name`,
          })
          const schemaNames = schemaRes.rows.map((r) => String(r.schema_name || ''))

          const schemas: TreeSchema[] = []
          for (const schemaName of schemaNames) {
            const tableRes = await executeSql({
              connection: payload,
              sql: `SELECT tablename FROM pg_tables WHERE schemaname = '${escapeSqlIdentifier(schemaName)}' ORDER BY tablename`,
            })
            const viewRes = await executeSql({
              connection: payload,
              sql: `SELECT viewname FROM pg_views WHERE schemaname = '${escapeSqlIdentifier(schemaName)}' ORDER BY viewname`,
            })
            const funcRes = await executeSql({
              connection: payload,
              sql: `SELECT routine_name FROM information_schema.routines WHERE routine_schema = '${escapeSqlIdentifier(schemaName)}' ORDER BY routine_name`,
            })
            schemas.push({
              name: schemaName,
              tables: tableRes.rows.map((r) => String(r.tablename || '')),
              views: viewRes.rows.map((r) => String(r.viewname || '')),
              functions: funcRes.rows.map((r) => String(r.routine_name || '')),
            })
          }

          setTreeDataMap((prev) => {
            const existing = prev[connId]
            if (!existing) return prev
            const databases = existing.databases.map((db) =>
              db.name === dbName ? { ...db, schemas, loaded: true } : db,
            )
            const flatTables = databases.flatMap((db) => db.schemas.flatMap((s) => s.tables))
            return { ...prev, [connId]: { databases, flatTables } }
          })
        } else if (conn.type === 'mysql') {
          const tableRes = await executeSql({
            connection: payload,
            sql: `SHOW TABLES`,
          })
          const tableNameKey = tableRes.columns[0] || 'Tables_in_' + dbName
          const tables = tableRes.rows.map((r) => String(r[tableNameKey] || ''))

          const schemas: TreeSchema[] = [
            {
              name: dbName,
              tables,
              views: [],
              functions: [],
            },
          ]

          setTreeDataMap((prev) => {
            const existing = prev[connId]
            if (!existing) return prev
            const databases = existing.databases.map((db) =>
              db.name === dbName ? { ...db, schemas, loaded: true } : db,
            )
            const flatTables = databases.flatMap((db) => db.schemas.flatMap((s) => s.tables))
            return { ...prev, [connId]: { databases, flatTables } }
          })
        }
      } catch (error) {
        console.error('Failed to fetch database details:', error)
      } finally {
        setTreeLoading((prev) => ({ ...prev, [connId]: false }))
        setLoadingDatabaseNames((prev) => {
          const next = new Set(prev)
          next.delete(dbName)
          return next
        })
      }
    },
    [],
  )

  const fetchTableData = useCallback(
    async (conn: ConnectionProfile, schema: string, table: string, dbName?: string) => {
      if (!isSqlConnectionType(conn.type)) return
      setTableDataLoading(true)
      try {
        // Use the specified database or fall back to the connection's default
        const payload = { ...getConnPayload(conn), database: dbName || conn.database }
        const schemaId = escapeSqlIdentifier(schema)
        const tableId = escapeSqlIdentifier(table)
        const fromClause =
          conn.type === 'postgresql' ? `"${schemaId}"."${tableId}"` : `\`${tableId}\``

        const dataRes = await executeSql({
          connection: payload,
          sql: `SELECT * FROM ${fromClause} LIMIT 100`,
        })
        setRealTableColumns(dataRes.columns)
        setRealTableRows(dataRes.rows)

        const structRes = await executeSql({
          connection: payload,
          sql:
            conn.type === 'postgresql'
              ? `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = '${escapeSqlIdentifier(schema)}' AND table_name = '${escapeSqlIdentifier(table)}' ORDER BY ordinal_position`
              : `SHOW COLUMNS FROM \`${tableId}\``,
        })
        setRealTableStructure(structRes.rows)

        const indexRes = await executeSql({
          connection: payload,
          sql:
            conn.type === 'postgresql'
              ? `SELECT indexname FROM pg_indexes WHERE schemaname = '${escapeSqlIdentifier(schema)}' AND tablename = '${escapeSqlIdentifier(table)}' ORDER BY indexname`
              : `SHOW INDEX FROM \`${tableId}\``,
        })
        setRealTableIndexes(
          conn.type === 'postgresql'
            ? indexRes.rows.map((r) => String(r.indexname || ''))
            : indexRes.rows.map((r) => String(r.Key_name || '')),
        )

        const countRes = await executeSql({
          connection: payload,
          sql: `SELECT COUNT(*) as count FROM ${fromClause}`,
        })
        setRealTableStats({
          rows: String(countRes.rows[0]?.count ?? '0'),
          columns: String(dataRes.columns.length),
          size: '-',
          indexes: String(
            conn.type === 'postgresql'
              ? indexRes.rows.length
              : new Set(indexRes.rows.map((r) => String(r.Key_name || ''))).size,
          ),
        })
      } catch (error) {
        console.error('Failed to fetch table data:', error)
      } finally {
        setTableDataLoading(false)
      }
    },
    [],
  )

  // Fetch database list when connection expands
  useEffect(() => {
    if (expandedConnectionId && selectedConnection && isSqlConnectionType(selectedConnection.type)) {
      const existing = treeDataMap[expandedConnectionId]
      if (!existing) {
        // eslint-disable-next-line
        fetchTreeData(expandedConnectionId, selectedConnection)
      }
    }
  }, [expandedConnectionId, selectedConnection, fetchTreeData, treeDataMap])

  const getTreeNodesForConnection = useCallback(
    (conn: ConnectionProfile): TreeNode[] => {
      if (!isSqlConnectionType(conn.type)) return []

      const treeData = treeDataMap[conn.id]
      if (!treeData) return []

      return treeData.databases.map((db) => {
        if (!db.loaded) {
          return { label: db.name }
        }

        if (conn.type === 'postgresql') {
          return {
            label: db.name,
            children: db.schemas.map((schema) => ({
              label: schema.name,
              children: [
                ...(schema.tables.length > 0
                  ? [{ label: 'Tables', children: schema.tables.map((t) => ({ label: t })) }]
                  : []),
                ...(schema.views.length > 0
                  ? [{ label: 'Views', children: schema.views.map((v) => ({ label: v })) }]
                  : []),
                ...(schema.functions.length > 0
                  ? [{ label: 'Functions', children: schema.functions.map((f) => ({ label: f })) }]
                  : []),
                { label: 'Queries', children: [] },
              ],
            })),
          }
        }

        if (conn.type === 'mysql') {
          const allTables = db.schemas[0]?.tables ?? []
          return {
            label: db.name,
            children: [
              ...(allTables.length > 0
                ? [{ label: 'Tables', children: allTables.map((t) => ({ label: t })) }]
                : []),
              { label: 'Views', children: [] },
              { label: 'Functions', children: [] },
              { label: 'Queries', children: [] },
            ],
          }
        }

        return { label: db.name }
      })
    },
    [treeDataMap],
  )

  const handleTreeNodeClick = useCallback(
    (nodeLabel: string, databaseName?: string) => {
      if (selectedConnection && isSqlConnectionType(selectedConnection.type)) {
        const treeData = treeDataMap[selectedConnection.id]
        if (!treeData) return false

        let isTable = false
        let schemaName = selectedSchema
        let targetDbName = databaseName

        if (selectedConnection.type === 'postgresql') {
          for (const db of treeData.databases) {
            for (const schema of db.schemas) {
              if (schema.tables.includes(nodeLabel)) {
                isTable = true
                schemaName = schema.name
                targetDbName = targetDbName || db.name
                break
              }
            }
            if (isTable) break
          }
        } else if (selectedConnection.type === 'mysql') {
          for (const db of treeData.databases) {
            const allTables = db.schemas[0]?.tables ?? []
            if (allTables.includes(nodeLabel)) {
              isTable = true
              schemaName = db.name
              targetDbName = db.name
              break
            }
          }
        }

        if (isTable) {
          setSelectedTable(nodeLabel)
          setSelectedSchema(schemaName)
          setSelectedDatabase(targetDbName || '')
          fetchTableData(selectedConnection, schemaName, nodeLabel, targetDbName)
          return true
        }
      }

      return false
    },
    [selectedConnection, selectedSchema, treeDataMap, fetchTableData],
  )

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
    setSelectedSchema,
    setSelectedDatabase,
    setSelectedTable,
    getTreeNodesForConnection,
    handleTreeNodeClick,
    fetchDatabaseDetails,
    refreshConnectionData: fetchTreeData,
  }
}