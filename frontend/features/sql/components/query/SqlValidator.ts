/**
 * sqlValidator.ts
 *
 * Validates SQL queries and returns Monaco IMarkerData diagnostics
 * (red underlines). Runs entirely in the browser — no server round-trip.
 *
 * Architecture:
 *  1. Tokeniser  — splits the SQL into a flat list of typed tokens
 *  2. Statement splitter — breaks on semicolons into individual statements
 *  3. Validator  — runs a set of structural rules per statement and emits
 *                  markers that pinpoint the exact token that is wrong
 *
 * The validator intentionally does NOT try to be a full SQL parser. It catches
 * the common class of mistakes a developer makes while writing queries:
 *  - Unbalanced parentheses
 *  - Unmatched quotes / string literals
 *  - Missing required clause (e.g. SELECT with no FROM when table refs exist)
 *  - Clause ordering violations (WHERE before FROM, HAVING before GROUP BY, …)
 *  - Empty statement (just whitespace / semicolons)
 *  - Unknown top-level keyword in statement position
 *  - Trailing comma before FROM / GROUP BY / ORDER BY / closing paren
 *  - AND / OR / NOT at start of statement (usually a missing WHERE)
 *  - LIMIT / OFFSET without a preceding SELECT
 *  - Duplicate clauses (two WHERE clauses, two FROM clauses, …)
 */

import type * as Monaco from 'monaco-editor';

// ─── Token types ──────────────────────────────────────────────────────────────

type TokenType =
  | 'KEYWORD'
  | 'IDENTIFIER'
  | 'NUMBER'
  | 'STRING'
  | 'OPERATOR'
  | 'PUNCTUATION'  // ( ) , ; .
  | 'COMMENT'
  | 'WHITESPACE'
  | 'UNKNOWN'

interface Token {
  type: TokenType
  value: string
  /** 1-based line number */
  line: number
  /** 1-based column of the first character */
  col: number
}

// ─── SQL keywords ─────────────────────────────────────────────────────────────

const CLAUSE_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'FULL',
  'OUTER', 'CROSS', 'ON', 'GROUP', 'ORDER', 'BY', 'HAVING', 'LIMIT',
  'OFFSET', 'UNION', 'INTERSECT', 'EXCEPT', 'INTO', 'VALUES', 'SET',
  'RETURNING', 'WITH', 'RECURSIVE',
])

const DML_KEYWORDS = new Set([
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'REPLACE',
])

const DDL_KEYWORDS = new Set([
  'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME', 'COMMENT',
])

const FUNCTION_KEYWORDS = new Set([
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF', 'CAST',
  'CONVERT', 'SUBSTRING', 'TRIM', 'UPPER', 'LOWER', 'LENGTH', 'REPLACE',
  'NOW', 'DATE_TRUNC', 'DATE_PART', 'EXTRACT', 'ROUND', 'FLOOR', 'CEIL',
  'ABS', 'IF', 'IFF', 'IFNULL', 'NVL', 'ROW_NUMBER', 'RANK', 'DENSE_RANK',
  'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE', 'NTILE', 'STRING_AGG',
  'ARRAY_AGG', 'JSON_AGG', 'GROUP_CONCAT', 'PARSE_JSON', 'JSON_VALUE',
  'JSON_EXTRACT', 'SPLIT_PART', 'POSITION', 'CONCAT', 'REGEXP_REPLACE',
  'TO_DATE', 'TO_CHAR', 'DATEDIFF', 'DATEADD', 'POWER', 'SQRT', 'MOD',
])

const ALL_KNOWN_KEYWORDS = new Set([
  ...CLAUSE_KEYWORDS,
  ...DML_KEYWORDS,
  ...DDL_KEYWORDS,
  ...FUNCTION_KEYWORDS,
  'AS', 'DISTINCT', 'ALL', 'AND', 'OR', 'NOT', 'IN', 'EXISTS',
  'BETWEEN', 'LIKE', 'ILIKE', 'IS', 'NULL', 'TRUE', 'FALSE', 'CASE',
  'WHEN', 'THEN', 'ELSE', 'END', 'TABLE', 'VIEW', 'INDEX', 'SCHEMA',
  'DATABASE', 'IF', 'DEFAULT', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES',
  'UNIQUE', 'CHECK', 'CONSTRAINT', 'CASCADE', 'RESTRICT', 'ASC', 'DESC',
  'OVER', 'PARTITION', 'ROWS', 'RANGE', 'UNBOUNDED', 'PRECEDING',
  'FOLLOWING', 'CURRENT', 'ROW', 'WINDOW', 'LATERAL', 'APPLY',
  'TABLESAMPLE', 'PIVOT', 'UNPIVOT', 'QUALIFY', 'MINUS',
])

