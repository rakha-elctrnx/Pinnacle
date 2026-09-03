import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTableGridSelectionAndActions } from './useTableGridSelectionAndActions'
import { useTableSelectionStore } from '../store/tableSelectionStore'

describe('useTableGridSelectionAndActions context menu selection behavior', () => {
  beforeEach(() => {
    useTableSelectionStore.getState().reset()
  })

  it('preserves multi-cell selection when copying via context menu', async () => {
    const columns = ['id', 'name', 'age']
    const rows = [
      { id: '1', name: 'Alice', age: '30' },
      { id: '2', name: 'Bob', age: '25' },
    ]

    useTableSelectionStore
      .getState()
      .selectRange(
        { rowIndex: 0, columnId: 'name' },
        { rowIndex: 1, columnId: 'age' },
        columns,
      )

    const { result } = renderHook(() =>
      useTableGridSelectionAndActions({
        tableName: 'users',
        realTableColumns: columns,
        displayRows: rows,
        primaryKeyColumns: ['id'],
        tableColumnsMeta: [],
        stageEdit: vi.fn(),
        stageInsert: vi.fn(),
        stageDelete: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
        restoreActiveCellFocus: vi.fn(),
        handleDeleteRow: vi.fn(),
        handleCommit: vi.fn().mockResolvedValue(undefined),
        pendingInserts: [],
        detailDrawerRow: null,
        setDetailDrawerRow: vi.fn(),
        drawerAnimState: 'closed',
        scrollContainerRef: { current: null },
        setShortcutsOpen: vi.fn(),
      }),
    )

    const selectedRows = result.current.selectedCells
    expect(selectedRows.size).toBe(4) // 2 rows x 2 columns
  })
})
