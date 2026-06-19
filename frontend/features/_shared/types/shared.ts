import type { ConnectionType } from './domain'

export type SqlConnectionType = 'postgresql' | 'mysql'
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error' | 'idle'
export type WizardStep = 1 | 2
export type TableInfoTab = 'data' | 'structure' | 'indexes' | 'relationships'
export type QueryResultTab = 'results' | 'messages' | 'statistics'

export interface TreeSchema {
  name: string
  tables: string[]
  views: string[]
  functions: string[]
}

export interface TreeDatabase {
  name: string
  schemas: TreeSchema[]
  loaded: boolean
}

export interface ExplorerTreeData {
  databases: TreeDatabase[]
  flatTables: string[]
}

export interface TableStats {
  rows: string
  columns: string
  size: string
  indexes: string
}

export interface SqlTableListItem {
  tableName: string
  oid: string
  owner: string
  tableType: string
  rowCount: string
}

export interface DetailStat {
  label: string
  value: string
}

export interface TreeNode {
  label: string
  children?: TreeNode[]
}

export interface DatabaseTypeOption {
  label: string
  value: ConnectionType
  logoSrc: string
  hint: string
}

export interface QueryTab {
  id: string
  title: string
  sql: string
}

export interface SavedQuery {
  id: string
  title: string
  sql: string
  updatedAt: string
}

export interface QueryResult {
  columns: string[]
  rows: Record<string, string>[]
  rowsAffected: number
  elapsedMs: number
}

export interface TestConnectionResult {
  kind: 'success' | 'error'
  message: string
}

export interface ContextMenuState {
  x: number
  y: number
  itemId: string
  tableName?: string
}

export interface DeleteTableTarget {
  connectionId: string
  connectionName: string
  connectionType: string
  database: string
  schema: string
  tableName: string
}

export type DataOperation = 'empty' | 'truncate'

export interface DataOperationTarget {
  connectionId: string
  connectionName: string
  connectionType: string
  database: string
  schema: string
  tableName: string
  operation: DataOperation
}

// ── SQL Table Data Export ─────────────────────────────────────────

export type TableExportFormat = 'txt' | 'csv' | 'json' | 'sql' | 'xlsx'

export type TableExportTarget = {
  connectionId: string
  connectionName: string
  connectionType: string
  database: string
  schema: string
  tableName: string
}

export interface TableExportOptions {
  format: TableExportFormat
  includeHeaders: boolean
  encoding: 'utf-8' | 'utf-16' | 'latin1'
  /** SQL-only: export mode */
  sqlMode: 'data-only' | 'schema-only' | 'schema-and-data'
  /** TXT-only: delimiter character */
  txtDelimiter: '\t' | ',' | '|' | ';'
}

export interface TableExportEstimate {
  rowCount: number | null
  estimatedSizeBytes: number | null
  loading: boolean
  error: string | null
}

export type TableExportJobStatus = 'idle' | 'preparing' | 'exporting' | 'success' | 'error'

export interface TableExportJob {
  status: TableExportJobStatus
  progress: number | null
  savedPath: string | null
  error: string | null
}

export interface RecentTableExport {
  id: string
  timestamp: string
  target: TableExportTarget
  options: TableExportOptions
  savedPath: string | null
}
