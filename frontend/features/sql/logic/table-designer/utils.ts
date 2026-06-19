/**
 * SQL Table Designer — Transformation Utilities
 *
 * Utility functions for schema model manipulation: creating empty
 * defaults, generating client-side IDs, column reordering, and
 * transforming models into DDL request payloads.
 */

import type {
  TableSchemaModel,
  ColumnDefinition,
  PrimaryKeyDefinition,
  UniqueConstraintDefinition,
  ForeignKeyDefinition,
  IndexDefinition,
  ReferentialAction,
} from './index'
import type {
  TableSchemaInfo,
  TableColumn,
  PrimaryKeyConstraint,
  UniqueConstraint,
  ForeignKeyConstraint,
  IndexDefinition as BackendIndexDefinition,
} from '../../types/sql'

// ── ID Generation ──────────────────────────────────────────────────

let counter = 0

/** Generate a unique client-side ID for tracking entities across edits. */
export function generateId(prefix = 'td'): string {
  counter += 1
  return `${prefix}_${Date.now()}_${counter}`
}

// ── Factory Functions ──────────────────────────────────────────────

/** Create an empty schema model for a new table. */
export function createEmptySchemaModel(
  schema: string,
  tableName = '',
): TableSchemaModel {
  return {
    tableName,
    schema,
    columns: [],
    primaryKey: null,
    uniqueConstraints: [],
    foreignKeys: [],
    indexes: [],
  }
}

/** Create a new column definition with sensible defaults. */
export function createDefaultColumn(position: number): ColumnDefinition {
  return {
    id: generateId('col'),
    name: '',
    dataType: '',
    length: null,
    precision: null,
    scale: null,
    isNullable: true,
    defaultValue: null,
    isAutoIncrement: false,
    comment: null,
    position,
  }
}

/** Create a new primary key definition. */
export function createDefaultPrimaryKey(
  columns: string[] = [],
): PrimaryKeyDefinition {
  return {
    id: generateId('pk'),
    name: null,
    columns,
  }
}

/** Create a new unique constraint definition. */
export function createDefaultUniqueConstraint(): UniqueConstraintDefinition {
  return {
    id: generateId('uq'),
    name: null,
    columns: [],
  }
}

/** Create a new foreign key definition. */
export function createDefaultForeignKey(): ForeignKeyDefinition {
  return {
    id: generateId('fk'),
    name: null,
    columns: [],
    referencedSchema: '',
    referencedTable: '',
    referencedColumns: [],
    onUpdate: 'NO ACTION' as ReferentialAction,
    onDelete: 'NO ACTION' as ReferentialAction,
  }
}

/** Create a new index definition. */
export function createDefaultIndex(): IndexDefinition {
  return {
    id: generateId('idx'),
    name: null,
    columns: [],
    isUnique: false,
    indexType: 'btree',
  }
}

// ── Column Ordering ────────────────────────────────────────────────

/**
 * Reorder a column up or down within the columns array.
 * Returns a new array with updated positions; does not mutate input.
 */
export function moveColumn(
  columns: ColumnDefinition[],
  columnId: string,
  direction: 'up' | 'down',
): ColumnDefinition[] {
  const sorted = [...columns].sort((a, b) => a.position - b.position)
  const index = sorted.findIndex((c) => c.id === columnId)

  if (index === -1) return columns
  if (direction === 'up' && index === 0) return columns
  if (direction === 'down' && index === sorted.length - 1) return columns

  const targetIndex = direction === 'up' ? index - 1 : index + 1

  // Swap positions
  const result = [...sorted]
  const tempPos = result[index].position
  result[index] = { ...result[index], position: result[targetIndex].position }
  result[targetIndex] = { ...result[targetIndex], position: tempPos }

  // Swap in array
  ;[result[index], result[targetIndex]] = [result[targetIndex], result[index]]

  return result
}

/**
 * Insert a new column at a specific position, shifting subsequent columns.
 */
export function insertColumnAt(
  columns: ColumnDefinition[],
  newColumn: ColumnDefinition,
  afterPosition?: number,
): ColumnDefinition[] {
  const sorted = [...columns].sort((a, b) => a.position - b.position)
  const insertIndex =
    afterPosition !== undefined
      ? sorted.findIndex((c) => c.position === afterPosition) + 1
      : sorted.length

  const inserted = { ...newColumn, position: insertIndex }
  const result = [
    ...sorted.slice(0, insertIndex),
    inserted,
    ...sorted.slice(insertIndex),
  ]

  // Re-index positions
  return result.map((c, i) => ({ ...c, position: i }))
}

/**
 * Remove a column and re-index remaining positions.
 */
export function removeColumnAndReindex(
  columns: ColumnDefinition[],
  columnId: string,
): ColumnDefinition[] {
  return columns
    .filter((c) => c.id !== columnId)
    .sort((a, b) => a.position - b.position)
    .map((c, i) => ({ ...c, position: i }))
}

// ── DDL Request Transformation ─────────────────────────────────────

/**
 * Build the DDL generation request payload.
 * For CREATE TABLE, pass `current` as null.
 */
