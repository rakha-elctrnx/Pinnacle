/**
 * Adapter types — contract for connector-specific runtime adapters.
 *
 * Each connector type (sql, elasticsearch) implements this interface to
 * provide a uniform set of operations that the orchestrator can call
 * without switching on raw type strings.
 *
 * Phase 2: Core operations extracted from hooks/components.
 */

import type { ConnectionPayload } from '../../../../../services/tauriClient'
import type { NormalizedError } from '../error-norm'

/** Return type for test-connection operations. */
export interface TestConnectionResult {
  kind: 'success' | 'error'
  message: string
  normalizedError?: NormalizedError
}

/** Return type for navigation tree loading. */
export interface NavigationTreeResult {
  databases: Array<{
    name: string
    schemas: Array<{
      name: string
      tables: string[]
      views: string[]
      functions: string[]
    }>
    loaded: boolean
  }>
  flatTables: string[]
}

/** Return type for entity detail loading (table structure, columns, etc.). */
export interface EntityDetailResult {
  stats: Record<string, string> | null
  structure: Record<string, string>[]
  indexes: string[]
  columns: string[]
  rows: Record<string, string>[]
}

/** Return type for running a query. */
export interface QueryExecutionResult {
  columns: string[]
  rows: Record<string, string>[]
  rowsAffected: number
  elapsedMs: number
}

/**
 * Standard adapter contract.
 * Not all connectors implement every operation; callers should check
 * capability first via the registry.
 */
export interface ConnectorAdapter {
  /** Human-readable label for this adapter. */
  readonly label: string

  /** Test the connection with given payload. */
  testConnection(payload: ConnectionPayload): Promise<TestConnectionResult>

  /** Load navigation tree (databases/schemas/tables). */
  loadNavigationTree(payload: ConnectionPayload): Promise<NavigationTreeResult>

  /** Open a specific entity (table/index) and return its detail. */
  openEntity(payload: ConnectionPayload, entityName: string): Promise<EntityDetailResult>

  /** Run an ad-hoc query/command. */
  runQuery(payload: ConnectionPayload, query: string, database?: string, schema?: string): Promise<QueryExecutionResult>

  /** Get default context (database, schema) for UX defaults. */
  getDefaultContext(payload: ConnectionPayload): { database: string; schema: string }
}