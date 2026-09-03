// Read-only toolbar gating for tables without a primary key.
// Run with: pnpm vitest run frontend/features/sql/components/table-detail/TableToolbar.readonly.test.tsx
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TableToolbar } from './TableToolbar'

afterEach(cleanup)

function renderToolbar(
  overrides: Partial<Parameters<typeof TableToolbar>[0]> = {},
) {
  const props: Parameters<typeof TableToolbar>[0] = {
    filtersLength: 0,
    filterPanelOpen: false,
    setFilterPanelOpen: () => {},
    handleAddRow: () => {},
    activeCell: null,
    handleDeleteRow: () => {},
    handleRefresh: () => {},
    undoAvailable: false,
    handleUndo: () => {},
    redoAvailable: false,
    handleRedo: () => {},
    totalPending: 0,
    isCommitPending: false,
    readOnly: false,
    handleCommit: () => {},
    handleRevert: () => {},
    setShortcutsOpen: () => {},
    tableName: 'users',
    onExportData: () => {},
    ...overrides,
  }
  return render(<TableToolbar {...props} />)
}

describe('TableToolbar read-only mode', () => {
  it('shows the literal read-only notice exactly once when confirmed and disables Add/Delete/Commit', () => {
    renderToolbar({ readOnly: true, showReadOnlyNotice: true })
    expect(
      screen.getAllByText('Read-only: this table has no primary key'),
    ).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Add Row' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Delete Row' }).disabled).toBe(
      true,
    )
    expect(
      screen.getByRole('button', { name: 'Commit changes' }).disabled,
    ).toBe(true)
  })

  it('hides the notice while the no-PK verdict is still unconfirmed (loading)', () => {
    // readOnly is already true during a fetch, but the notice must wait
    // until the caller confirms the table really lacks a primary key.
    renderToolbar({ readOnly: true, showReadOnlyNotice: false })
    expect(
      screen.queryByText('Read-only: this table has no primary key'),
    ).toBeNull()
  })

  it('keeps Add Row enabled when the table has a primary key', () => {
    renderToolbar({ readOnly: false })
    expect(
      screen.queryByText('Read-only: this table has no primary key'),
    ).toBeNull()
    expect(screen.getByRole('button', { name: 'Add Row' }).disabled).toBe(false)
  })

  it('commit stays disabled with pending changes while read-only', () => {
    const handleCommit = vi.fn()
    renderToolbar({ readOnly: true, totalPending: 2, handleCommit })
    const commit = screen.getByRole('button', {
      name: 'Commit changes',
    }) as HTMLButtonElement
    expect(commit.disabled).toBe(true)
    fireEvent.click(commit)
    expect(handleCommit).not.toHaveBeenCalled()
  })

  it('delete row requires an active cell even with a primary key', () => {
    renderToolbar({
      readOnly: false,
      activeCell: null,
    })
    expect(screen.getByRole('button', { name: 'Delete Row' }).disabled).toBe(
      true,
    )
  })
})
