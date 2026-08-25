/**
 * Clipboard utilities for table grid copy/paste operations.
 *
 * Supports:
 * - TSV copy (Excel-compatible, tab-separated)
 * - CSV copy with proper quoting
 * - SQL statement generation (INSERT / UPDATE / DELETE), dialect-aware quoting
 * - Character-level delimited-text parse for lossless paste
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
  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Format a value for SQL output (string-wrapped, null-aware) */
function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  // Arrays/objects serialize as JSON before quote escaping so JSON/JSONB
  // columns round-trip instead of rendering "[object Object]".
  if (typeof value === 'object') {
    let json: string
    try {
      json = JSON.stringify(value)
    } catch {
      json = String(value)
    }
    return `'${json.replace(/'/g, "''")}'`
  }
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
    .map((row) =>
      columns
        .map((col) => {
          const val = row[col]
          if (val === null || val === undefined) return ''
          const str = String(val)
          // Escape tabs and newlines inside values
          return str.replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, '')
        })
        .join('\t'),
    )
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
 * Build a JSON string for export.
 */
export function formatJSON(
  rows: Record<string, unknown>[],
  columns: string[],
  pretty = true,
): string {
  const filtered = rows.map((row) => {
    const filteredRow: Record<string, unknown> = {}
    columns.forEach((col) => {
      filteredRow[col] = row[col]
    })
    return filteredRow
  })
  return pretty ? JSON.stringify(filtered, null, 2) : JSON.stringify(filtered)
}

/** Quote an SQL identifier for the given dialect (backticks for MySQL). */
function quoteIdentifier(
  identifier: string,
  dbType: 'postgresql' | 'mysql' | 'sqlite',
): string {
  if (dbType === 'mysql') return `\`${identifier.replace(/`/g, '``')}\``
  return `"${identifier.replace(/"/g, '""')}"`
}

/**
 * Generate INSERT statements for the given rows.
 */
export function generateInsertSQL(
  rows: Record<string, unknown>[],
  columns: string[],
  tableName: string,
  dbType: 'postgresql' | 'mysql' | 'sqlite' = 'postgresql',
): string {
  if (rows.length === 0 || columns.length === 0) return ''

  const colList = columns
    .map((c) => quoteIdentifier(c, dbType))
    .join(', ')
  const values = rows
    .map((row) => `  (${columns.map((col) => sqlValue(row[col])).join(', ')})`)
    .join(',\n')

  return `INSERT INTO ${quoteIdentifier(tableName, dbType)} (${colList})\nVALUES\n${values};`
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
  dbType: 'postgresql' | 'mysql' | 'sqlite' = 'postgresql',
): string {
  const pkColumn = findPrimaryKey(columnInfo)
  if (!pkColumn)
    return '-- No primary key found — cannot generate UPDATE statements'

  return rows
    .map((row) => {
      const pkValue = sqlValue(row[pkColumn])
      const setClauses = columns
        .filter((col) => col !== pkColumn)
        .map(
          (col) =>
            `  ${quoteIdentifier(col, dbType)} = ${sqlValue(row[col])}`,
        )
        .join(',\n')
      return `UPDATE ${quoteIdentifier(tableName, dbType)}\nSET\n${setClauses}\nWHERE ${quoteIdentifier(pkColumn, dbType)} = ${pkValue};`
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
  dbType: 'postgresql' | 'mysql' | 'sqlite' = 'postgresql',
): string {
  const pkColumn = findPrimaryKey(columns)
  if (!pkColumn)
    return '-- No primary key found — cannot generate DELETE statements'

  return rows
    .map((row) => {
      const pkValue = sqlValue(row[pkColumn])
      return `DELETE FROM ${quoteIdentifier(tableName, dbType)}\nWHERE ${quoteIdentifier(pkColumn, dbType)} = ${pkValue};`
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
  dbType: 'postgresql' | 'mysql' | 'sqlite' = 'postgresql',
): string {
  const parts: string[] = []

  if (mode === 'insert' || mode === 'all') {
    parts.push('-- === INSERT ===')
    parts.push(generateInsertSQL(rows, columns, tableName, dbType))
    parts.push('')
  }

  if (mode === 'update' || mode === 'all') {
    parts.push('-- === UPDATE ===')
    parts.push(generateUpdateSQL(rows, columns, tableName, columnInfo, dbType))
    parts.push('')
  }

  if (mode === 'delete' || mode === 'all') {
    parts.push('-- === DELETE ===')
    parts.push(generateDeleteSQL(rows, columnInfo, tableName, dbType))
  }

  return parts.join('\n')
}

// ── Paste parsing ──────────────────────────────────────────────────

export interface ParsedPaste {
  /** Parsed rows as arrays of cell strings */
  rows: string[][]
  /** Number of columns detected (widest row) */
  columnCount: number
}

/**
 * Character-level delimited-text parser. Auto-detects tab vs comma
 * (tab wins when the text contains one outside quotes), supports doubled
 * quote escapes, CRLF/LF line endings, and quoted embedded delimiters and
 * newlines — without trimming meaningful whitespace from cells.
 *
 * Blank records inside quoted fields are preserved; only a single trailing
 * empty record produced by a terminal newline is ignored.
 */
export function parseDelimitedText(text: string): ParsedPaste {
  const rows: string[][] = []
  let row: string[] = []
  let current = ''
  let inQuotes = false
  let sawAnyChar = false

  // Detect delimiter on the first pass: any tab outside quotes → tab.
  let delimiter = ','
  {
    let scanningQuotes = false
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === '"') {
        if (
          scanningQuotes &&
          text[i + 1] === '"' &&
          !text.includes('\t', i + 2)
        ) {
          // Doubled quote inside quotes — skip both.
          i++
        } else {
          scanningQuotes = !scanningQuotes
        }
        continue
      }
      if (!scanningQuotes && ch === '\t') {
        delimiter = '\t'
        break
      }
    }
  }

  const pushCell = () => {
    row.push(current)
    current = ''
  }
  const pushRecord = () => {
    pushCell()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    sawAnyChar = true
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          current += '"'
          i++ // skip escaped quote
        } else {
          inQuotes = false // closing quote — not appended
        }
      } else {
        current += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }
    if (char === delimiter) {
      pushCell()
      continue
    }
    if (char === '\n' || char === '\r') {
      // Treat CRLF as one record terminator.
      if (char === '\r' && text[i + 1] === '\n') i++
      pushRecord()
      continue
    }
    current += char
  }

  // Flush the final record only when there is trailing content after the
  // last terminator — this drops exactly one terminal-newline empty record.
  if (!sawAnyChar) return { rows: [], columnCount: 0 }
  if (current !== '' || row.length > 0) pushRecord()

  const columnCount = Math.max(...rows.map((r) => r.length), 0)
  return { rows, columnCount }
}

/**
 * Map parsed paste cells to partial records keyed by target column names.
 * Only cells physically present in each pasted row produce entries — no
 * synthesized empty strings for missing columns, so callers can distinguish
 * "cell not provided" from "cell cleared".
 */
export function mapPasteToColumns(
  pasteRows: string[][],
  targetColumns: string[],
): Record<string, string>[] {
  return pasteRows.map((row) => {
    const record: Record<string, string> = {}
    const width = Math.min(row.length, targetColumns.length)
    for (let i = 0; i < width; i++) {
      record[targetColumns[i]!] = row[i]!
    }
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
