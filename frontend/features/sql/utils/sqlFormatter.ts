const MAJOR_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'AND',
  'OR',
  'ORDER BY',
  'GROUP BY',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'INNER JOIN',
  'LEFT JOIN',
  'RIGHT JOIN',
  'FULL JOIN',
  'CROSS JOIN',
  'LEFT OUTER JOIN',
  'RIGHT OUTER JOIN',
  'FULL OUTER JOIN',
  'JOIN',
  'ON',
  'SET',
  'VALUES',
  'INTO',
  'INSERT INTO',
  'UPDATE',
  'DELETE FROM',
  'CREATE TABLE',
  'ALTER TABLE',
  'DROP TABLE',
  'CREATE INDEX',
  'DROP INDEX',
  'UNION ALL',
  'UNION',
  'INTERSECT',
  'EXCEPT',
  'WITH',
  'AS',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'RETURNING',
  'WINDOW',
  'PARTITION BY',
  'OVER',
]

const INDENT_AFTER = new Set([
  'SELECT',
  'FROM',
  'WHERE',
  'SET',
  'VALUES',
  'INTO',
  'ORDER BY',
  'GROUP BY',
  'HAVING',
  'CASE',
])

const DEDENT_BEFORE = new Set(['END'])

function tokenize(sql: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < sql.length) {
    if (/\s/.test(sql[i])) {
      i++
      continue
    }

    if (sql[i] === '-' && sql[i + 1] === '-') {
      let end = sql.indexOf('\n', i)
      if (end === -1) end = sql.length
      tokens.push(sql.slice(i, end))
      i = end
      continue
    }

    if (sql[i] === '/' && sql[i + 1] === '*') {
      let end = sql.indexOf('*/', i)
      if (end === -1) end = sql.length
      else end += 2
      tokens.push(sql.slice(i, end))
      i = end
      continue
    }

    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i]
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === quote) {
          if (sql[j + 1] === quote) {
            j += 2
            continue
          }
          break
        }
        if (sql[j] === '\\') {
          j += 2
          continue
        }
        j++
      }
      tokens.push(sql.slice(i, j + 1))
      i = j + 1
      continue
    }

    if ('(),;'.includes(sql[i])) {
      tokens.push(sql[i])
      i++
      continue
    }

    let j = i
    while (
      j < sql.length &&
      !/[\s(),;]/.test(sql[j]) &&
      !(sql[j] === '-' && sql[j + 1] === '-') &&
      !(sql[j] === '/' && sql[j + 1] === '*')
    ) {
      j++
    }
    tokens.push(sql.slice(i, j))
    i = j
  }
  return tokens
}

function matchCompoundKeyword(tokens: string[], idx: number): string | null {
  const upper = tokens[idx].toUpperCase()
  for (const kw of MAJOR_KEYWORDS) {
    const parts = kw.split(' ')
    if (parts[0] !== upper) continue
    if (parts.length === 1) continue
    let match = true
    for (let p = 1; p < parts.length; p++) {
      if (
        idx + p >= tokens.length ||
        tokens[idx + p].toUpperCase() !== parts[p]
      ) {
        match = false
        break
      }
    }
    if (match) return kw
  }
  return null
}

export function beautifySql(sql: string): string {
  const trimmed = sql.trim()
  if (!trimmed) return sql

  const tokens = tokenize(trimmed)
  const lines: string[] = []
  let currentLine = ''
  let indent = 0
  let parenDepth = 0
  let i = 0

  const push = () => {
    if (currentLine.trim()) {
      lines.push('  '.repeat(indent) + currentLine.trim())
    }
    currentLine = ''
  }

  while (i < tokens.length) {
    const token = tokens[i]

    if (token.startsWith('--') || token.startsWith('/*')) {
      push()
      lines.push('  '.repeat(indent) + token)
      i++
      continue
    }

    if (token === '(') {
      parenDepth++
      currentLine += token
      i++
      continue
    }

    if (token === ')') {
      parenDepth--
      currentLine += token
      i++
      continue
    }

    if (token === ',') {
      if (parenDepth > 0) {
        currentLine += ', '
      } else {
        currentLine += ','
        push()
      }
      i++
      continue
    }

    if (token === ';') {
      currentLine += ';'
      indent = 0
      push()
      lines.push('')
      i++
      continue
    }

    const compound = matchCompoundKeyword(tokens, i)
    const upper = compound ?? token.toUpperCase()
    const isMajor = compound ? true : MAJOR_KEYWORDS.includes(upper)

    if (isMajor && parenDepth === 0) {
      if (DEDENT_BEFORE.has(upper)) {
        indent = Math.max(0, indent - 1)
      }
      push()
      if (compound) {
        currentLine = compound.split(' ').length > 1 ? compound : upper
        i += compound.split(' ').length
      } else {
        currentLine = upper
        i++
      }
      if (INDENT_AFTER.has(upper)) {
        push()
        indent++
      }
      continue
    }

    if (currentLine) currentLine += ' '
    currentLine += token
    i++
  }

  push()

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function minifySql(sql: string): string {
  const trimmed = sql.trim()
  if (!trimmed) return sql

  const tokens = tokenize(trimmed)
  const parts: string[] = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    if (token.startsWith('--')) continue
    if (token.startsWith('/*')) continue

    if ('(),;'.includes(token)) {
      parts.push(token)
      continue
    }

    if (parts.length > 0) {
      const last = parts[parts.length - 1]
      if (
        last !== '(' &&
        token !== ')' &&
        token !== ',' &&
        token !== ';' &&
        last !== ','
      ) {
        parts.push(' ')
      }
    }
    parts.push(token)
  }

  return parts.join('').replace(/\s+/g, ' ').trim()
}
