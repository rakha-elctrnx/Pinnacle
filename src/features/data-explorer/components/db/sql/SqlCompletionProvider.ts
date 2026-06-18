/**
 * sqlCompletionProvider.ts
 *
 * Drop-in replacement for the inline completion logic in QueryEditor.
 * Registers a SQL completion provider + hover provider on a Monaco instance.
 *
 * Usage (in your handleBeforeMount callback):
 *   import { registerSqlProviders } from './sqlCompletionProvider'
 *   const handleBeforeMount: BeforeMount = (monacoInstance) => {
 *     registerSqlProviders(monacoInstance, tablesRef)
 *   }
 */

import type * as Monaco from 'monaco-editor'
import type { SchemaColumn } from '../../../../../types/domain'

// ─── SQL keyword groups ────────────────────────────────────────────────────────

const DML_KEYWORDS = [
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'TRUNCATE', 'REPLACE',
]

const DDL_KEYWORDS = [
  'CREATE', 'ALTER', 'DROP', 'RENAME', 'COMMENT', 'TRUNCATE',
]

const CLAUSE_KEYWORDS = [
  'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN',
  'FULL JOIN', 'FULL OUTER JOIN', 'CROSS JOIN', 'ON', 'GROUP BY',
  'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'UNION ALL',
  'INTERSECT', 'EXCEPT', 'INTO', 'VALUES', 'SET',
]

const MISC_KEYWORDS = [
  'AS', 'DISTINCT', 'ALL', 'AND', 'OR', 'NOT', 'IN', 'EXISTS',
  'BETWEEN', 'LIKE', 'ILIKE', 'IS', 'IS NULL', 'IS NOT NULL',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'WITH', 'RECURSIVE',
  'TABLE', 'VIEW', 'INDEX', 'SCHEMA', 'DATABASE', 'IF',
  'IF NOT EXISTS', 'IF EXISTS', 'DEFAULT', 'NULL', 'TRUE', 'FALSE',
  'RETURNING', 'OVER', 'PARTITION BY', 'ROWS', 'RANGE',
  'UNBOUNDED PRECEDING', 'CURRENT ROW', 'FOLLOWING',
  'PRIMARY KEY', 'FOREIGN KEY', 'REFERENCES', 'UNIQUE', 'NOT NULL',
  'CHECK', 'CONSTRAINT', 'CASCADE', 'RESTRICT', 'NO ACTION', 'ASC', 'DESC',
]

// ─── SQL aggregate / window functions ─────────────────────────────────────────

interface FunctionDef {
  name: string
  signature: string
  doc: string
  insertText: string
}

