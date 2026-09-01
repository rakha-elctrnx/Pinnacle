// normalizeCellValue + valuesEqual + stageEdit coalescing.
// Run with: pnpm vitest run frontend/features/sql/store/tableEditStore.editing.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  useTableEditStore,
  normalizeCellValue,
  validateCellValue,
  valuesEqual,
} from './tableEditStore'
import type { EditableColumnMeta } from './tableEditStore'

const nullableText: EditableColumnMeta = {
  columnName: 'note',
  dataType: 'text',
  isNullable: true,
  maxLength: null,
}
const requiredVarchar: EditableColumnMeta = {
  columnName: 'name',
  dataType: 'character varying',
  isNullable: false,
  maxLength: 5,
}
const boolCol: EditableColumnMeta = {
  columnName: 'active',
  dataType: 'boolean',
  isNullable: true,
  maxLength: null,
}

describe('normalizeCellValue', () => {
  it('converts empty string to null only when nullable', () => {
    expect(normalizeCellValue('', nullableText)).toBeNull()
    expect(normalizeCellValue('', requiredVarchar)).toBe('')
  })

  it('maps accepted boolean literals to real booleans for boolean columns', () => {
    expect(normalizeCellValue('true', boolCol)).toBe(true)
    expect(normalizeCellValue('YES', boolCol)).toBe(true)
    expect(normalizeCellValue('0', boolCol)).toBe(false)
    expect(normalizeCellValue('no', boolCol)).toBe(false)
  })

  it('does not map boolean literals on non-boolean columns', () => {
    expect(normalizeCellValue('true', nullableText)).toBe('true')
  })

  it('preserves input strings to avoid BIGINT/DECIMAL precision loss', () => {
    const big =
      '9007199254740993' // Number.MAX_SAFE_INTEGER + 1 — loses precision as number
    expect(normalizeCellValue(big, nullableText)).toBe(big)
    expect(normalizeCellValue('0.30000000000000004', nullableText)).toBe(
      '0.30000000000000004',
    )
  })

  it('keeps literal "null" a string and passes real null through', () => {
    expect(normalizeCellValue('null', nullableText)).toBe('null')
    expect(normalizeCellValue(null, nullableText)).toBeNull()
  })
})

describe('validateCellValue metadata awareness', () => {
  it('rejects empty values for NOT NULL columns', () => {
    expect(validateCellValue('', requiredVarchar)).toMatch(/NOT NULL/)
    expect(validateCellValue(null, requiredVarchar)).toMatch(/NOT NULL/)
  })

  it('enforces maxLength', () => {
    expect(validateCellValue('abcdef', requiredVarchar)).toMatch(
      /max length of 5/,
    )
    expect(validateCellValue('abcde', requiredVarchar)).toBeNull()
  })
})

describe('valuesEqual', () => {
  it('distinguishes null from the string "null"', () => {
    expect(valuesEqual(null, 'null')).toBe(false)
  })

  it('treats null and undefined as equal', () => {
    expect(valuesEqual(null, undefined)).toBe(true)
  })

  it('distinguishes booleans from their string forms and numbers from strings', () => {
    expect(valuesEqual(false, 'false')).toBe(false)
    expect(valuesEqual(1, '1')).toBe(false)
    expect(valuesEqual(true, true)).toBe(true)
  })

  it('deep-compares arrays and objects via stable JSON serialization', () => {
    expect(valuesEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true)
    expect(valuesEqual([1, 2], [2, 1])).toBe(false)
  })

  it('treats equivalent timestamp representations as equal', () => {
    expect(
      valuesEqual(
        '2026-08-21 08:15:00.843000 UTC',
        '2026-08-21 08:15:00.843000 +00:00',
      ),
    ).toBe(true)
    expect(
      valuesEqual(
        '2026-08-12 15:41:50.846 +00:00',
        '2026-08-12 15:41:50.846000 +00:00',
      ),
    ).toBe(true)
    expect(
      valuesEqual(
        '2026-08-21T08:15:00.843000+00:00',
        '2026-08-21 08:15:00.843000 +00:00',
      ),
    ).toBe(true)
    expect(
      valuesEqual(
        '2026-08-21 08:15:00.843000 UTC',
        '2026-08-21 09:15:00.843000 UTC',
      ),
    ).toBe(false)
  })
})

describe('stageEdit coalesceUndo', () => {
  beforeEach(() => useTableEditStore.getState().clearAll())

  it('replaces the newest undo action for the same row+field while preserving prevNewValue', () => {
    const s = useTableEditStore.getState()
    // Original DB value is 'a'; user types 'b' then 'c' in the drawer.
    s.stageEdit('r1', 'f', 'a', 'b', { coalesceUndo: true })
    s.stageEdit('r1', 'f', 'a', 'c', { coalesceUndo: true })

    const state = useTableEditStore.getState()
    expect(state.undoStack).toHaveLength(1) // typing never evicts history
    const action = state.undoStack[0]!
    expect(action.newValue).toBe('c')
    expect(action.prevNewValue).toBeUndefined() // original preserved
    // Single pending edit holding the newest value.
    expect(state.pendingEdits['r1']).toEqual([
      { field: 'f', oldValue: 'a', newValue: 'c' },
    ])
  })

  it('undo after coalesced typing restores the pre-edit value in one step', () => {
    const store = useTableEditStore
    store.getState().stageEdit('r1', 'f', 'a', 'x', { coalesceUndo: true })
    store.getState().stageEdit('r1', 'f', 'a', 'xy', { coalesceUndo: true })
    store.getState().undo()

    const state = store.getState()
    expect(state.pendingEdits['r1']).toBeUndefined()
    // Redo replays the coalesced action forward.
    store.getState().redo()
    expect(store.getState().pendingEdits['r1']).toEqual([
      { field: 'f', oldValue: 'a', newValue: 'xy' },
    ])
  })

  it('keeps discrete undo actions without coalesceUndo (grid commits)', () => {
    const store = useTableEditStore
    store.getState().stageEdit('r1', 'f', 'a', 'b')
    store.getState().stageEdit('r1', 'f', 'a', 'c')
    expect(store.getState().undoStack).toHaveLength(2)
  })

  it('drops the edit when typing returns to the original value under coalescing', () => {
    const store = useTableEditStore
    store.getState().stageEdit('r1', 'f', 'a', 'ab', { coalesceUndo: true })
    store.getState().stageEdit('r1', 'f', 'a', 'a', { coalesceUndo: true })
    const state = store.getState()
    expect(state.pendingEdits['r1']).toBeUndefined()
    expect(state.undoStack).toHaveLength(0)
  })
})
