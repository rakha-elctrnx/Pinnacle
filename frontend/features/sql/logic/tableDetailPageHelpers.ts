import type {
  ColumnMetadata,
  FilterCondition,
  TableRow,
} from '../types/tableDetail'

// ── Constants ──────────────────────────────────────────────────────────────

export const ROW_GUTTER_WIDTH = 36
export const MIN_COLUMN_WIDTH = 80
export const MAX_COLUMN_WIDTH = 360
export const DEFAULT_PAGE_SIZE = 50
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build SQL WHERE condition from a filter condition.
 * Handles column escaping, value quoting, and operator translation for Postgres/MySQL.
 */
export function buildSqlForCondition(
  cond: FilterCondition,
  dbType: 'postgresql' | 'mysql',
  columnsMeta: ColumnMetadata[],
): string {
  const { column, operator, value } = cond

  // Find column metadata for type information
  const columnMeta = columnsMeta.find((col) => col.columnName === column)
  const columnType = columnMeta?.dataType?.toLowerCase() || ''

  // Determine if this is a numeric column
  const numericTypes = [
    'int',
    'integer',
    'bigint',
    'smallint',
    'serial',
    'bigserial',
    'decimal',
    'numeric',
    'float',
    'double',
    'real',
  ]
  const isNumeric = numericTypes.some((type) => columnType.includes(type))

  // Escape column identifier based on database type
  const escapeColumn = (col: string) => {
    if (dbType === 'postgresql') {
      return `"${col.replace(/"/g, '""')}"`
    } else {
      return `\`${col.replace(/`/g, '``')}\``
    }
  }

  // Escape string values and handle special operators
  const escapeValue = (val: string) => {
    if (isNumeric && !isNaN(Number(val))) {
      return val // Return as-is for numeric values
    }
    // Escape single quotes by doubling them
    return `'${val.replace(/'/g, "''")}'`
  }

  const escapedColumn = escapeColumn(column)

  switch (operator) {
    case '=':
      return `${escapedColumn} = ${escapeValue(value)}`
    case '!=':
      return `${escapedColumn} != ${escapeValue(value)}`
    case 'contains':
      return dbType === 'postgresql'
        ? `${escapedColumn} ILIKE ${escapeValue(`%${value}%`)}`
        : `${escapedColumn} LIKE ${escapeValue(`%${value}%`)}`
    case 'starts_with':
      return dbType === 'postgresql'
        ? `${escapedColumn} ILIKE ${escapeValue(`${value}%`)}`
        : `${escapedColumn} LIKE ${escapeValue(`${value}%`)}`
    case 'ends_with':
      return dbType === 'postgresql'
        ? `${escapedColumn} ILIKE ${escapeValue(`%${value}`)}`
        : `${escapedColumn} LIKE ${escapeValue(`%${value}`)}`
    case '>':
      return `${escapedColumn} > ${escapeValue(value)}`
    case '>=':
      return `${escapedColumn} >= ${escapeValue(value)}`
    case '<':
      return `${escapedColumn} < ${escapeValue(value)}`
    case '<=':
      return `${escapedColumn} <= ${escapeValue(value)}`
    case 'is_null':
      return `${escapedColumn} IS NULL`
    case 'is_not_null':
      return `${escapedColumn} IS NOT NULL`
    case 'in': {
      // Parse comma-separated values for IN clause
      const values = value
        .split(',')
        .map((v) => escapeValue(v.trim()))
        .join(', ')
      return `${escapedColumn} IN (${values})`
    }
    default:
      return `${escapedColumn} = ${escapeValue(value)}`
  }
}

/**
 * Build complete WHERE clause from multiple filter conditions.
 * Joins conditions with AND.
 */
export function buildWhereClause(
  filters: FilterCondition[],
  dbType: 'postgresql' | 'mysql',
  columnsMeta: ColumnMetadata[],
): string {
  if (filters.length === 0) return ''

  const conditions = filters.map((cond) =>
    buildSqlForCondition(cond, dbType, columnsMeta),
  )
  return conditions.join(' AND ')
}