const SQL_FUNCTIONS: FunctionDef[] = [
  // Aggregates
  { name: 'COUNT', signature: 'COUNT(expr)', doc: 'Returns the number of rows matching the expression.', insertText: 'COUNT(${1:*})' },
  { name: 'COUNT DISTINCT', signature: 'COUNT(DISTINCT expr)', doc: 'Returns the count of distinct non-null values.', insertText: 'COUNT(DISTINCT ${1:column})' },
  { name: 'SUM', signature: 'SUM(expr)', doc: 'Returns the sum of all non-null values.', insertText: 'SUM(${1:column})' },
  { name: 'AVG', signature: 'AVG(expr)', doc: 'Returns the average (mean) of all non-null values.', insertText: 'AVG(${1:column})' },
  { name: 'MIN', signature: 'MIN(expr)', doc: 'Returns the minimum value.', insertText: 'MIN(${1:column})' },
  { name: 'MAX', signature: 'MAX(expr)', doc: 'Returns the maximum value.', insertText: 'MAX(${1:column})' },
  { name: 'GROUP_CONCAT', signature: 'GROUP_CONCAT(expr)', doc: 'Concatenates values from a group into a single string.', insertText: 'GROUP_CONCAT(${1:column})' },
  { name: 'STRING_AGG', signature: 'STRING_AGG(expr, delimiter)', doc: 'Concatenates values with a delimiter (PostgreSQL/SQL Server).', insertText: 'STRING_AGG(${1:column}, ${2:\', \'})' },
  { name: 'ARRAY_AGG', signature: 'ARRAY_AGG(expr)', doc: 'Collects values into an array (PostgreSQL).', insertText: 'ARRAY_AGG(${1:column})' },
  { name: 'JSON_AGG', signature: 'JSON_AGG(expr)', doc: 'Collects values into a JSON array (PostgreSQL).', insertText: 'JSON_AGG(${1:column})' },
  // Window functions
  { name: 'ROW_NUMBER', signature: 'ROW_NUMBER() OVER (...)', doc: 'Assigns a unique sequential integer to each row within a partition.', insertText: 'ROW_NUMBER() OVER (${1:PARTITION BY column ORDER BY column})' },
  { name: 'RANK', signature: 'RANK() OVER (...)', doc: 'Assigns a rank with gaps for tied rows.', insertText: 'RANK() OVER (${1:PARTITION BY column ORDER BY column})' },
  { name: 'DENSE_RANK', signature: 'DENSE_RANK() OVER (...)', doc: 'Assigns a rank without gaps for tied rows.', insertText: 'DENSE_RANK() OVER (${1:PARTITION BY column ORDER BY column})' },
  { name: 'NTILE', signature: 'NTILE(n) OVER (...)', doc: 'Divides rows into n roughly equal groups.', insertText: 'NTILE(${1:4}) OVER (${2:ORDER BY column})' },
  { name: 'LAG', signature: 'LAG(expr [, offset [, default]]) OVER (...)', doc: 'Returns the value from a preceding row within the partition.', insertText: 'LAG(${1:column}, ${2:1}) OVER (${3:ORDER BY column})' },
  { name: 'LEAD', signature: 'LEAD(expr [, offset [, default]]) OVER (...)', doc: 'Returns the value from a following row within the partition.', insertText: 'LEAD(${1:column}, ${2:1}) OVER (${3:ORDER BY column})' },
  { name: 'FIRST_VALUE', signature: 'FIRST_VALUE(expr) OVER (...)', doc: 'Returns the first value in an ordered set.', insertText: 'FIRST_VALUE(${1:column}) OVER (${2:ORDER BY column})' },
  { name: 'LAST_VALUE', signature: 'LAST_VALUE(expr) OVER (...)', doc: 'Returns the last value in an ordered set.', insertText: 'LAST_VALUE(${1:column}) OVER (${2:ORDER BY column})' },
  // String functions
  { name: 'COALESCE', signature: 'COALESCE(expr1, expr2, ...)', doc: 'Returns the first non-null argument.', insertText: 'COALESCE(${1:column}, ${2:default_value})' },
  { name: 'NULLIF', signature: 'NULLIF(expr1, expr2)', doc: 'Returns NULL if both arguments are equal, otherwise returns the first.', insertText: 'NULLIF(${1:column}, ${2:value})' },
  { name: 'CAST', signature: 'CAST(expr AS type)', doc: 'Converts a value to a specified data type.', insertText: 'CAST(${1:column} AS ${2:VARCHAR})' },
  { name: 'CONVERT', signature: 'CONVERT(type, expr)', doc: 'Converts a value to a specified data type.', insertText: 'CONVERT(${1:VARCHAR}, ${2:column})' },
  { name: 'CONCAT', signature: 'CONCAT(str1, str2, ...)', doc: 'Concatenates two or more strings.', insertText: 'CONCAT(${1:column1}, ${2:column2})' },
  { name: 'SUBSTRING', signature: 'SUBSTRING(str, start [, length])', doc: 'Extracts a substring from a string.', insertText: 'SUBSTRING(${1:column}, ${2:1}, ${3:length})' },
  { name: 'TRIM', signature: 'TRIM([LEADING|TRAILING|BOTH] str)', doc: 'Removes leading/trailing spaces (or specified characters).', insertText: 'TRIM(${1:column})' },
  { name: 'UPPER', signature: 'UPPER(str)', doc: 'Converts a string to uppercase.', insertText: 'UPPER(${1:column})' },
  { name: 'LOWER', signature: 'LOWER(str)', doc: 'Converts a string to lowercase.', insertText: 'LOWER(${1:column})' },
  { name: 'LENGTH', signature: 'LENGTH(str)', doc: 'Returns the number of characters in a string.', insertText: 'LENGTH(${1:column})' },
  { name: 'REPLACE', signature: 'REPLACE(str, from_str, to_str)', doc: 'Replaces occurrences of a substring within a string.', insertText: 'REPLACE(${1:column}, ${2:\'old\'}, ${3:\'new\'})' },
  { name: 'REGEXP_REPLACE', signature: 'REGEXP_REPLACE(str, pattern, replacement)', doc: 'Replaces substrings matching a regular expression.', insertText: 'REGEXP_REPLACE(${1:column}, ${2:\'pattern\'}, ${3:\'replacement\'})' },
  { name: 'SPLIT_PART', signature: 'SPLIT_PART(str, delimiter, n)', doc: 'Splits a string on a delimiter and returns the nth part (PostgreSQL).', insertText: 'SPLIT_PART(${1:column}, ${2:\',\'}, ${3:1})' },
  { name: 'POSITION', signature: 'POSITION(substr IN str)', doc: 'Returns the position of a substring in a string.', insertText: 'POSITION(${1:\'substr\'} IN ${2:column})' },
  // Date/time functions
  { name: 'NOW', signature: 'NOW()', doc: 'Returns the current date and time.', insertText: 'NOW()' },
  { name: 'CURRENT_TIMESTAMP', signature: 'CURRENT_TIMESTAMP', doc: 'Returns the current date and time.', insertText: 'CURRENT_TIMESTAMP' },
  { name: 'CURRENT_DATE', signature: 'CURRENT_DATE', doc: 'Returns the current date.', insertText: 'CURRENT_DATE' },
  { name: 'DATE_TRUNC', signature: 'DATE_TRUNC(field, source)', doc: 'Truncates a timestamp to the specified precision (PostgreSQL).', insertText: 'DATE_TRUNC(${1:\'month\'}, ${2:column})' },
  { name: 'DATE_PART', signature: 'DATE_PART(field, source)', doc: 'Extracts a subfield from a date/time value (PostgreSQL).', insertText: 'DATE_PART(${1:\'year\'}, ${2:column})' },
  { name: 'EXTRACT', signature: 'EXTRACT(field FROM source)', doc: 'Extracts a part of a date/time value.', insertText: 'EXTRACT(${1:YEAR} FROM ${2:column})' },
  { name: 'DATEDIFF', signature: 'DATEDIFF(unit, start_date, end_date)', doc: 'Returns the difference between two dates.', insertText: 'DATEDIFF(${1:DAY}, ${2:start_date}, ${3:end_date})' },
  { name: 'DATEADD', signature: 'DATEADD(unit, number, date)', doc: 'Adds an interval to a date (SQL Server / Snowflake).', insertText: 'DATEADD(${1:DAY}, ${2:7}, ${3:column})' },
  { name: 'TO_DATE', signature: 'TO_DATE(str, format)', doc: 'Converts a string to a date value.', insertText: 'TO_DATE(${1:column}, ${2:\'YYYY-MM-DD\'})' },
  { name: 'TO_CHAR', signature: 'TO_CHAR(expr, format)', doc: 'Converts a value to a formatted string (PostgreSQL / Oracle).', insertText: 'TO_CHAR(${1:column}, ${2:\'YYYY-MM-DD\'})' },
  // Math functions
  { name: 'ROUND', signature: 'ROUND(expr [, decimals])', doc: 'Rounds a number to a specified number of decimal places.', insertText: 'ROUND(${1:column}, ${2:2})' },
  { name: 'FLOOR', signature: 'FLOOR(expr)', doc: 'Returns the largest integer less than or equal to the argument.', insertText: 'FLOOR(${1:column})' },
  { name: 'CEIL', signature: 'CEIL(expr)', doc: 'Returns the smallest integer greater than or equal to the argument.', insertText: 'CEIL(${1:column})' },
  { name: 'ABS', signature: 'ABS(expr)', doc: 'Returns the absolute value.', insertText: 'ABS(${1:column})' },
  { name: 'MOD', signature: 'MOD(dividend, divisor)', doc: 'Returns the remainder of a division.', insertText: 'MOD(${1:column}, ${2:2})' },
  { name: 'POWER', signature: 'POWER(base, exponent)', doc: 'Returns base raised to the power of exponent.', insertText: 'POWER(${1:column}, ${2:2})' },
  { name: 'SQRT', signature: 'SQRT(expr)', doc: 'Returns the square root.', insertText: 'SQRT(${1:column})' },
  // Conditional
  { name: 'IF', signature: 'IF(condition, true_val, false_val)', doc: 'Returns one of two values based on a condition (MySQL / BigQuery).', insertText: 'IF(${1:condition}, ${2:true_value}, ${3:false_value})' },
  { name: 'IFF', signature: 'IFF(condition, true_val, false_val)', doc: 'Returns one of two values based on a condition (Snowflake).', insertText: 'IFF(${1:condition}, ${2:true_value}, ${3:false_value})' },
  { name: 'IFNULL', signature: 'IFNULL(expr, alt)', doc: 'Returns alt if expr is NULL, otherwise expr (MySQL).', insertText: 'IFNULL(${1:column}, ${2:default_value})' },
  { name: 'NVL', signature: 'NVL(expr, alt)', doc: 'Returns alt if expr is NULL (Oracle / Snowflake).', insertText: 'NVL(${1:column}, ${2:default_value})' },
  // JSON
  { name: 'JSON_VALUE', signature: 'JSON_VALUE(json, path)', doc: 'Extracts a scalar value from a JSON string.', insertText: 'JSON_VALUE(${1:column}, ${2:\'$.key\'})' },
  { name: 'JSON_EXTRACT', signature: 'JSON_EXTRACT(json, path)', doc: 'Extracts a value from a JSON document (MySQL).', insertText: 'JSON_EXTRACT(${1:column}, ${2:\'$.key\'})' },
  { name: 'PARSE_JSON', signature: 'PARSE_JSON(str)', doc: 'Parses a JSON string into a semi-structured value (Snowflake).', insertText: 'PARSE_JSON(${1:column})' },
]

