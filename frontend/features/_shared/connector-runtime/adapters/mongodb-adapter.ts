import { normalizeError } from '../error-norm'
import type {
  ConnectorAdapter,
  TestConnectionResult,
  NavigationTreeResult,
  EntityDetailResult,
  QueryExecutionResult,
} from './adapter-types'
import type { ConnectionPayload } from '../../services/tauriClient'
import {
  mongoTestConnection,
  mongoListDatabases,
  mongoListCollections,
  mongoFindDocuments,
  mongoGetCollectionStats,
  mongoListIndexes,
} from '../../../mongodb/clients/mongodb'

export const mongodbAdapter: ConnectorAdapter = {
  label: 'MongoDB',

  async testConnection(
    payload: ConnectionPayload,
  ): Promise<TestConnectionResult> {
    try {
      const result = await mongoTestConnection(payload)
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
      const dbs = await mongoListDatabases(payload)
      const databases = await Promise.all(
        dbs.map(async (db) => {
          try {
            const collections = await mongoListCollections({
              connection: payload,
              database: db.name,
            })
            const tables = collections
              .filter((c) => c.collectionType !== 'view')
              .map((c) => c.name)
            const views = collections
              .filter((c) => c.collectionType === 'view')
              .map((c) => c.name)
            return {
              name: db.name,
              schemas: [
                {
                  name: db.name,
                  tables,
                  views,
                  functions: [],
                },
              ],
              loaded: true,
            }
          } catch {
            return {
              name: db.name,
              schemas: [],
              loaded: false,
            }
          }
        }),
      )
      const flatTables = databases.flatMap((db) =>
        db.schemas.flatMap((s) => [...s.tables, ...s.views]),
      )
      return {
        databases,
        flatTables,
      }
    } catch (err) {
      throw normalizeError(err)
    }
  },

  async openEntity(
    payload: ConnectionPayload,
    entityName: string,
  ): Promise<EntityDetailResult> {
    try {
      const parts = entityName.split('.')
      const database = parts.length > 1 ? parts[0] : payload.database || 'admin'
      const collection =
        parts.length > 1 ? parts.slice(1).join('.') : entityName

      const nsPayload = { connection: payload, database, collection }

      const [stats, indexes, findRes] = await Promise.all([
        mongoGetCollectionStats(nsPayload).catch(() => null),
        mongoListIndexes(nsPayload).catch(() => []),
        mongoFindDocuments({ ...nsPayload, offset: 0, pageSize: 50 }).catch(
          () => null,
        ),
      ])

      const rawRows = findRes?.documents || []
      const rows = rawRows.map((doc) =>
        Object.fromEntries(
          Object.entries(doc).map(([k, v]) => [
            k,
            typeof v === 'object' ? JSON.stringify(v) : String(v),
          ]),
        ),
      )

      const sampleDoc = rawRows[0] || {}
      const keys = Object.keys(sampleDoc)
      const columns = keys
      const structure = keys.map((key) => ({
        name: key,
        type: typeof sampleDoc[key],
      }))

      return {
        stats: stats
          ? {
              count: String(stats.count),
              sizeBytes: String(stats.sizeBytes),
              totalIndexSizeBytes: String(stats.totalIndexSizeBytes),
            }
          : null,
        structure,
        indexes: indexes.map((idx) => idx.name),
        columns,
        rows,
      }
    } catch (err) {
      throw normalizeError(err)
    }
  },

  async runQuery(
    payload: ConnectionPayload,
    query: string,
  ): Promise<QueryExecutionResult> {
    try {
      const filter = query.trim().length > 0 ? JSON.parse(query) : {}
      const database = payload.database || 'admin'
      const collection = 'system.js'
      const findRes = await mongoFindDocuments({
        connection: payload,
        database,
        collection,
        filter,
        offset: 0,
        pageSize: 50,
      })
      const rawRows = findRes.documents
      const rows = rawRows.map((doc) =>
        Object.fromEntries(
          Object.entries(doc).map(([k, v]) => [
            k,
            typeof v === 'object' ? JSON.stringify(v) : String(v),
          ]),
        ),
      )
      const columns = rawRows.length > 0 ? Object.keys(rawRows[0]) : []
      return {
        rows,
        columns,
        elapsedMs: findRes.elapsedMs,
        rowsAffected: rows.length,
      }
    } catch (err) {
      throw normalizeError(err)
    }
  },

  getDefaultContext(payload: ConnectionPayload): {
    database: string
    schema: string
  } {
    const database = payload.database || 'admin'
    return {
      database,
      schema: database,
    }
  },
}