/**
 * Build ORDER BY clause from sort state.
 * Escapes column identifiers for Postgres (double-quotes) or MySQL (backticks).
 */
export function buildOrderByClause(
  column: string | null,
  direction: 'asc' | 'desc',
  dbType: 'postgresql' | 'mysql',
): string {
  if (!column) return ''

  const escapeColumn = (col: string) => {
    if (dbType === 'postgresql') {
      return `"${col.replace(/"/g, '""')}"`
    } else {
      return `\`${col.replace(/`/g, '``')}\``
    }
  }

  return `${escapeColumn(column)} ${direction.toUpperCase()}`
}

export function isPrimaryKeyColumn(
  metadata: ColumnMetadata | undefined,
): boolean {
  return Boolean(
    metadata?.isPrimaryKey === true ||
    metadata?.primaryKey === true ||
    metadata?.columnKey?.toUpperCase() === 'PRI',
  )
}

export function getPinnedLeftOffset(
  columnIndex: number,
  columns: string[],
  widths: number[],
  metadata: ColumnMetadata[],
): number | null {
  const currentColumn = columns[columnIndex]
  const currentMetadata = metadata.find(
    (column) => column.columnName === currentColumn,
  )

  if (!isPrimaryKeyColumn(currentMetadata)) return null

  return columns.slice(0, columnIndex).reduce((offset, column, index) => {
    const columnMetadata = metadata.find((item) => item.columnName === column)
    return isPrimaryKeyColumn(columnMetadata)
      ? offset + (widths[index] ?? MIN_COLUMN_WIDTH)
      : offset
  }, ROW_GUTTER_WIDTH)
}

/** Build a stable row ID: try first PK column, fall back to `${tableName}-${index}`. */
export function buildRowId(
  row: TableRow,
  index: number,
  tableName: string | undefined,
  pkColumn?: string,
): string {
  // Insert rows carry a synthetic __rowId — return it directly
  // to guarantee uniqueness and avoid collision with persistent row IDs.
  const candidateId = (row as Record<string, unknown>)['__rowId']
  if (typeof candidateId === 'string' && candidateId.startsWith('__insert__')) {
    return candidateId
  }

  if (pkColumn) {
    const pkValue = row[pkColumn]
    if (pkValue != null && pkValue !== '') {
      return `${tableName ?? 'tbl'}-${String(pkValue)}`
    }
  }
  return `${tableName ?? 'tbl'}-${index}`
}

/**
 * Generate appropriate default value for a column based on its SQL data type.
 * Matches the type handling in validateCellValue.
 */
export function getDefaultValueForType(dataType: string | undefined): unknown {
  if (!dataType) return ''

  const dt = dataType.toUpperCase()

  // Boolean types
  if (dt === 'BOOLEAN' || dt === 'BOOL') {
    return false // Default to false for boolean columns
  }

  // Numeric types
  if (
    dt.includes('INT') ||
    dt === 'SERIAL' ||
    dt === 'BIGSERIAL' ||
    dt === 'SMALLINT' ||
    dt === 'BIGINT'
  ) {
    return 0
  }

  if (
    dt === 'FLOAT' ||
    dt === 'REAL' ||
    dt === 'DOUBLE' ||
    dt === 'NUMERIC' ||
    dt === 'DECIMAL'
  ) {
    return 0
  }

  // UUID - empty string is valid, will be generated by DB on insert if DEFAULT is set
  if (dt === 'UUID') {
    return ''
  }

  // Date/Time types
  if (
    dt.includes('DATE') ||
    dt.includes('TIME') ||
    dt.includes('TIMESTAMP') ||
    dt === 'DATETIME'
  ) {
    return null // Let DB handle with DEFAULT CURRENT_TIMESTAMP or similar
  }

  // JSON types
  if (dt === 'JSON' || dt === 'JSONB') {
    return null
  }

  // Default: empty string for text and other types
  return ''
}