// ─── Snippet templates ─────────────────────────────────────────────────────────

interface SnippetDef {
  label: string
  insertText: string
  doc: string
}

const SNIPPETS: SnippetDef[] = [
  {
    label: 'SELECT * FROM table',
    insertText: 'SELECT *\nFROM ${1:table_name}\nWHERE ${2:1=1}\nLIMIT ${3:100}',
    doc: 'Basic SELECT query with a WHERE clause and LIMIT.',
  },
  {
    label: 'SELECT columns FROM table',
    insertText: 'SELECT\n  ${1:column1},\n  ${2:column2}\nFROM ${3:table_name}\nWHERE ${4:condition}',
    doc: 'SELECT specific columns from a table.',
  },
  {
    label: 'SELECT with JOIN',
    insertText: [
      'SELECT',
      '  ${1:a}.${2:column1},',
      '  ${3:b}.${4:column2}',
      'FROM ${5:table1} ${1:a}',
      'JOIN ${6:table2} ${3:b} ON ${1:a}.${7:id} = ${3:b}.${8:foreign_id}',
      'WHERE ${9:1=1}',
    ].join('\n'),
    doc: 'SELECT with an INNER JOIN.',
  },
  {
    label: 'SELECT with LEFT JOIN',
    insertText: [
      'SELECT',
      '  ${1:a}.${2:column1},',
      '  ${3:b}.${4:column2}',
      'FROM ${5:table1} ${1:a}',
      'LEFT JOIN ${6:table2} ${3:b} ON ${1:a}.${7:id} = ${3:b}.${8:foreign_id}',
    ].join('\n'),
    doc: 'SELECT with a LEFT JOIN.',
  },
  {
    label: 'SELECT with GROUP BY',
    insertText: [
      'SELECT',
      '  ${1:column},',
      '  COUNT(*) AS ${2:count}',
      'FROM ${3:table_name}',
      'GROUP BY ${1:column}',
      'ORDER BY ${2:count} DESC',
    ].join('\n'),
    doc: 'SELECT with GROUP BY and COUNT.',
  },
  {
    label: 'SELECT with CASE',
    insertText: [
      'SELECT',
      '  ${1:column},',
      '  CASE',
      '    WHEN ${2:condition1} THEN ${3:\'value1\'}',
      '    WHEN ${4:condition2} THEN ${5:\'value2\'}',
      '    ELSE ${6:\'other\'}',
      '  END AS ${7:alias}',
      'FROM ${8:table_name}',
    ].join('\n'),
    doc: 'SELECT with a CASE expression.',
  },
  {
    label: 'CTE (WITH clause)',
    insertText: [
      'WITH ${1:cte_name} AS (',
      '  SELECT ${2:*}',
      '  FROM ${3:table_name}',
      '  WHERE ${4:condition}',
      ')',
      'SELECT *',
      'FROM ${1:cte_name}',
    ].join('\n'),
    doc: 'Common Table Expression (CTE).',
  },
  {
    label: 'INSERT INTO ... VALUES',
    insertText: 'INSERT INTO ${1:table_name} (${2:column1}, ${3:column2})\nVALUES (${4:value1}, ${5:value2})',
    doc: 'Insert a single row into a table.',
  },
  {
    label: 'INSERT INTO ... SELECT',
    insertText: 'INSERT INTO ${1:target_table} (${2:column1}, ${3:column2})\nSELECT ${2:column1}, ${3:column2}\nFROM ${4:source_table}\nWHERE ${5:condition}',
    doc: 'Insert rows from a SELECT query.',
  },
  {
    label: 'UPDATE ... SET',
    insertText: 'UPDATE ${1:table_name}\nSET ${2:column1} = ${3:value1}\nWHERE ${4:condition}',
    doc: 'Update rows in a table.',
  },
  {
    label: 'DELETE FROM',
    insertText: 'DELETE FROM ${1:table_name}\nWHERE ${2:condition}',
    doc: 'Delete rows from a table.',
  },
  {
    label: 'CREATE TABLE',
    insertText: [
      'CREATE TABLE ${1:table_name} (',
      '  id          BIGINT       NOT NULL AUTO_INCREMENT,',
      '  ${2:column1}  ${3:VARCHAR(255)} NOT NULL,',
      '  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,',
      '  PRIMARY KEY (id)',
      ')',
    ].join('\n'),
    doc: 'Create a new table.',
  },
  {
    label: 'Window function template',
    insertText: [
      'SELECT',
      '  ${1:column},',
      '  ROW_NUMBER() OVER (PARTITION BY ${2:column} ORDER BY ${3:column}) AS ${4:row_num}',
      'FROM ${5:table_name}',
    ].join('\n'),
    doc: 'Template for a window function.',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse every table reference (FROM / JOIN) in the full query text
 * and return a map of alias → simple table name.
 */
function parseAliases(text: string): Map<string, string> {
  const aliasToTable = new Map<string, string>()
  const tableRefRegex = /\b(?:FROM|JOIN)\s+([\w.]+)(?:\s+(?:AS\s+)?(\w+))?/gi
  let match: RegExpExecArray | null
  while ((match = tableRefRegex.exec(text)) !== null) {
    const rawTable = match[1]
    if (rawTable.startsWith('(')) continue
    const simpleTable = rawTable.split('.').pop() ?? rawTable
    const alias = match[2] ?? simpleTable
    aliasToTable.set(alias, simpleTable)
    // always register the simple name as an alias of itself too
    if (alias !== simpleTable) aliasToTable.set(simpleTable, simpleTable)
  }
  return aliasToTable
}

/**
 * Derive a short alias from a table name.
 *
 * Rules (applied in order):
 *  1. snake_case / kebab-case  →  initials from each segment
 *     e.g. "user_profiles" → "up", "order_line_items" → "oli"
 *  2. camelCase / PascalCase   →  initials from each capital-led word
 *     e.g. "userProfiles" → "up", "OrderLineItems" → "oli"
 *  3. Single word              →  first two characters
 *     e.g. "users" → "us", "orders" → "or"
 *
 * All output is lowercase.
 */
function deriveBaseAlias(tableName: string): string {
  // snake_case or kebab-case: split on _ or -
  if (/_|-/.test(tableName)) {
    const parts = tableName.split(/[_-]+/).filter(Boolean)
    return parts.map((p) => p[0]).join('').toLowerCase()
  }

  // camelCase / PascalCase: collect positions of uppercase letters
  const upperPositions = [...tableName].reduce<number[]>((acc, ch, i) => {
    if (ch >= 'A' && ch <= 'Z') acc.push(i)
    return acc
  }, [])

  if (upperPositions.length > 1 || (upperPositions.length === 1 && upperPositions[0] === 0 && tableName.length > 2)) {
    // PascalCase or camelCase with multiple words
    const initials = upperPositions.map((i) => tableName[i]).join('').toLowerCase()
    if (initials.length >= 2) return initials
  }

  // Single word fallback: first two chars
  return tableName.slice(0, 2).toLowerCase()
}

/**
 * Build a conflict-free alias map for every table name in the schema.
 *
 * Tables are processed in **alphabetical order** so the collision counter is
 * deterministic: if "user_photos" and "user_profiles" both want "up", the one
 * that comes first alphabetically keeps "up" and the later one gets "up2".
 *
 * Returns Map<tableName, alias>.
 */
function buildAliasMap(tableNames: string[]): Map<string, string> {
  const sorted = [...tableNames].sort()          // alphabetical for determinism
  const usedAliases = new Map<string, number>()  // base alias → usage count
  const aliasMap = new Map<string, string>()     // tableName → final alias

  for (const tableName of sorted) {
    const base = deriveBaseAlias(tableName)
    const count = usedAliases.get(base) ?? 0

    // First user of this alias gets the clean form; subsequent get a numeric suffix
    const alias = count === 0 ? base : `${base}${count + 1}`
    usedAliases.set(base, count + 1)
    aliasMap.set(tableName, alias)
  }

  return aliasMap
}

/**
 * Build a Monaco range for the current word being typed.
 */
function wordRange(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): Monaco.IRange {
  const word = model.getWordUntilPosition(position)
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Register enhanced SQL completion + hover providers on a Monaco instance.
 *
 * @param monacoInstance  The Monaco namespace object (from beforeMount callback)
 * @param tablesRef       A React ref holding { [tableName]: SchemaColumn[] }
 */
export function registerSqlProviders(
  monacoInstance: typeof Monaco,
  tablesRef: React.MutableRefObject<Record<string, SchemaColumn[]>>,
): void {
  const { CompletionItemKind, CompletionItemInsertTextRule } =
    monacoInstance.languages

  // ── Completion provider ────────────────────────────────────────────────────
  monacoInstance.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: [
      ' ', '.', '\n', '\t',
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
      'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
      'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    ],

    provideCompletionItems(
      model: Monaco.editor.ITextModel,
      position: Monaco.Position,
    ): Monaco.languages.CompletionList {
      const fullText = model.getValue()
      const textUntilPosition = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })
      const range = wordRange(model, position)
      const tables = tablesRef.current
      const aliasToTable = parseAliases(fullText)

      // Pre-compute conflict-free alias for every known table name
      const schemaAliasMap = buildAliasMap(Object.keys(tables))

      // ── 1. Dot context → column suggestions ─────────────────────────────
      const dotMatch = textUntilPosition.match(/(\w+)\.$/)
      if (dotMatch) {
        const prefix = dotMatch[1]
        const targetTable = aliasToTable.get(prefix) ?? prefix
        const cols = tables[targetTable]
        if (cols) {
          return {
            suggestions: cols.map((col) => ({
              label: col.columnName,
              kind: CompletionItemKind.Field,
              insertText: col.columnName,
              detail: col.dataType ?? '',
              documentation: {
                value: [
                  `**${targetTable}.${col.columnName}**`,
                  `Type: \`${col.dataType ?? 'unknown'}\``,
                  col.isNullable != null ? `Nullable: ${col.isNullable ? 'YES' : 'NO'}` : '',
                ].filter(Boolean).join('\n\n'),
              },
              sortText: `0_${col.columnName}`, // sort above keywords
              range,
            })),
          }
        }
        return { suggestions: [] }
      }

      const textBeforeWord = textUntilPosition.slice(0, (model.getWordUntilPosition(position).startColumn - 1))
      const trimmedBefore = textBeforeWord.trimEnd()

      // ── 2. Table context (after FROM / JOIN / INTO / UPDATE / TABLE) ─────
      const tableKeywordRe = /\b(FROM|JOIN|INTO|UPDATE|TABLE)\s*$/i
      if (tableKeywordRe.test(trimmedBefore)) {
        const tableSuggestions: Monaco.languages.CompletionItem[] =
          Object.keys(tables).map((tableName) => {
            const alias = schemaAliasMap.get(tableName) ?? deriveBaseAlias(tableName)
            const cols = tables[tableName] ?? []
            return {
              // Label shows "table_name  →  alias" so the user sees both at a glance
              label: {
                label: tableName,
                detail: `  →  ${alias}`,
                description: `${cols.length} col${cols.length !== 1 ? 's' : ''}`,
              },
              kind: CompletionItemKind.Class,
              // Insert "table_name alias" so the alias lands automatically
              insertText: `${tableName} ${alias}`,
              detail: `alias: ${alias}  ·  ${cols.length} columns`,
              documentation: {
                value: [
                  `**Table: \`${tableName}\`**`,
                  `Alias: \`${alias}\``,
                  '',
                  cols
                    .slice(0, 10)
                    .map((c) => `- \`${c.columnName}\` — ${c.dataType ?? '?'}`)
                    .join('\n'),
                  cols.length > 10 ? `… and ${cols.length - 10} more columns` : '',
                ].filter(Boolean).join('\n'),
              },
              sortText: `0_${tableName}`,
              range,
            }
          })
        return { suggestions: tableSuggestions }
      }

      // ── 3. Column context (after SELECT / WHERE / AND / OR / ON / SET / comma) ──
      const columnKeywordRe = /\b(SELECT|WHERE|AND|OR|ON|SET|HAVING|BY|RETURNING)\s*$/i
      const isAfterComma = /,\s*$/.test(textBeforeWord)
      if (columnKeywordRe.test(trimmedBefore) || isAfterComma) {
        const suggestions: Monaco.languages.CompletionItem[] = []

        // Columns from parsed table aliases
        aliasToTable.forEach((tableName, alias) => {
          const cols = tables[tableName]
          if (!cols) return
          cols.forEach((col) => {
            suggestions.push({
              label: `${alias}.${col.columnName}`,
              kind: CompletionItemKind.Field,
              insertText: `${alias}.${col.columnName}`,
              detail: col.dataType ?? '',
              documentation: {
                value: `**${tableName}.${col.columnName}**\nType: \`${col.dataType ?? 'unknown'}\``,
              },
              sortText: `0_${alias}_${col.columnName}`,
              range,
            })
          })
        })

        // Also add function suggestions in column context
        SQL_FUNCTIONS.forEach((fn) => {
          suggestions.push({
            label: fn.name,
            kind: CompletionItemKind.Function,
            insertText: fn.insertText,
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            detail: fn.signature,
            documentation: { value: fn.doc },
            sortText: `1_${fn.name}`,
            range,
          })
        })

        return { suggestions }
      }

      // ── 4. Global fallback: keywords + functions + snippets ───────────────
      const allSuggestions: Monaco.languages.CompletionItem[] = []

      // DML keywords — highest priority
      DML_KEYWORDS.forEach((kw, i) => {
        allSuggestions.push({
          label: kw,
          kind: CompletionItemKind.Keyword,
          insertText: kw + ' ',
          detail: 'DML keyword',
          sortText: `00_${String(i).padStart(3, '0')}`,
          range,
        })
      })

      // DDL keywords
      DDL_KEYWORDS.forEach((kw, i) => {
        allSuggestions.push({
          label: kw,
          kind: CompletionItemKind.Keyword,
          insertText: kw + ' ',
          detail: 'DDL keyword',
          sortText: `01_${String(i).padStart(3, '0')}`,
          range,
        })
      })

      // Clause keywords
      CLAUSE_KEYWORDS.forEach((kw, i) => {
        allSuggestions.push({
          label: kw,
          kind: CompletionItemKind.Keyword,
          insertText: kw + ' ',
          detail: 'Clause keyword',
          sortText: `02_${String(i).padStart(3, '0')}`,
          range,
        })
      })

      // Misc keywords
      MISC_KEYWORDS.forEach((kw, i) => {
        allSuggestions.push({
          label: kw,
          kind: CompletionItemKind.Keyword,
          insertText: kw + ' ',
          detail: 'SQL keyword',
          sortText: `03_${String(i).padStart(3, '0')}`,
          range,
        })
      })

      // Functions
      SQL_FUNCTIONS.forEach((fn, i) => {
        allSuggestions.push({
          label: fn.name,
          kind: CompletionItemKind.Function,
          insertText: fn.insertText,
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          detail: fn.signature,
          documentation: { value: fn.doc },
          sortText: `04_${String(i).padStart(3, '0')}`,
          range,
        })
      })

      // Snippets
      SNIPPETS.forEach((s, i) => {
        allSuggestions.push({
          label: s.label,
          kind: CompletionItemKind.Snippet,
          insertText: s.insertText,
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Snippet',
          documentation: { value: s.doc },
          sortText: `05_${String(i).padStart(3, '0')}`,
          range,
        })
      })

      // Tables always available as fallback (with alias)
      Object.keys(tables).forEach((tableName, i) => {
        const alias = schemaAliasMap.get(tableName) ?? deriveBaseAlias(tableName)
        allSuggestions.push({
          label: {
            label: tableName,
            detail: `  →  ${alias}`,
            description: 'Table',
          },
          kind: CompletionItemKind.Class,
          insertText: `${tableName} ${alias}`,
          detail: `alias: ${alias}`,
          sortText: `06_${String(i).padStart(3, '0')}`,
          range,
        })
      })

      return { suggestions: allSuggestions }
    },
  })

  // ── Hover provider ─────────────────────────────────────────────────────────
  monacoInstance.languages.registerHoverProvider('sql', {
    provideHover(
      model: Monaco.editor.ITextModel,
      position: Monaco.Position,
    ): Monaco.languages.Hover | null {
      const tables = tablesRef.current
      const word = model.getWordAtPosition(position)
      if (!word) return null

      const wordValue = word.word
      const wordRange: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      // Check if hovering over a table name
      if (tables[wordValue]) {
        const cols = tables[wordValue]
        return {
          range: wordRange,
          contents: [
            { value: `**Table: \`${wordValue}\`**` },
            {
              value: [
                `${cols.length} columns:`,
                ...cols.slice(0, 15).map(
                  (c) => `- \`${c.columnName}\` — ${c.dataType ?? '?'}${c.isNullable === false ? ' NOT NULL' : ''}`,
                ),
                cols.length > 15 ? `… and ${cols.length - 15} more` : '',
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
        }
      }

      // Check if hovering over a column (look for table.column patterns around cursor)
      const lineText = model.getLineContent(position.lineNumber)
      const colMatch = lineText.match(new RegExp(`(\\w+)\\.${wordValue}\\b`))
      if (colMatch) {
        const tableOrAlias = colMatch[1]
        const fullText = model.getValue()
        const aliasMap = parseAliases(fullText)
        const resolvedTable = aliasMap.get(tableOrAlias) ?? tableOrAlias
        const col = tables[resolvedTable]?.find((c) => c.columnName === wordValue)
        if (col) {
          return {
            range: wordRange,
            contents: [
              { value: `**Column: \`${resolvedTable}.${col.columnName}\`**` },
              {
                value: [
                  `Type: \`${col.dataType ?? 'unknown'}\``,
                  col.isNullable != null ? `Nullable: ${col.isNullable ? 'YES' : 'NO'}` : '',
                ]
                  .filter(Boolean)
                  .join('\n'),
              },
            ],
          }
        }
      }

      // Check if hovering over a known SQL function
      const fn = SQL_FUNCTIONS.find(
        (f) => f.name.toUpperCase() === wordValue.toUpperCase(),
      )
      if (fn) {
        return {
          range: wordRange,
          contents: [
            { value: `**\`${fn.signature}\`**` },
            { value: fn.doc },
          ],
        }
      }

      return null
    },
  })
}