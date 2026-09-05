import type { ConnectionPayload } from '../../services/tauriClient'
import { normalizeError } from '../error-norm'
import type {
  ConnectorAdapter,
  EntityDetailResult,
  NavigationTreeResult,
  QueryExecutionResult,
  TestConnectionResult,
} from './adapter-types'
import {
  redisExecuteCommand,
  redisShowAllDatabases,
  redisTestConnection,
} from '../../../redis/clients/redis'

export const redisAdapter: ConnectorAdapter = {
  label: 'Redis',

  async testConnection(
    payload: ConnectionPayload,
  ): Promise<TestConnectionResult> {
    try {
      const result = await redisTestConnection(payload)
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
      const dbs = await redisShowAllDatabases(payload)
      const rawDatabases = dbs.length
        ? dbs
        : [{ db: 'db0', keys: 0, expires: 0, avgTtl: 0 }]
      const databases = rawDatabases.map((db) => ({
        name: db.db,
        schemas: [
          {
            name: db.db,
            tables: [],
            views: [],
            functions: [],
          },
        ],
        loaded: true,
      }))
      return {
        databases,
        flatTables: [],
      }
    } catch (err) {
      throw normalizeError(err)
    }
  },

  async openEntity(
    payload: ConnectionPayload,
    entityName: string,
  ): Promise<EntityDetailResult> {
    void payload
    void entityName
    return {
      stats: null,
      structure: [],
      indexes: [],
      columns: [],
      rows: [],
    }
  },

  async runQuery(
    payload: ConnectionPayload,
    query: string,
  ): Promise<QueryExecutionResult> {
    try {
      const startTime = performance.now()
      const rawResult = await redisExecuteCommand(payload, query)
      const elapsedMs = Math.round(performance.now() - startTime)
      return {
        columns: ['result'],
        rows: [{ result: rawResult }],
        rowsAffected: 1,
        elapsedMs,
      }
    } catch (err) {
      throw normalizeError(err)
    }
  },

  getDefaultContext(payload: ConnectionPayload): {
    database: string
    schema: string
  } {
    return {
      database: payload.database || 'db0',
      schema: '',
    }
  },
}