export function toDdlRequest(
  current: TableSchemaModel | null,
  pending: TableSchemaModel,
) {
  return {
    current: current ? toSchemaPayload(current) : null,
    pending: toSchemaPayload(pending),
  }
}

/**
 * Strip client-side IDs and transform to the backend-compatible shape.
 */
function toSchemaPayload(model: TableSchemaModel) {
  return {
    tableName: model.tableName,
    schema: model.schema,
    columns: model.columns.map((c) => ({
      name: c.name,
      dataType: c.dataType,
      length: c.length,
      precision: c.precision,
      scale: c.scale,
      isNullable: c.isNullable,
      defaultValue: c.defaultValue,
      isAutoIncrement: c.isAutoIncrement,
      comment: c.comment,
      position: c.position,
    })),
    primaryKey: model.primaryKey
      ? {
          name: model.primaryKey.name ?? '',
          columns: model.primaryKey.columns,
        }
      : null,
    uniqueConstraints: model.uniqueConstraints.map((u) => ({
      name: u.name ?? '',
      columns: u.columns,
    })),
    foreignKeys: model.foreignKeys.map((fk) => ({
      name: fk.name ?? '',
      columns: fk.columns,
      referencedSchema: fk.referencedSchema,
      referencedTable: fk.referencedTable,
      referencedColumns: fk.referencedColumns,
      onUpdate: fk.onUpdate,
      onDelete: fk.onDelete,
    })),
    indexes: model.indexes.map((idx) => ({
      name: idx.name ?? '',
      columns: idx.columns,
      isUnique: idx.isUnique,
      indexType: idx.indexType,
    })),
  }
}

// ── Backend → Frontend Transformation ─────────────────────────────

const VALID_REFERENTIAL_ACTIONS: ReferentialAction[] = [
  'NO ACTION',
  'RESTRICT',
  'CASCADE',
  'SET NULL',
  'SET DEFAULT',
]

function toReferentialAction(value: string): ReferentialAction {
  const upper = value.toUpperCase()
  return VALID_REFERENTIAL_ACTIONS.includes(upper as ReferentialAction)
    ? (upper as ReferentialAction)
    : 'NO ACTION'
}

const VALID_INDEX_TYPES: IndexDefinition['indexType'][] = [
  'btree',
  'hash',
  'gin',
  'gist',
  'fulltext',
  'spatial',
]

function toIndexType(value: string): IndexDefinition['indexType'] {
  const lower = value.toLowerCase()
  return VALID_INDEX_TYPES.includes(lower as IndexDefinition['indexType'])
    ? (lower as IndexDefinition['indexType'])
    : 'btree'
}

/**
 * Transform a backend `TableSchemaInfo` response into a frontend
 * `TableSchemaModel` with client-side IDs, positions, and typed enums.
 */
export function fromBackendSchemaInfo(info: TableSchemaInfo): TableSchemaModel {
  return {
    tableName: info.tableName,
    schema: info.schema,
    columns: info.columns.map((col: TableColumn, index: number) =>
      toColumnDefinition(col, index),
    ),
    primaryKey: info.primaryKey
      ? toPrimaryKeyDefinition(info.primaryKey)
      : null,
    uniqueConstraints: info.uniqueConstraints.map(
      (uc: UniqueConstraint) => toUniqueConstraintDefinition(uc),
    ),
    foreignKeys: info.foreignKeys.map(
      (fk: ForeignKeyConstraint) => toForeignKeyDefinition(fk),
    ),
    indexes: info.indexes.map(
      (idx: BackendIndexDefinition) => toFrontendIndexDefinition(idx),
    ),
  }
}

function toColumnDefinition(
  col: TableColumn,
  index: number,
): ColumnDefinition {
  return {
    id: generateId('col'),
    name: col.name,
    dataType: col.dataType,
    length: null,
    precision: null,
    scale: null,
    isNullable: col.isNullable,
    defaultValue: col.defaultValue ?? null,
    isAutoIncrement: col.isAutoIncrement,
    comment: col.comment ?? null,
    position: index,
  }
}

function toPrimaryKeyDefinition(
  pk: PrimaryKeyConstraint,
): PrimaryKeyDefinition {
  return {
    id: generateId('pk'),
    name: pk.name || null,
    columns: pk.columns,
  }
}

function toUniqueConstraintDefinition(
  uc: UniqueConstraint,
): UniqueConstraintDefinition {
  return {
    id: generateId('uq'),
    name: uc.name || null,
    columns: uc.columns,
  }
}

function toForeignKeyDefinition(
  fk: ForeignKeyConstraint,
): ForeignKeyDefinition {
  return {
    id: generateId('fk'),
    name: fk.name || null,
    columns: fk.columns,
    referencedSchema: fk.referencedSchema,
    referencedTable: fk.referencedTable,
    referencedColumns: fk.referencedColumns,
    onUpdate: toReferentialAction(fk.onUpdate),
    onDelete: toReferentialAction(fk.onDelete),
  }
}

function toFrontendIndexDefinition(
  idx: BackendIndexDefinition,
): IndexDefinition {
  return {
    id: generateId('idx'),
    name: idx.name || null,
    columns: idx.columns,
    isUnique: idx.isUnique,
    indexType: toIndexType(idx.indexType),
  }
}
