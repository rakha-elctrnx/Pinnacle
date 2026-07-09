import type { ConnectionPayload } from '../../_shared/services/tauriClient'

// ── Commit Table Changes (task-011c) ─────────────────────────────

export interface CommitTableChangesPayload {
  connection: ConnectionPayload
  tableName: string
  inserts: Record<string, unknown>[]
  updates: { rowId: string; changes: Record<string, unknown> }[]
  deletes: string[]
  primaryKeyColumn: string
}

export interface CommitTableChangesResult {
  insertedRows: number
  updatedRows: number
  deletedRows: number
}

// ── SQL Table Schema Introspection Types ──────────────────────────

export interface TableSchemaInfo {
  tableName: string
  schema: string
  columns: TableColumn[]
  primaryKey: PrimaryKeyConstraint | null
  uniqueConstraints: UniqueConstraint[]
  foreignKeys: ForeignKeyConstraint[]
  indexes: IndexDefinition[]
}

export interface TableColumn {
  name: string
  dataType: string
  isNullable: boolean
  defaultValue: string | null
  isAutoIncrement: boolean
  comment: string | null
}

export interface PrimaryKeyConstraint {
  name: string
  columns: string[]
}

export interface UniqueConstraint {
  name: string
  columns: string[]
}

export interface ForeignKeyConstraint {
  name: string
  columns: string[]
  referencedTable: string
  referencedSchema: string
  referencedColumns: string[]
  onUpdate: string
  onDelete: string
}

export interface IndexDefinition {
  name: string
  columns: string[]
  isUnique: boolean
  indexType: string
}

/** Schema-level foreign key info including source table (for bulk FK fetch / ER diagram). */
export interface SchemaForeignKey {
  sourceTable: string
  constraintName: string
  columns: string[]
  referencedTable: string
  referencedSchema: string
  referencedColumns: string[]
}

/** Schema-level column info for bulk column fetch (ER diagram node detail). */
export interface SchemaColumn {
  tableName: string
  columnName: string
  dataType: string
  isNullable: boolean
  defaultValue: string | null
  dataTypeName: string
}

// ── Drop Table Types ─────────────────────────────────────────────

export interface DropTablePayload {
  connection: {
    type: string
    host: string
    port: number
    username: string
    password: string
    database: string
    ssl: boolean
    schema?: string
  }
  schema: string
  tableName: string
  cascade: boolean
}

export interface DropTableResult {
  success: boolean
  sql: string
  elapsedMs: number
  error: string | null
}
