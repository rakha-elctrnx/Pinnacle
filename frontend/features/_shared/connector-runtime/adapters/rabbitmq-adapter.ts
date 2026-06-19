import type { ConnectionPayload } from '../../services/tauriClient'
import { normalizeError } from '../error-norm'
import type { ConnectorAdapter, EntityDetailResult, NavigationTreeResult, QueryExecutionResult, TestConnectionResult } from './adapter-types'

function isReachablePayload(payload: ConnectionPayload): boolean {
  return payload.host.trim().length > 0 && payload.port > 0
}

export const rabbitmqAdapter: ConnectorAdapter = {
  label: 'RabbitMQ',

  async testConnection(payload: ConnectionPayload): Promise<TestConnectionResult> {
    if (isReachablePayload(payload)) {
      return {
        kind: 'success',
        message: 'Connection test simulated for RabbitMQ',
      }
    }

    const message = 'Invalid RabbitMQ connection parameters'
    return {
      kind: 'error',
      message,
      normalizedError: normalizeError(message),
    }
  },

  async loadNavigationTree(payload: ConnectionPayload): Promise<NavigationTreeResult> {
    void payload
    return {
      databases: [],
      flatTables: [],
    }
  },

  async openEntity(payload: ConnectionPayload, entityName: string): Promise<EntityDetailResult> {
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

  async runQuery(payload: ConnectionPayload, query: string): Promise<QueryExecutionResult> {
    void payload
    void query
    return {
      columns: [],
      rows: [],
      rowsAffected: 0,
      elapsedMs: 0,
    }
  },

  getDefaultContext(payload: ConnectionPayload): { database: string; schema: string } {
    void payload
    return {
      database: 'rabbitmq',
      schema: 'default',
    }
  },
}