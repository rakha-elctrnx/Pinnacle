// parseDelimitedText, mapPasteToColumns partial records, sqlValue/JSON
// serialization, and dialect-aware identifier quoting.
// Run with: pnpm vitest run frontend/features/sql/utils/clipboard.test.ts
import { describe, it, expect } from 'vitest'
import {
  parseDelimitedText,
  mapPasteToColumns,
  formatCSVWithHeaders,
  generateInsertSQL,
  generateReviewSQL,
} from './clipboard'

describe('parseDelimitedText', () => {
  it('parses tab-separated text', () => {
    const parsed = parseDelimitedText('a\tb\n1\t2')
    expect(parsed.rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
    expect(parsed.columnCount).toBe(2)
  })

  it('auto-detects comma when no tab is present', () => {
    expect(parseDelimitedText('a,b\nc,d').rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('supports doubled quotes and quoted delimiters (CSV round-trip)', () => {
    const csv = formatCSVWithHeaders(
      [{ name: 'He said "hi"', note: 'a,b' }],
      ['name', 'note'],
    )
    expect(parseDelimitedText(csv).rows).toEqual([
      ['name', 'note'],
      ['He said "hi"', 'a,b'],
    ])
  })

  it('keeps newlines inside quoted fields and handles CRLF', () => {
    const parsed = parseDelimitedText('"line1\r\nline2",x\r\ny,z')
    expect(parsed.rows).toEqual([
      ['line1\r\nline2', 'x'],
      ['y', 'z'],
    ])
  })

  it('does not trim meaningful whitespace in cells', () => {
    expect(parseDelimitedText('  padded  ,x').rows).toEqual([
      ['  padded  ', 'x'],
    ])
  })

  it('ignores exactly one trailing empty record from a terminal newline', () => {
    expect(parseDelimitedText('a,b\n1,2\n').rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
    // But a genuinely blank record in the middle is preserved.
    expect(parseDelimitedText('a,b\n\n1,2').rows).toEqual([
      ['a', 'b'],
      [''],
      ['1', '2'],
    ])
  })
})

describe('mapPasteToColumns partial records', () => {
  it('includes only cells physically present — never synthesizes empty strings', () => {
    const [first] = mapPasteToColumns([['only-one']], ['a', 'b', 'c'])
    expect(first).toEqual({ a: 'only-one' })
    expect(Object.prototype.hasOwnProperty.call(first ?? {}, 'b')).toBe(false)
  })

  it('drops extra cells beyond the target columns', () => {
    expect(mapPasteToColumns([['1', '2', '3']], ['a'])).toEqual([{ a: '1' }])
  })
})

describe('SQL generation', () => {
  it('serializes arrays/objects as JSON before quote escaping', () => {
    const sql = generateInsertSQL(
      [{ meta: { k: [1, 2] } }],
      ['meta'],
      't',
      'postgresql',
    )
    expect(sql).toContain(`'{"k":[1,2]}'`)
  })

  it('uses backticks for MySQL identifiers', () => {
    const sql = generateInsertSQL(
      [{ id: 1 }],
      ['id', 'order col'],
      'my table',
      'mysql',
    )
    expect(sql).toContain('INSERT INTO `my table` (`id`, `order col`)')
  })

  it('uses double quotes for PostgreSQL identifiers', () => {
    const sql = generateInsertSQL([{ id: 1 }], ['id'], 'users', 'postgresql')
    expect(sql).toContain('INSERT INTO "users" ("id")')
  })

  it('generateReviewSQL forwards dbType to every statement group', () => {
    const columnInfo = [{ name: 'pk', isPrimaryKey: true }, { name: 'v' }]
    const sql = generateReviewSQL(
      [{ pk: 1, v: 'x' }],
      ['pk', 'v'],
      't',
      columnInfo,
      'all',
      'mysql',
    )
    expect(sql).toContain('UPDATE `t`')
    expect(sql).toContain('DELETE FROM `t`')
    expect(sql).toContain('WHERE `pk`')
  })
})
