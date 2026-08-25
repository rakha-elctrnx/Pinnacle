// Type-aware filter operator SQL: literal %/_/\ escaping with explicit
// ESCAPE clause, and quoted-comma IN values.
// Run with: pnpm vitest run frontend/features/sql/logic/tableDetailFilters.test.ts
import { describe, it, expect } from 'vitest'
import { buildSqlForCondition } from './tableDetailPageHelpers'
import type { ColumnMetadata } from '../types/tableDetail'

const meta: ColumnMetadata[] = [
  { columnName: 'name', dataType: 'text' },
  { columnName: 'age', dataType: 'integer' },
  { columnName: 'active', dataType: 'boolean' },
  { columnName: 'created_at', dataType: 'timestamp' },
]

describe('buildSqlForCondition LIKE literal escaping', () => {
  it('escapes % _ \\ in contains and emits ESCAPE for PostgreSQL', () => {
    const sql = buildSqlForCondition(
      { column: 'name', operator: 'contains', value: '50%_off\\sale' },
      'postgresql',
      meta,
    )
    expect(sql).toBe(
      `"name" ILIKE '%50\\%\\_off\\\\sale%' ESCAPE '\\\\'`,
    )
  })

  it('escapes wildcards for MySQL LIKE too', () => {
    const sql = buildSqlForCondition(
      { column: 'name', operator: 'starts_with', value: 'a_b%c' },
      'mysql',
      meta,
    )
    expect(sql).toBe("`name` LIKE 'a\\_b\\%c%' ESCAPE '\\\\'")
  })

  it('keeps ends_with escaped on the tail side', () => {
    expect(
      buildSqlForCondition(
        { column: 'name', operator: 'ends_with', value: '%' },
        'postgresql',
        meta,
      ),
    ).toBe(`"name" ILIKE '%\\%' ESCAPE '\\\\'`)
  })
})

describe('buildSqlForCondition type-aware value handling', () => {
  it('compares numeric columns unquoted and text quoted', () => {
    expect(
      buildSqlForCondition({ column: 'age', operator: '=', value: '30' }, 'postgresql', meta),
    ).toBe('"age" = 30')
    expect(
      buildSqlForCondition({ column: 'name', operator: '=', value: '30' }, 'postgresql', meta),
    ).toBe(`"name" = '30'`)
  })
})

describe('buildSqlForCondition IN parsing via delimited parser', () => {
  it('splits plain comma lists', () => {
    expect(
      buildSqlForCondition(
        { column: 'name', operator: 'in', value: 'a,b,c' },
        'postgresql',
        meta,
      ),
    ).toBe(`"name" IN ('a', 'b', 'c')`)
  })

  it('keeps quoted commas as one item', () => {
    expect(
      buildSqlForCondition(
        { column: 'name', operator: 'in', value: '"Smith, John",Adams' },
        'postgresql',
        meta,
      ),
    ).toBe(`"name" IN ('Smith, John', 'Adams')`)
  })

  it('emits a harmless tautology for an all-empty IN list', () => {
    expect(
      buildSqlForCondition(
        { column: 'name', operator: 'in', value: ' , ,' },
        'postgresql',
        meta,
      ),
    ).toBe('1=1')
  })
})