/**
 * All SQL keywords that are candidates for "did you mean …?" suggestions.
 * Ordered from most-common to least-common so the scoring tiebreak
 * (which uses array position) naturally favours frequent keywords.
 */
const KEYWORD_CANDIDATES: string[] = [
  // DML
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'REPLACE',
  // DDL
  'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME',
  // Clauses
  'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'FULL', 'OUTER',
  'CROSS', 'ON', 'USING', 'GROUP', 'ORDER', 'BY', 'HAVING', 'LIMIT',
  'OFFSET', 'UNION', 'INTERSECT', 'EXCEPT', 'INTO', 'VALUES', 'SET',
  'RETURNING', 'WITH', 'RECURSIVE',
  // Logical / comparison
  'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE', 'IS',
  'NULL', 'TRUE', 'FALSE',
  // Misc
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AS', 'DISTINCT', 'ALL',
  'OVER', 'PARTITION', 'ROWS', 'RANGE', 'WINDOW',
  // Functions
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF', 'CAST',
  'CONVERT', 'CONCAT', 'SUBSTRING', 'TRIM', 'UPPER', 'LOWER', 'LENGTH',
  'REPLACE', 'NOW', 'EXTRACT', 'ROUND', 'FLOOR', 'CEIL', 'ABS',
  'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD', 'FIRST_VALUE',
  'LAST_VALUE', 'NTILE', 'STRING_AGG', 'ARRAY_AGG', 'JSON_AGG',
  'COALESCE', 'IF', 'IFF', 'IFNULL', 'NVL', 'DATE_TRUNC', 'DATE_PART',
  'DATEDIFF', 'DATEADD', 'TO_DATE', 'TO_CHAR',
]

// ─── Tokeniser ────────────────────────────────────────────────────────────────

