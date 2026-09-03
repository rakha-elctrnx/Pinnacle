// Commit payload construction from row snapshots (composite-key contract).
// Run with: pnpm vitest run frontend/features/sql/store/tableEditStore.commitKeys.test.ts
//
// These tests mirror the payload-building logic in useTableOperations'
// handleCommit: staged rowIds are resolved back to their display-row
// snapshot and keys are rebuilt via getRowKey — never parsed from the ID.
import { describe, it, expect } from 'vitest'
import { buildRowId, getRowKey } from '../logic/tableDetailPageHelpers'
import type { TableRow } from '../types/tableDetail'

interface StagedEdit {
  field: string
  oldValue: unknown
  newValue: unknown
}

const PK = ['tenant_id', 'item_id']
const TABLE = 'items'

function resolveAndBuild(
  realTableRows: Record<string, string>[],
  pendingEdits: Record<string, StagedEdit[]>,
  pendingDeletes: string[],
): {
  updates: { key: { values: string[] }; changes: Record<string, unknown> }[]
  deletes: { values: string[] }[]
} {
  const resolveRow = (rowId: string): TableRow | undefined => {
    const realIdx = realTableRows.findIndex(
      (row, idx) => buildRowId(row, idx, TABLE, PK) === rowId,
    )
    if (realIdx >= 0) return realTableRows[realIdx]
    return undefined
  }

  const updates: {
    key: { values: string[] }
    changes: Record<string, unknown>
  }[] = []
  for (const [rowId, edits] of Object.entries(pendingEdits)) {
    if (rowId.startsWith('__insert__')) continue
    const changes: Record<string, unknown> = {}
    for (const edit of edits) {
      changes[edit.field] = edit.newValue
    }
    const row = resolveRow(rowId)
    const keyValues = row ? getRowKey(row, PK) : null
    if (!keyValues) continue
    updates.push({ key: { values: keyValues }, changes })
  }

  const deletes: { values: string[] }[] = []
  for (const rowId of pendingDeletes) {
    if (rowId.startsWith('__insert__')) continue
    const row = resolveRow(rowId)
    const keyValues = row ? getRowKey(row, PK) : null
    if (!keyValues) continue
    deletes.push({ values: keyValues })
  }
  return { updates, deletes }
}

describe('commit payload built from row snapshots', () => {
  const realRows = [
    { tenant_id: 't1', item_id: '41', qty: '1' },
    { tenant_id: 't1', item_id: '42', qty: '2' },
    { tenant_id: 't1', item_id: '99', qty: '' },
  ]

  it('builds a two-component update key for the edited snapshot row', () => {
    const rowA = buildRowId(realRows[0], 0, TABLE, PK)
    const { updates } = resolveAndBuild(
      realRows,
      { [rowA]: [{ field: 'qty', oldValue: '1', newValue: '5' }] },
      [],
    )
    expect(updates).toEqual([
      { key: { values: ['t1', '41'] }, changes: { qty: '5' } },
    ])
  })

  it('distinguishes rows sharing the first key component', () => {
    const id41 = buildRowId(realRows[1], 1, TABLE, PK)
    const id99 = buildRowId(realRows[2], 2, TABLE, PK)
    expect(id41).not.toBe(id99)

    const { updates } = resolveAndBuild(
      realRows,
      {
        [id41]: [{ field: 'qty', oldValue: '2', newValue: '7' }],
        [id99]: [{ field: 'qty', oldValue: '', newValue: '9' }],
      },
      [],
    )
    expect(updates.map((u) => u.key.values)).toEqual([
      ['t1', '42'],
      ['t1', '99'],
    ])
  })

  it('builds delete keys without parsing the row ID', () => {
    const idB = buildRowId(realRows[1], 1, TABLE, PK)
    const { deletes } = resolveAndBuild(realRows, {}, [idB])
    expect(deletes).toEqual([{ values: ['t1', '42'] }])
  })

  it('skips staged edits whose rowId cannot be resolved to a snapshot', () => {
    const { updates, deletes } = resolveAndBuild(
      realRows,
      {
        'items:pk:["ghost"]': [{ field: 'qty', oldValue: '', newValue: '1' }],
      },
      ['items:pk:["ghost","x"]'],
    )
    expect(updates).toEqual([])
    expect(deletes).toEqual([])
  })

  it('skips rows whose composite key is incomplete', () => {
    const brokenRows = [{ tenant_id: 't1', item_id: null, qty: '3' }]
    const brokenId = buildRowId(brokenRows[0], 0, TABLE, PK)
    const { updates, deletes } = resolveAndBuild(
      brokenRows,
      { [brokenId]: [{ field: 'qty', oldValue: '3', newValue: '4' }] },
      [brokenId],
    )
    expect(updates).toEqual([])
    expect(deletes).toEqual([])
  })
})

describe('no-PK read-only gating', () => {
  it('getRowKey returns null so mutation handlers can gate on it', () => {
    const row = { a: '1', b: '2' }
    expect(getRowKey(row, [])).toBeNull()
  })
})
