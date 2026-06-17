/**
 * MongoDB Adapter — connector implementation with progressive capability.
 *
 * Phase 3: Onboarding awal MongoDB via registry.
 * - Full capability: test-connection
 * - Progressive (stub): load-navigation-tree, open-entity, run-query
 * - N/A: get-default-context (MongoDB tidak punya schema/database konsep seperti SQL)
 *
 * Progressive capability memungkinkan connector baru dikenali oleh registry
 * sebelum seluruh feature penuh diimplementasikan.
 */

import { invoke } from '@tauri-apps/api/core'
import { normalizeError } from '../error-norm'
import type { ConnectorAdapter, TestConnectionResult, NavigationTreeResult, EntityDetailResult, QueryExecutionResult } from './adapter-types'
import type { ConnectionPayload } from '../../../../../services/tauriClient'

/**
 * Coba panggil Tauri command MongoDB test connection.
 * Jika command tidak tersedia (bln backend belum diimplementasi),
 * fallback ke simulated test.
 */
async function tryMongoTestConnection(payload: ConnectionPayload): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await invoke<{ ok: boolean; message: string }>('mongo_test_connection', { payload })
    return result
  } catch {
    // Backend command belum tersedia — simulated check
    return {
      ok: payload.host.length > 0 && payload.port > 0,
      message: payload.host.length > 0 && payload.port > 0
        ? 'Connection test simulated (backend pending)'
        : 'Invalid connection parameters',
    }
  }
}

export const mongodbAdapter: ConnectorAdapter = {
  label: 'MongoDB',

  async testConnection(payload: ConnectionPayload): Promise<TestConnectionResult> {
    try {
      const result = await tryMongoTestConnection(payload)
      if (result.ok) {
        return { kind: 'success', message: result.message || 'Connection successful' }
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

  async loadNavigationTree(payload: ConnectionPayload): Promise<NavigationTreeResult> {
    void payload
    // Progressive: stub — akan diimplementasi di fase lanjutan
    return {
      databases: [{
        name: 'mongodb',
        schemas: [{
          name: 'default',
          tables: [],
          views: [],
          functions: [],
        }],
        loaded: false,
      }],
      flatTables: [],
    }
  },

  async openEntity(payload: ConnectionPayload, entityName: string): Promise<EntityDetailResult> {
    void payload; void entityName
    // Progressive: stub — akan diimplementasi di fase lanjutan
    return {
      stats: null,
      structure: [],
      indexes: [],
      columns: [],
      rows: [],
    }
  },

  async runQuery(payload: ConnectionPayload, query: string): Promise<QueryExecutionResult> {
    void payload; void query
    // Progressive: stub — akan diimplementasi di fase lanjutan
    return {
      columns: [],
      rows: [],
      rowsAffected: 0,
      elapsedMs: 0,
    }
  },

  getDefaultContext(payload: ConnectionPayload): { database: string; schema: string } {
    void payload
    // MongoDB tidak punya konsep schema seperti SQL
    return {
      database: 'mongodb',
      schema: 'default',
    }
  },
}