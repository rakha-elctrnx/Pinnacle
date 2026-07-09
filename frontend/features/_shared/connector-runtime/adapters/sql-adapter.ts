/**
 * SQL Adapter — PostgreSQL & MySQL connector implementation.
 *
 * Wraps the tauriClient SQL functions behind the ConnectorAdapter contract.
 * Provides test connection, navigation tree loading, entity details, and query execution.
 */

import {
  testConnection as tauriTestConnection,
  executeSql,
} from '../../../sql/clients/sql'
import type { ConnectionPayload } from '../../services/tauriClient'
import { normalizeError } from '../error-norm'
import type {
  ConnectorAdapter,
  TestConnectionResult,
  NavigationTreeResult,
  EntityDetailResult,
  QueryExecutionResult,
} from './adapter-types'

export const sqlAdapter: ConnectorAdapter = {
  label: 'SQL Database',

  async testConnection(
    payload: ConnectionPayload,
  ): Promise<TestConnectionResult> {
    try {
      const result = await tauriTestConnection(payload)
      if (result.ok) {
        return {
          kind: 'success',
          message: result.message || 'Connection successful',
        }
      }
      return {
        kind: 'error',
        message: result.message || 'Connection failed',
        normalizedError: normalizeError(result.message),
      }
    } catch (err) {
      return {
        kind: 'error',
        message: err instanceof Error ? err.message : 'Connection test failed',
        normalizedError: normalizeError(err),
      }
    }
  },

  async loadNavigationTree(
    payload: ConnectionPayload,
  ): Promise<NavigationTreeResult> {
    try {
      const result = await executeSql({
        connection: payload,
        sql: `
          SELECT
            table_catalog AS database_name,
            table_schema AS schema_name,
            table_name,
            table_type
          FROM information_schema.tables
          WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
            AND table_type IN ('BASE TABLE', 'VIEW')
          ORDER BY table_catalog, table_schema, table_name
        `,
      })

      const dbMap = new Map<
        string,
        {
          name: string
          schemas: Map<
            string,
            {
              name: string
              tables: string[]
              views: string[]
              functions: string[]
            }
          >
        }
      >()

      for (const row of result.rows) {
        const dbName = row.database_name || 'default'
        const schemaName = row.schema_name || 'public'
        const tableName = row.table_name
        const tableType = row.table_type || 'BASE TABLE'

        if (!dbMap.has(dbName)) {
          dbMap.set(dbName, { name: dbName, schemas: new Map() })
        }
        const db = dbMap.get(dbName)!

        if (!db.schemas.has(schemaName)) {
          db.schemas.set(schemaName, {
            name: schemaName,
            tables: [],
            views: [],
            functions: [],
          })
        }
        const schema = db.schemas.get(schemaName)!

        if (tableType === 'VIEW') {
          schema.views.push(tableName)
        } else {
          schema.tables.push(tableName)
        }
      }

      const databases = Array.from(dbMap.values()).map((db) => ({
        name: db.name,
        schemas: Array.from(db.schemas.values()),
        loaded: true,
      }))

      const flatTables = databases.flatMap((db) =>
        db.schemas.flatMap((s) => [...s.tables, ...s.views]),
      )

      return { databases, flatTables }
    } catch {
      return {
        databases: [],
        flatTables: [],
      }
    }
  },

  async openEntity(
    payload: ConnectionPayload,
    entityName: string,
  ): Promise<EntityDetailResult> {
    try {
      // Get columns
      const columnsResult = await executeSql({
        connection: payload,
        sql: `
          SELECT column_name, data_type, is_nullable, ordinal_position
          FROM information_schema.columns
          WHERE table_name = '${entityName.replace(/'/g, "''")}'
          ORDER BY ordinal_position
        `,
      })

      const columns = columnsResult.rows.map((r) => r.column_name)
      const structure = columnsResult.rows.map((r) => ({
        column: r.column_name,
        type: r.data_type,
        nullable: r.is_nullable,
      }))

      // Get row count
      const countResult = await executeSql({
        connection: payload,
        sql: `SELECT COUNT(*) as cnt FROM "${entityName.replace(/"/g, '""')}"`,
      })
      const rowCount = countResult.rows[0]?.cnt ?? '0'

      // Get sample rows
      const rowsResult = await executeSql({
        connection: payload,
        sql: `SELECT * FROM "${entityName.replace(/"/g, '""')}" LIMIT 50`,
      })

      // Get indexes
      const indexesResult = await executeSql({
        connection: payload,
        sql: `
          SELECT indexname, indexdef
          FROM pg_indexes
          WHERE tablename = '${entityName.replace(/'/g, "''")}'
          ORDER BY indexname
        `,
      })

      const indexes = indexesResult.rows.map(
        (r) => r.indexname || r.indexdef || '',
      )

      const stats = {
        rows: rowCount,
        columns: String(columns.length),
        size: '',
        indexes: String(indexes.length),
      }

      return {
        stats,
        structure,
        indexes,
        columns,
        rows: rowsResult.rows,
      }
    } catch {
      return {
        stats: null,
        structure: [],
        indexes: [],
        columns: [],
        rows: [],
      }
    }
  },

  async runQuery(
    payload: ConnectionPayload,
    query: string,
    database?: string,
  ): Promise<QueryExecutionResult> {
    const finalPayload = database ? { ...payload, database } : payload
    const result = await executeSql({
      connection: finalPayload,
      sql: query,
    })
    return {
      columns: result.columns,
      rows: result.rows,
      rowsAffected: result.rowsAffected,
      elapsedMs: result.elapsedMs,
    }
  },

  getDefaultContext(payload: ConnectionPayload): {
    database: string
    schema: string
  } {
    return {
      database: payload.database || 'default',
      schema: 'public',
    }
  },
}
