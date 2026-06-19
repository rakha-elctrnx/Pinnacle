/**
 * SQL Table Designer — Validation Logic
 *
 * Validates a TableSchemaModel against all business rules before
 * DDL generation. Returns an array of validation errors; empty = valid.
 */

import type {
  TableSchemaModel,
  DesignerValidationError,
  DesignerErrorCode,
} from './index'

/**
 * Run all validation rules against a schema model.
 */
export function validateSchemaModel(
  model: TableSchemaModel,
): DesignerValidationError[] {
  const errors: DesignerValidationError[] = []

  validateTableName(model, errors)
  validateColumns(model, errors)
  validatePrimaryKey(model, errors)
  validateUniqueConstraints(model, errors)
  validateForeignKeys(model, errors)
  validateIndexes(model, errors)

  return errors
}

// ── Helpers ────────────────────────────────────────────────────────

function push(
  errors: DesignerValidationError[],
  code: DesignerErrorCode,
  message: string,
  path?: string,
): void {
  errors.push({ code, message, path })
}

function validateTableName(
  model: TableSchemaModel,
  errors: DesignerValidationError[],
): void {
  if (!model.tableName.trim()) {
    push(errors, 'TABLE_NAME_REQUIRED', 'Table name is required.')
  }
}

function validateColumns(
  model: TableSchemaModel,
  errors: DesignerValidationError[],
): void {
  if (model.columns.length === 0) {
    push(errors, 'MIN_ONE_COLUMN', 'At least one column is required.')
    return
  }

  const seenNames = new Set<string>()

  for (const col of model.columns) {
    if (!col.name.trim()) {
      push(
        errors,
        'COLUMN_NAME_REQUIRED',
        `Column at position ${col.position} requires a name.`,
        col.id,
      )
    }

    if (!col.dataType.trim()) {
      push(
        errors,
        'DATA_TYPE_REQUIRED',
        `Column "${col.name || `#${col.position}`}" requires a data type.`,
        col.id,
      )
    }

    const normalizedName = col.name.trim().toLowerCase()
    if (normalizedName && seenNames.has(normalizedName)) {
      push(
        errors,
        'DUPLICATE_COLUMN_NAME',
        `Duplicate column name "${col.name}".`,
        col.id,
      )
    }
    if (normalizedName) {
      seenNames.add(normalizedName)
    }
  }
}

function validatePrimaryKey(
  model: TableSchemaModel,
  errors: DesignerValidationError[],
): void {
  const pk = model.primaryKey
  if (!pk) return

  const columnNames = new Set(
    model.columns.map((c) => c.name.trim().toLowerCase()),
  )

  for (const colName of pk.columns) {
    if (!columnNames.has(colName.trim().toLowerCase())) {
      push(
        errors,
        'PK_COLUMN_NOT_FOUND',
        `Primary key references column "${colName}" which does not exist.`,
        pk.id,
      )
    }
  }
}

function validateUniqueConstraints(
  model: TableSchemaModel,
  errors: DesignerValidationError[],
): void {
  const columnNames = new Set(
    model.columns.map((c) => c.name.trim().toLowerCase()),
  )

  for (const uq of model.uniqueConstraints) {
    for (const colName of uq.columns) {
      if (!columnNames.has(colName.trim().toLowerCase())) {
        push(
          errors,
          'UQ_COLUMN_NOT_FOUND',
          `Unique constraint "${uq.name || uq.id}" references column "${colName}" which does not exist.`,
          uq.id,
        )
      }
    }
  }
}

function validateForeignKeys(
  model: TableSchemaModel,
  errors: DesignerValidationError[],
): void {
  const columnNames = new Set(
    model.columns.map((c) => c.name.trim().toLowerCase()),
  )

  for (const fk of model.foreignKeys) {
    // Check local columns exist
    for (const colName of fk.columns) {
      if (!columnNames.has(colName.trim().toLowerCase())) {
        push(
          errors,
          'FK_COLUMN_NOT_FOUND',
          `Foreign key "${fk.name || fk.id}" references column "${colName}" which does not exist.`,
          fk.id,
        )
      }
    }

    // Referenced columns must not be empty
    if (fk.referencedColumns.length === 0) {
      push(
        errors,
        'FK_REF_COLUMNS_REQUIRED',
        `Foreign key "${fk.name || fk.id}" must specify referenced columns.`,
        fk.id,
      )
    }

    // Column count must match
    if (
      fk.referencedColumns.length > 0 &&
      fk.columns.length !== fk.referencedColumns.length
    ) {
      push(
        errors,
        'FK_COLUMN_COUNT_MISMATCH',
        `Foreign key "${fk.name || fk.id}" has ${fk.columns.length} local column(s) but ${fk.referencedColumns.length} referenced column(s).`,
        fk.id,
      )
    }
  }
}

function validateIndexes(
  model: TableSchemaModel,
  errors: DesignerValidationError[],
): void {
  const columnNames = new Set(
    model.columns.map((c) => c.name.trim().toLowerCase()),
  )

  for (const idx of model.indexes) {
    for (const colName of idx.columns) {
      if (!columnNames.has(colName.trim().toLowerCase())) {
        push(
          errors,
          'IDX_COLUMN_NOT_FOUND',
          `Index "${idx.name || idx.id}" references column "${colName}" which does not exist.`,
          idx.id,
        )
      }
    }
  }
}
