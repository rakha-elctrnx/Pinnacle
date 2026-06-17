/**
 * SQL Table Designer — Type Definitions
 *
 * Frontend TypeScript types for the table schema model, DDL plan,
 * schema diff, and designer validation. These types align with the
 * backend contracts from task-012 (introspection) and task-013 (DDL generator).
 */

// ── Core Schema Model ──────────────────────────────────────────────

export interface TableSchemaModel {
  tableName: string
  schema: string
  columns: ColumnDefinition[]
  primaryKey: PrimaryKeyDefinition | null
  uniqueConstraints: UniqueConstraintDefinition[]
  foreignKeys: ForeignKeyDefinition[]
  indexes: IndexDefinition[]
}

export interface ColumnDefinition {
  /** Client-side UUID for tracking across edits */
  id: string
  name: string
  dataType: string
  length: number | null
  precision: number | null
  scale: number | null
  isNullable: boolean
  defaultValue: string | null
  isAutoIncrement: boolean
  comment: string | null
  position: number
}

export interface PrimaryKeyDefinition {
  id: string
  /** null = auto-generate name on save */
  name: string | null
  /** References column names */
  columns: string[]
}

export interface UniqueConstraintDefinition {
  id: string
  name: string | null
  columns: string[]
}

export interface ForeignKeyDefinition {
  id: string
  name: string | null
  columns: string[]
  referencedSchema: string
  referencedTable: string
  referencedColumns: string[]
  onUpdate: ReferentialAction
  onDelete: ReferentialAction
}

export type ReferentialAction =
  | 'NO ACTION'
  | 'RESTRICT'
  | 'CASCADE'
  | 'SET NULL'
  | 'SET DEFAULT'

export interface IndexDefinition {
  id: string
  name: string | null
  columns: string[]
  isUnique: boolean
  indexType: 'btree' | 'hash' | 'gin' | 'gist' | 'fulltext' | 'spatial'
}

// ── DDL Plan Types ─────────────────────────────────────────────────

export interface DdlPlan {
  statements: DdlStatement[]
  isDestructive: boolean
  warnings: string[]
}

export interface DdlStatement {
  order: number
  sql: string
  description: string
  isDestructive: boolean
}

export interface DdlExecutionResult {
  success: boolean
  executedCount: number
  statements: DdlStatementResult[]
}

export interface DdlStatementResult {
  order: number
  sql: string
  success: boolean
  error: string | null
  elapsedMs: number
}

// ── Schema Diff Types ──────────────────────────────────────────────

export type ChangeType = 'add' | 'modify' | 'remove'
export type ChangeTarget =
  | 'column'
  | 'primaryKey'
  | 'foreignKey'
  | 'uniqueConstraint'
  | 'index'

export interface SchemaDiffSummary {
  hasChanges: boolean
  destructiveCount: number
  changes: SchemaChangeItem[]
}

export interface SchemaChangeItem {
  type: ChangeType
  target: ChangeTarget
  name: string
  description: string
  isDestructive: boolean
  details: string[]
}

// ── Validation Types ───────────────────────────────────────────────

export type DesignerErrorCode =
  | 'TABLE_NAME_REQUIRED'
  | 'MIN_ONE_COLUMN'
  | 'COLUMN_NAME_REQUIRED'
  | 'DATA_TYPE_REQUIRED'
  | 'DUPLICATE_COLUMN_NAME'
  | 'PK_COLUMN_NOT_FOUND'
  | 'FK_COLUMN_NOT_FOUND'
  | 'UQ_COLUMN_NOT_FOUND'
  | 'IDX_COLUMN_NOT_FOUND'
  | 'FK_REF_COLUMNS_REQUIRED'
  | 'FK_COLUMN_COUNT_MISMATCH'

export interface DesignerValidationError {
  code: DesignerErrorCode
  message: string
  /** Optional path to the specific field (e.g. column id or constraint id) */
  path?: string
}