function tokenise(sql: string): Token[] {
  const tokens: Token[] = []
  let pos = 0
  let line = 1
  let col = 1

  function advance(count = 1) {
    for (let i = 0; i < count; i++) {
      if (sql[pos] === '\n') { line++; col = 1 } else { col++ }
      pos++
    }
  }

  function peek(offset = 0) { return sql[pos + offset] ?? '' }

  while (pos < sql.length) {
    const startLine = line
    const startCol = col
    const ch = sql[pos]

    // ── Line comment  -- ...
    if (ch === '-' && peek(1) === '-') {
      let value = ''
      while (pos < sql.length && sql[pos] !== '\n') {
        value += sql[pos]; advance()
      }
      tokens.push({ type: 'COMMENT', value, line: startLine, col: startCol })
      continue
    }

    // ── Block comment  /* ... */
    if (ch === '/' && peek(1) === '*') {
      let value = '/*'; advance(2)
      while (pos < sql.length && !(sql[pos] === '*' && peek(1) === '/')) {
        value += sql[pos]; advance()
      }
      if (pos < sql.length) { value += '*/'; advance(2) }
      tokens.push({ type: 'COMMENT', value, line: startLine, col: startCol })
      continue
    }

    // ── Whitespace
    if (/\s/.test(ch)) {
      let value = ''
      while (pos < sql.length && /\s/.test(sql[pos])) {
        value += sql[pos]; advance()
      }
      tokens.push({ type: 'WHITESPACE', value, line: startLine, col: startCol })
      continue
    }

    // ── Single-quoted string  'value'
    if (ch === "'") {
      let value = "'"; advance()
      let closed = false
      while (pos < sql.length) {
        if (sql[pos] === "'" && peek(1) === "'") {
          value += "''"; advance(2) // escaped quote
        } else if (sql[pos] === "'") {
          value += "'"; advance(); closed = true; break
        } else {
          value += sql[pos]; advance()
        }
      }
      tokens.push({
        type: closed ? 'STRING' : 'UNKNOWN',
        value,
        line: startLine,
        col: startCol,
      })
      continue
    }

    // ── Double-quoted identifier  "name"
    if (ch === '"') {
      let value = '"'; advance()
      let closed = false
      while (pos < sql.length) {
        if (sql[pos] === '"' && peek(1) === '"') {
          value += '""'; advance(2)
        } else if (sql[pos] === '"') {
          value += '"'; advance(); closed = true; break
        } else {
          value += sql[pos]; advance()
        }
      }
      tokens.push({
        type: closed ? 'IDENTIFIER' : 'UNKNOWN',
        value,
        line: startLine,
        col: startCol,
      })
      continue
    }

    // ── Backtick-quoted identifier  `name`
    if (ch === '`') {
      let value = '`'; advance()
      let closed = false
      while (pos < sql.length) {
        if (sql[pos] === '`') {
          value += '`'; advance(); closed = true; break
        } else {
          value += sql[pos]; advance()
        }
      }
      tokens.push({
        type: closed ? 'IDENTIFIER' : 'UNKNOWN',
        value,
        line: startLine,
        col: startCol,
      })
      continue
    }

    // ── Bracket-quoted identifier  [name]
    if (ch === '[') {
      let value = '['; advance()
      let closed = false
      while (pos < sql.length) {
        if (sql[pos] === ']') {
          value += ']'; advance(); closed = true; break
        } else {
          value += sql[pos]; advance()
        }
      }
      tokens.push({
        type: closed ? 'IDENTIFIER' : 'UNKNOWN',
        value,
        line: startLine,
        col: startCol,
      })
      continue
    }

    // ── Number literal
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(peek(1)))) {
      let value = ''
      while (pos < sql.length && /[0-9._eExX]/.test(sql[pos])) {
        value += sql[pos]; advance()
      }
      tokens.push({ type: 'NUMBER', value, line: startLine, col: startCol })
      continue
    }

    // ── Punctuation
    if ('(),;.'.includes(ch)) {
      tokens.push({ type: 'PUNCTUATION', value: ch, line: startLine, col: startCol })
      advance()
      continue
    }

    // ── Operators
    if ('=<>!+\\-*/%|&^~'.includes(ch)) {
      let value = ch; advance()
      // Multi-char operators: !=  <>  <=  >=  ||  ::  =>
      if (pos < sql.length && (/[=><|:]/.test(sql[pos]))) {
        value += sql[pos]; advance()
      }
      tokens.push({ type: 'OPERATOR', value, line: startLine, col: startCol })
      continue
    }

    // ── Identifier or keyword
    if (/[A-Za-z_$#@]/.test(ch)) {
      let value = ''
      while (pos < sql.length && /[\w$#@]/.test(sql[pos])) {
        value += sql[pos]; advance()
      }
      const upper = value.toUpperCase()
      const type: TokenType = ALL_KNOWN_KEYWORDS.has(upper) ? 'KEYWORD' : 'IDENTIFIER'
      tokens.push({ type, value: upper === value ? upper : value, line: startLine, col: startCol })
      continue
    }

    // ── Anything else
    tokens.push({ type: 'UNKNOWN', value: ch, line: startLine, col: startCol })
    advance()
  }

  return tokens
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Skip whitespace and comment tokens */
function meaningful(tokens: Token[]): Token[] {
  return tokens.filter((t) => t.type !== 'WHITESPACE' && t.type !== 'COMMENT')
}

function makeMarker(
  token: Token,
  message: string,
  severity: Monaco.MarkerSeverity,
  _monacoInstance: typeof Monaco,
): Monaco.editor.IMarkerData {
  const endCol = token.col + token.value.length
  return {
    severity,
    message,
    startLineNumber: token.line,
    startColumn: token.col,
    endLineNumber: token.line,
    endColumn: endCol,
  }
}

// ─── Statement splitter ───────────────────────────────────────────────────────

interface Statement {
  tokens: Token[]  // all tokens (including whitespace/comments) for position tracking
}

/**
 * Split a flat token list into individual statements on semicolons,
 * respecting parenthesis depth so CTEs and subqueries are kept intact.
 */
function splitStatements(tokens: Token[]): Statement[] {
  const statements: Statement[] = []
  let current: Token[] = []
  let depth = 0

  for (const tok of tokens) {
    if (tok.type === 'PUNCTUATION' && tok.value === '(') depth++
    if (tok.type === 'PUNCTUATION' && tok.value === ')') depth = Math.max(0, depth - 1)

    if (tok.type === 'PUNCTUATION' && tok.value === ';' && depth === 0) {
      if (meaningful(current).length > 0) statements.push({ tokens: current })
      current = []
    } else {
      current.push(tok)
    }
  }

  if (meaningful(current).length > 0) statements.push({ tokens: current })
  return statements
}

/** Classic bottom-up Levenshtein edit distance. */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

/**
 * Maximum Levenshtein distance to allow for a word of a given length.
 * Short words are held to a tighter standard to avoid false positives.
 */
function maxEditDistance(len: number): number {
  if (len <= 2) return 0  // "id", "or" — too risky to fuzzy-match
  if (len <= 5) return 1  // "selec", "inser" — allow one missing/extra/swapped char
  return 2                // longer words — allow two edits
}

/**
 * Find the closest matching SQL keyword for `word`, or null if no close match.
 * Returns the keyword and edit distance so the caller can craft a message.
 */
function findClosestKeyword(word: string): { kw: string; dist: number } | null {
  const upper = word.toUpperCase()

  // Skip very short words — false positives outweigh value
  if (upper.length < 3) return null
  // Skip names with underscores or dots — almost certainly table/column identifiers
  if (word.includes('_') || word.includes('.')) return null

  const max = maxEditDistance(upper.length)
  let best: string | null = null
  let bestDist = Infinity
  let bestScore = -Infinity

  for (const kw of KEYWORD_CANDIDATES) {
    // Quick length gate before computing full edit distance
    if (Math.abs(kw.length - upper.length) > max + 1) continue
    const d = levenshtein(upper, kw)
    if (d > max) continue

    // Tiebreaker score:
    //   - lower dist is better
    //   - more shared prefix characters is better (transpositions vs deletions)
    //   - longer keyword wins (avoids preferring short keywords like "IN" over "INTO")
    let sharedPrefix = 0
    for (let i = 0; i < Math.min(upper.length, kw.length); i++) {
      if (upper[i] === kw[i]) sharedPrefix++; else break
    }
    const score = -d * 100 + sharedPrefix * 10 + kw.length

    if (d < bestDist || (d === bestDist && score > bestScore)) {
      bestDist = d
      bestScore = score
      best = kw
    }
  }

  return best !== null ? { kw: best, dist: bestDist } : null
}

/**
 * Positions in a SQL statement where an identifier could be a misspelled keyword.
 * We only flag identifiers in "keyword-expected" positions to avoid false positives
 * on legitimate table/column names.
 *
 * Strategy:
 *  - The first meaningful token of a statement must be a DML/DDL keyword.
 *  - Tokens that immediately follow a clause-opening keyword (FROM, JOIN, ON, …)
 *    are expected to be table names — skip them.
 *  - Tokens inside SELECT … FROM at depth 0 that are not preceded by a dot or comma
 *    are candidates (could be a mistyped function or clause keyword).
 */
function validateMisspelledKeywords(
  tokens: Token[],
  markers: Marker[],
  mono: typeof Monaco,
): void {
  const m = meaningful(tokens)
  if (m.length === 0) return

  // Positions immediately after a table-name-expected keyword: skip those identifiers
  const TABLE_EXPECTED_AFTER = new Set([
    'FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE', 'VIEW', 'INDEX',
    'LEFT', 'RIGHT', 'INNER', 'FULL', 'OUTER', 'CROSS',
  ])
  // Positions where we definitely expect an identifier (column alias, etc.) — skip
  const IDENTIFIER_EXPECTED_AFTER = new Set([
    'AS', 'ON', 'BY', 'SET', '.', ',',
  ])

  let depth = 0

  for (let i = 0; i < m.length; i++) {
    const tok = m[i]

    if (tok.type === 'PUNCTUATION' && tok.value === '(') { depth++; continue }
    if (tok.type === 'PUNCTUATION' && tok.value === ')') { depth = Math.max(0, depth - 1); continue }

    // Only look at IDENTIFIER tokens (the tokeniser already classified real keywords)
    if (tok.type !== 'IDENTIFIER') continue

    const prevMeaningful = i > 0 ? m[i - 1] : null
    const nextMeaningful = i < m.length - 1 ? m[i + 1] : null

    // Skip if preceded by a dot (schema.table or table.column)
    if (prevMeaningful?.value === '.') continue

    // Skip if followed by a dot (schema prefix)
    if (nextMeaningful?.value === '.') continue

    // Skip if immediately after a keyword that expects a table/object name
    if (prevMeaningful?.type === 'KEYWORD' && TABLE_EXPECTED_AFTER.has(prevMeaningful.value)) continue

    // Skip if immediately after AS, ON, BY, SET, . — these are always identifiers
    if (prevMeaningful && IDENTIFIER_EXPECTED_AFTER.has(
      prevMeaningful.type === 'KEYWORD' ? prevMeaningful.value : prevMeaningful.value,
    )) continue

    // Skip if followed by ( — this is a function call, probably intentional
    if (nextMeaningful?.value === '(') continue

    // Now attempt fuzzy keyword matching
    const match = findClosestKeyword(tok.value)
    if (!match) continue

    // Extra guard: don\'t flag if the token is already a known alias in the query
    // (i.e. it appears after FROM/JOIN in the same statement — it\'s a real table name)
    const isKnownTableOrAlias = m.some((t, j) => {
      if (t.value !== tok.value) return false
      const prev = j > 0 ? m[j - 1] : null
      return prev?.type === 'KEYWORD' && TABLE_EXPECTED_AFTER.has(prev.value)
    })
    if (isKnownTableOrAlias) continue

    const message =
      match.dist === 0
        ? `"${tok.value}" is not a recognised SQL keyword.`
        : `Unknown keyword "${tok.value}" — did you mean ${match.kw}?`

    markers.push(makeMarker(tok, message, mono.MarkerSeverity.Warning, mono))
  }
}


// ─── Per-statement validators ─────────────────────────────────────────────────

type Marker = Monaco.editor.IMarkerData

function validateParentheses(
  tokens: Token[],
  markers: Marker[],
  mono: typeof Monaco,
): void {
  const stack: Token[] = []
  for (const tok of tokens) {
    if (tok.type !== 'PUNCTUATION') continue
    if (tok.value === '(') {
      stack.push(tok)
    } else if (tok.value === ')') {
      if (stack.length === 0) {
        markers.push(makeMarker(tok, 'Unexpected closing parenthesis — no matching opening parenthesis.', mono.MarkerSeverity.Error, mono))
      } else {
        stack.pop()
      }
    }
  }
  for (const unmatched of stack) {
    markers.push(makeMarker(unmatched, 'Unclosed parenthesis — add a matching closing parenthesis.', mono.MarkerSeverity.Error, mono))
  }
}

function validateUnclosedStrings(
  tokens: Token[],
  markers: Marker[],
  mono: typeof Monaco,
): void {
  for (const tok of tokens) {
    if (tok.type === 'UNKNOWN') {
      if (tok.value.startsWith("'"))
        markers.push(makeMarker(tok, 'Unclosed string literal — missing closing single quote.', mono.MarkerSeverity.Error, mono))
      else if (tok.value.startsWith('"'))
        markers.push(makeMarker(tok, 'Unclosed quoted identifier — missing closing double quote.', mono.MarkerSeverity.Error, mono))
      else if (tok.value.startsWith('`'))
        markers.push(makeMarker(tok, 'Unclosed quoted identifier — missing closing backtick.', mono.MarkerSeverity.Error, mono))
      else if (tok.value.startsWith('['))
        markers.push(makeMarker(tok, 'Unclosed bracketed identifier — missing closing bracket `]`.', mono.MarkerSeverity.Error, mono))
    }
  }
}

/**
 * Collect top-level keyword occurrences (depth=0 only) for clause-order checks.
 */
function collectTopLevelKeywords(tokens: Token[]): { kw: string; tok: Token }[] {
  const result: { kw: string; tok: Token }[] = []
  let depth = 0
  for (const tok of tokens) {
    if (tok.type === 'PUNCTUATION' && tok.value === '(') { depth++; continue }
    if (tok.type === 'PUNCTUATION' && tok.value === ')') { depth = Math.max(0, depth - 1); continue }
    if (depth === 0 && tok.type === 'KEYWORD') result.push({ kw: tok.value, tok })
  }
  return result
}

/** Index of first occurrence of a keyword among top-level keywords, or -1 */
function kwIndex(list: { kw: string; tok: Token }[], keyword: string): number {
  return list.findIndex((x) => x.kw === keyword)
}

function validateClauseOrder(
  tokens: Token[],
  markers: Marker[],
  mono: typeof Monaco,
): void {
  const m = meaningful(tokens)
  if (m.length === 0) return

  const first = m[0]
  const firstKw = first.value.toUpperCase()

  // Only validate DML statements where we know the expected structure
  if (!DML_KEYWORDS.has(firstKw)) return

  const topKws = collectTopLevelKeywords(m)

  // ── SELECT-specific rules ─────────────────────────────────────────────────
  if (firstKw === 'SELECT') {
    const iFrom   = kwIndex(topKws, 'FROM')
    const iWhere  = kwIndex(topKws, 'WHERE')
    const iGroup  = topKws.findIndex((x) => x.kw === 'GROUP')
    const iHaving = kwIndex(topKws, 'HAVING')
    const iOrder  = topKws.findIndex((x) => x.kw === 'ORDER')
    const iLimit  = kwIndex(topKws, 'LIMIT')
    const iOffset = kwIndex(topKws, 'OFFSET')

    // WHERE before FROM
    if (iWhere !== -1 && iFrom !== -1 && iWhere < iFrom) {
      console.log('WHERE before FROM', iWhere, iFrom, topKws)
      markers.push(makeMarker(topKws[iWhere].tok, 'WHERE must come after FROM.', mono.MarkerSeverity.Error, mono))
    }

    // HAVING before GROUP BY
    if (iHaving !== -1 && iGroup === -1) {
      markers.push(makeMarker(topKws[iHaving].tok, 'HAVING requires a GROUP BY clause.', mono.MarkerSeverity.Error, mono))
    }
    if (iHaving !== -1 && iGroup !== -1 && iHaving < iGroup) {
      markers.push(makeMarker(topKws[iHaving].tok, 'HAVING must come after GROUP BY.', mono.MarkerSeverity.Error, mono))
    }

    // ORDER BY before GROUP BY
    if (iOrder !== -1 && iGroup !== -1 && iOrder < iGroup) {
      markers.push(makeMarker(topKws[iOrder].tok, 'ORDER BY must come after GROUP BY.', mono.MarkerSeverity.Error, mono))
    }

    // OFFSET without LIMIT
    if (iOffset !== -1 && iLimit === -1) {
      markers.push(makeMarker(topKws[iOffset].tok, 'OFFSET requires a LIMIT clause.', mono.MarkerSeverity.Warning, mono))
    }
  }

  // ── INSERT-specific ───────────────────────────────────────────────────────
  if (firstKw === 'INSERT') {
    const hasInto  = topKws.some((x) => x.kw === 'INTO')
    const hasValues = topKws.some((x) => x.kw === 'VALUES')
    const hasSelect = topKws.some((x) => x.kw === 'SELECT')
    if (!hasInto) {
      markers.push(makeMarker(first, 'INSERT requires INTO.', mono.MarkerSeverity.Error, mono))
    }
    if (!hasValues && !hasSelect) {
      markers.push(makeMarker(first, 'INSERT requires VALUES or a SELECT subquery.', mono.MarkerSeverity.Warning, mono))
    }
  }

  // ── UPDATE-specific ───────────────────────────────────────────────────────
  if (firstKw === 'UPDATE') {
    const hasSet = topKws.some((x) => x.kw === 'SET')
    if (!hasSet) {
      markers.push(makeMarker(first, 'UPDATE requires a SET clause.', mono.MarkerSeverity.Error, mono))
    }
  }

  // ── DELETE-specific ───────────────────────────────────────────────────────
  if (firstKw === 'DELETE') {
    const hasFrom = topKws.some((x) => x.kw === 'FROM')
    if (!hasFrom) {
      markers.push(makeMarker(first, 'DELETE requires FROM.', mono.MarkerSeverity.Error, mono))
    }
  }
}

function validateDuplicateClauses(
  tokens: Token[],
  markers: Marker[],
  mono: typeof Monaco,
): void {
  const UNIQUE_CLAUSES = ['SELECT', 'FROM', 'WHERE', 'HAVING', 'LIMIT', 'OFFSET']
  const topKws = collectTopLevelKeywords(meaningful(tokens))

  for (const kw of UNIQUE_CLAUSES) {
    const occurrences = topKws.filter((x) => x.kw === kw)
    if (occurrences.length > 1) {
      // Mark everything from the second one onwards
      for (const extra of occurrences.slice(1)) {
        markers.push(makeMarker(extra.tok, `Duplicate ${kw} clause — each clause may only appear once in a statement.`, mono.MarkerSeverity.Error, mono))
      }
    }
  }
}

function validateTrailingComma(
  tokens: Token[],
  markers: Marker[],
  mono: typeof Monaco,
): void {
  const m = meaningful(tokens)
  const COMMA_ILLEGAL_AFTER = new Set([
    'FROM', 'WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET',
    'JOIN', 'LEFT', 'RIGHT', 'INNER', 'FULL', 'CROSS', 'OUTER',
    'UNION', 'INTERSECT', 'EXCEPT',
  ])

  for (let i = 0; i < m.length - 1; i++) {
    const tok = m[i]
    const next = m[i + 1]
    if (tok.type === 'PUNCTUATION' && tok.value === ',') {
      // trailing comma before a clause keyword
      if (next.type === 'KEYWORD' && COMMA_ILLEGAL_AFTER.has(next.value)) {
        markers.push(makeMarker(tok, `Trailing comma before ${next.value} — remove the comma.`, mono.MarkerSeverity.Error, mono))
      }
      // trailing comma before closing paren
      if (next.type === 'PUNCTUATION' && next.value === ')') {
        markers.push(makeMarker(tok, 'Trailing comma before closing parenthesis — remove the comma.', mono.MarkerSeverity.Error, mono))
      }
    }
  }
}

function validateLogicalOperatorAtStart(
  tokens: Token[],
  markers: Marker[],
  mono: typeof Monaco,
): void {
  const m = meaningful(tokens)
  if (m.length === 0) return
  const firstKw = m[0].value.toUpperCase()
  // Only flag in SELECT / UPDATE / DELETE where it makes no sense at the top level
  if (!DML_KEYWORDS.has(firstKw)) return

  // Find AND/OR/NOT that appear immediately after SELECT (i.e. before any FROM/WHERE)
  // More specifically: flag AND/OR at top-level depth when they are the very first
  // token of the statement (common paste mistake)
  if (['AND', 'OR'].includes(firstKw)) {
    markers.push(makeMarker(m[0], `Statement starts with ${firstKw} — did you mean to add a WHERE clause first?`, mono.MarkerSeverity.Error, mono))
  }
}

function validateSelectColumns(
  tokens: Token[],
  markers: Marker[],
  mono: typeof Monaco,
): void {
  const m = meaningful(tokens)
  if (m.length === 0) return
  if (m[0].value !== 'SELECT') return

  // Find top-level FROM index
  let depth = 0
  let selectIdx = -1
  let fromIdx = -1

  for (let i = 0; i < m.length; i++) {
    const tok = m[i]
    if (tok.type === 'PUNCTUATION' && tok.value === '(') { depth++; continue }
    if (tok.type === 'PUNCTUATION' && tok.value === ')') { depth = Math.max(0, depth - 1); continue }
    if (depth !== 0) continue
    if (tok.value === 'SELECT' && selectIdx === -1) selectIdx = i
    if (tok.value === 'FROM' && fromIdx === -1) fromIdx = i
  }

  if (selectIdx === -1) return

  // Tokens between SELECT and FROM (or end of statement)
  const columnTokens = m.slice(selectIdx + 1, fromIdx === -1 ? undefined : fromIdx)

  // Check for SELECT with nothing between it and FROM
  if (columnTokens.length === 0 && fromIdx !== -1) {
    markers.push(makeMarker(m[selectIdx], 'SELECT has no column list — add at least one column or *.', mono.MarkerSeverity.Error, mono))
  }
}

function validateJoinOnClause(
  tokens: Token[],
  markers: Marker[],
  mono: typeof Monaco,
): void {
  const m = meaningful(tokens)
  // CROSS JOIN is valid without ON, so we skip it

  let depth = 0
  for (let i = 0; i < m.length; i++) {
    const tok = m[i]
    if (tok.type === 'PUNCTUATION' && tok.value === '(') { depth++; continue }
    if (tok.type === 'PUNCTUATION' && tok.value === ')') { depth = Math.max(0, depth - 1); continue }
    if (depth !== 0) continue

    // Detect JOIN (possibly preceded by LEFT/RIGHT/INNER/FULL/OUTER)
    if (tok.value === 'JOIN') {
      // Look ahead: skip identifier(s) and find if ON appears before the next JOIN/WHERE/GROUP/etc
      let j = i + 1
      // skip table name
      while (j < m.length && (m[j].type === 'IDENTIFIER' || m[j].type === 'STRING' || (m[j].type === 'PUNCTUATION' && m[j].value === '.'))) j++
      // skip optional alias
      if (j < m.length && m[j].type === 'IDENTIFIER') j++

      // now look for ON before next clause-level keyword
      let foundOn = false
      let foundCross = false

      // Check if this was a CROSS JOIN (prev keyword = CROSS)
      for (let k = i - 1; k >= 0; k--) {
        if (m[k].type === 'WHITESPACE') continue
        if (m[k].value === 'CROSS') { foundCross = true }
        break
      }

      if (!foundCross) {
        const CLAUSE_STOP = new Set(['WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'UNION', 'INTERSECT', 'EXCEPT'])
        for (let k = j; k < m.length; k++) {
          if (m[k].type === 'PUNCTUATION' && m[k].value === '(') { depth++; continue }
          if (m[k].type === 'PUNCTUATION' && m[k].value === ')') { depth = Math.max(0, depth - 1); continue }
          if (depth !== 0) continue
          if (m[k].value === 'ON' || m[k].value === 'USING') { foundOn = true; break }
          if (m[k].value === 'JOIN') break // next join — stop
          if (CLAUSE_STOP.has(m[k].value)) break
        }
        if (!foundOn) {
          markers.push(makeMarker(tok, 'JOIN is missing an ON (or USING) clause.', mono.MarkerSeverity.Warning, mono))
        }
      }
    }
  }
}

function validateUnknownTopLevelKeyword(
  tokens: Token[],
  markers: Marker[],
  mono: typeof Monaco,
): void {
  const m = meaningful(tokens)
  if (m.length === 0) return

  const firstTok = m[0]

  // The very first token of a statement must be a DML/DDL/WITH keyword.
  // If it's an IDENTIFIER, it's either a typo (caught by validateMisspelledKeywords)
  // or truly unknown — emit a clearer "statement-level" error.
  if (firstTok.type === 'IDENTIFIER') {
    const match = findClosestKeyword(firstTok.value)
    const suggestion = match
      ? ` Did you mean ${match.kw}?`
      : ' Expected SELECT, INSERT, UPDATE, DELETE, CREATE, or similar.'
    markers.push(
      makeMarker(
        firstTok,
        `"${firstTok.value}" is not a valid statement keyword.${suggestion}`,
        mono.MarkerSeverity.Error,
        mono,
      ),
    )
  }
}


// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate a full SQL string and return Monaco IMarkerData[] (red/yellow squiggles).
 * Pass the result to `monaco.editor.setModelMarkers(model, 'sql-validator', markers)`.
 */
export function validateSql(
  sql: string,
  monacoInstance: typeof Monaco,
): Monaco.editor.IMarkerData[] {
  if (!sql.trim()) return []

  const allMarkers: Marker[] = []
  const tokens = tokenise(sql)
  const statements = splitStatements(tokens)

  if (statements.length === 0) return []

  for (const stmt of statements) {
    const m = meaningful(stmt.tokens)
    if (m.length === 0) continue

    validateUnclosedStrings(stmt.tokens, allMarkers, monacoInstance)
    validateParentheses(stmt.tokens, allMarkers, monacoInstance)
    validateTrailingComma(stmt.tokens, allMarkers, monacoInstance)
    validateClauseOrder(stmt.tokens, allMarkers, monacoInstance)
    validateDuplicateClauses(stmt.tokens, allMarkers, monacoInstance)
    validateLogicalOperatorAtStart(stmt.tokens, allMarkers, monacoInstance)
    validateSelectColumns(stmt.tokens, allMarkers, monacoInstance)
    validateJoinOnClause(stmt.tokens, allMarkers, monacoInstance)
    validateMisspelledKeywords(stmt.tokens, allMarkers, monacoInstance)
    validateUnknownTopLevelKeyword(stmt.tokens, allMarkers, monacoInstance)
  }

  return allMarkers
}