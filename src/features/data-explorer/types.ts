import type { ConnectionType } from '../../types/domain'

export type SqlConnectionType = 'postgresql' | 'mysql'
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error' | 'idle'
export type WizardStep = 1 | 2 | 3 | 4
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
}