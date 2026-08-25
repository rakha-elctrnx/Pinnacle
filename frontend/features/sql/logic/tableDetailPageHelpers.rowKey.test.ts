// Composite row-key contract tests.
// Run with: pnpm vitest run frontend/features/sql/logic/tableDetailPageHelpers.rowKey.test.ts
import { describe, it, expect } from 'vitest'
import { buildRowId, getRowKey } from './tableDetailPageHelpers'
import type { TableRow } from '../types/tableDetail'

const COMPOSITE_PK = ['tenant_id', 'item_id']

describe('getRowKey', () => {
  it('returns ordered string values for a complete composite key', () => {
    const row: TableRow = { tenant_id: 't1', item_id: 42, name: 'x' }
    expect(getRowKey(row, COMPOSITE_PK)).toEqual(['t1', '42'])
  })

  it('returns null when the primary key column list is empty', () => {
    const row: TableRow = { tenant_id: 't1', item_id: '42' }
    expect(getRowKey(row, [])).toBeNull()
  })

  it('returns null when any key value is null', () => {
    const row: TableRow = { tenant_id: null, item_id: '42' }
    expect(getRowKey(row, COMPOSITE_PK)).toBeNull()
  })

  it("returns null when any key value is an empty string", () => {
    const row: TableRow = { tenant_id: 't1', item_id: '' }
    expect(getRowKey(row, COMPOSITE_PK)).toBeNull()
  })

  it('returns null when a key column is missing from the row', () => {
    const row: TableRow = { tenant_id: 't1' }
    expect(getRowKey(row, COMPOSITE_PK)).toBeNull()
  })

  it('JSON-stringifies object key values', () => {
    const row: TableRow = { tenant_id: 't1', item_id: { id: 7 } }
    expect(getRowKey(row, COMPOSITE_PK)).toEqual(['t1', '{"id":7}'])
  })
})

describe('buildRowId with composite primary keys', () => {
  it('produces distinct ids for two rows sharing the first key component', () => {
    const rowA: TableRow = { tenant_id: 't1', item_id: '41', label: 'A' }
    const rowB: TableRow = { tenant_id: 't1', item_id: '99', label: 'B' }
    const idA = buildRowId(rowA, 0, 'items', COMPOSITE_PK)
    const idB = buildRowId(rowB, 1, 'items', COMPOSITE_PK)
    expect(idA).not.toBe(idB)
  })

  it('embeds both key values in the generated id', () => {
    const row: TableRow = { tenant_id: 't1', item_id: '99' }
    const id = buildRowId(row, 3, 'items', COMPOSITE_PK)
    expect(id).toBe('items:pk:' + JSON.stringify(['t1', '99']))
  })

  it('returns insert-row ids unchanged', () => {
    const row: TableRow = { __rowId: '__insert__1', tenant_id: '', item_id: '' }
    expect(buildRowId(row, 5, 'items', COMPOSITE_PK)).toBe('__insert__1')
  })

  it('falls back to readonly:index when the key is incomplete', () => {
    const row: TableRow = { tenant_id: 't1', item_id: null }
    expect(buildRowId(row, 4, 'items', COMPOSITE_PK)).toBe(
      'items:readonly:4',
    )
  })

  it('falls back to readonly:index for no-PK tables', () => {
    const row: TableRow = { tenant_id: 't1', item_id: '9' }
    expect(buildRowId(row, 2, 'items', [])).toBe('items:readonly:2')
  })
})
