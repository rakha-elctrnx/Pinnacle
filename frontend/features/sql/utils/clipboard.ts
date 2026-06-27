/**
 * Clipboard utilities for table grid copy/paste operations.
 *
 * Supports:
 * - TSV copy (Excel-compatible, tab-separated)
 * - CSV copy with proper quoting
 * - SQL statement generation (INSERT / UPDATE / DELETE)
 * - TSV parse for paste
 */

// ── Types ──────────────────────────────────────────────────────────

interface ColumnInfo {
  name: string
  dataType?: string
  isPrimaryKey?: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Escape a CSV field (quote if contains comma, quote, or newline) */
function escapeCSV(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Format a value for SQL output (string-wrapped, null-aware) */
function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  // Escape single quotes by doubling them
  return `'${String(value).replace(/'/g, "''")}'`
}

/** Guess the primary key column from column metadata */
function findPrimaryKey(columns: ColumnInfo[]): string | undefined {
  return columns.find((c) => c.isPrimaryKey)?.name
}

// ── Copy formatters ────────────────────────────────────────────────

/**
 * Build a TSV string from a selection of cells.
 * Rows → tab-separated columns, newline-separated rows.
 */
export function formatTSV(
  rows: Record<string, unknown>[],
  columns: string[],
): string {
  return rows
    .map((row) => columns.map((col) => {
      const val = row[col]
      if (val === null || val === undefined) return ''
      const str = String(val)
      // Escape tabs and newlines inside values
      return str.replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, '')
    }).join('\t'))
    .join('\n')
}

/**
 * Build a TSV string with a header row.
 */
export function formatTSVWithHeaders(
  rows: Record<string, unknown>[],
  columns: string[],
): string {
  return [columns.join('\t'), formatTSV(rows, columns)].join('\n')
}

/**
 * Build a CSV string with proper quoting.
 */
export function formatCSV(
  rows: Record<string, unknown>[],
  columns: string[],
): string {
  return rows
    .map((row) => columns.map((col) => escapeCSV(row[col])).join(','))
    .join('\n')
}

/**
 * Build a CSV string with header row.
 */
export function formatCSVWithHeaders(
  rows: Record<string, unknown>[],
  columns: string[],
): string {
  return [columns.join(','), formatCSV(rows, columns)].join('\n')
}

/**
 * Generate INSERT statements for the given rows.
 */
export function generateInsertSQL(
  rows: Record<string, unknown>[],
  columns: string[],
  tableName: string,
): string {
  if (rows.length === 0 || columns.length === 0) return ''

  const colList = columns.map((c) => `"${c}"`).join(', ')
  const values = rows
    .map((row) => `  (${columns.map((col) => sqlValue(row[col])).join(', ')})`)
    .join(',\n')

  return `INSERT INTO "${tableName}" (${colList})\nVALUES\n${values};`
}

/**
 * Generate UPDATE statements for the given rows.
 * Requires a primary key column to identify rows.
 */
export function generateUpdateSQL(
  rows: Record<string, unknown>[],
  columns: string[],
  tableName: string,
  columnInfo: ColumnInfo[],
): string {
  const pkColumn = findPrimaryKey(columnInfo)
  if (!pkColumn) return '-- No primary key found — cannot generate UPDATE statements'

  return rows
    .map((row) => {
      const pkValue = sqlValue(row[pkColumn])
      const setClauses = columns
        .filter((col) => col !== pkColumn)
        .map((col) => `  "${col}" = ${sqlValue(row[col])}`)
        .join(',\n')
      return `UPDATE "${tableName}"\nSET\n${setClauses}\nWHERE "${pkColumn}" = ${pkValue};`
    })
    .join('\n\n')
}

/**
 * Generate DELETE statements for the given rows.
 */
export function generateDeleteSQL(
  rows: Record<string, unknown>[],
  columns: ColumnInfo[],
  tableName: string,
): string {
  const pkColumn = findPrimaryKey(columns)
  if (!pkColumn) return '-- No primary key found — cannot generate DELETE statements'

  return rows
    .map((row) => {
      const pkValue = sqlValue(row[pkColumn])
      return `DELETE FROM "${tableName}"\nWHERE "${pkColumn}" = ${pkValue};`
    })
    .join('\n\n')
}

/**
 * Generate a complete SQL script for review:
 * INSERT for new rows, UPDATE for changed rows, DELETE for removed rows.
 * Simplified version for the "Generate SQL" modal — uses current display data.
 */
export function generateReviewSQL(
  rows: Record<string, unknown>[],
  columns: string[],
  tableName: string,
  columnInfo: ColumnInfo[],
  mode: 'insert' | 'update' | 'delete' | 'all' = 'all',
): string {
  const parts: string[] = []

  if (mode === 'insert' || mode === 'all') {
    parts.push('-- === INSERT ===')
    parts.push(generateInsertSQL(rows, columns, tableName))
    parts.push('')
  }

  if (mode === 'update' || mode === 'all') {
    parts.push('-- === UPDATE ===')
    parts.push(generateUpdateSQL(rows, columns, tableName, columnInfo))
    parts.push('')
  }

  if (mode === 'delete' || mode === 'all') {
    parts.push('-- === DELETE ===')
    parts.push(generateDeleteSQL(rows, columnInfo, tableName))
  }

  return parts.join('\n')
}

// ── Paste parsing ──────────────────────────────────────────────────

export interface ParsedPaste {
  /** Parsed rows as arrays of strings (TSV parsed) */
  rows: string[][]
  /** Number of columns detected */
  columnCount: number
}

/**
 * Parse TSV text from clipboard into rows of cells.
 * Handles both tab-separated and comma-separated (basic) formats.
 */
export function parseTSV(text: string): ParsedPaste {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) return { rows: [], columnCount: 0 }

  // Detect delimiter: prefer tab if any line has a tab, else comma
  const hasTab = lines.some((line) => line.includes('\t'))
  const delimiter = hasTab ? '\t' : ','

  const rows = lines.map((line) => {
    // Basic CSV-aware splitting for comma mode
    if (delimiter === ',') {
      return parseCSVLine(line)
    }
    return line.split('\t')
  })

  const columnCount = Math.max(...rows.map((r) => r.length), 0)

  return { rows, columnCount }
}

/** Simple CSV line parser (handles quoted fields) */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i++ // skip escaped quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)

  return result.map((cell) => cell.trim())
}

/**
 * Map parsed paste cells to a record using target column names.
 * Extra cells are dropped; missing cells become empty strings.
 */
export function mapPasteToColumns(
  pasteRows: string[][],
  targetColumns: string[],
): Record<string, string>[] {
  return pasteRows.map((row) => {
    const record: Record<string, string> = {}
    targetColumns.forEach((col, i) => {
      record[col] = i < row.length ? row[i] : ''
    })
    return record
  })
}

// ── Clipboard API helpers ──────────────────────────────────────────

/** Copy text to clipboard with fallback */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for older browsers / restricted contexts
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    try {
      document.execCommand('copy')
      return true
    } catch {
      return false
    } finally {
      document.body.removeChild(textarea)
    }
  }
}

/** Read text from clipboard */
export async function readFromClipboard(): Promise<string> {
  try {
    return await navigator.clipboard.readText()
  } catch {
    return ''
  }
}
