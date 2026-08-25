// Export routing: the toolbar's single Export data action must delegate the
// current table name to the data-explorer context export handler
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TableToolbar } from './TableToolbar'

afterEach(cleanup)


function renderToolbar(overrides: Partial<Parameters<typeof TableToolbar>[0]> = {}) {
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
    tableName: 'orders',
    onExportData: () => {},
    ...overrides,
  }
  return render(<TableToolbar {...props} />)
}

describe('TableToolbar export routing', () => {
  it('renders a single Export data action (no CSV/JSON dropdown)', () => {
    renderToolbar()
    expect(screen.getByRole('button', { name: 'Export data' })).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Export as CSV' }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Export as JSON' }),
    ).toBeNull()
  })

  it('passes the current table name to the context export handler', () => {
    const onExportData = vi.fn()
    renderToolbar({ tableName: 'order_items', onExportData })
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }))
    expect(onExportData).toHaveBeenCalledTimes(1)
    expect(onExportData).toHaveBeenCalledWith('order_items')
  })

  it('disables export when no table is selected', () => {
    const onExportData = vi.fn()
    renderToolbar({ tableName: '', onExportData })
    const button = screen.getByRole('button', {
      name: 'Export data',
    }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onExportData).not.toHaveBeenCalled()
  })

  it('export stays available for read-only tables (full-table read)', () => {
    const onExportData = vi.fn()
    renderToolbar({ readOnly: true, tableName: 'no_pk_table', onExportData })
    const button = screen.getByRole('button', {
      name: 'Export data',
    }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    expect(onExportData).toHaveBeenCalledWith('no_pk_table')
  })

  it('export works while pending changes exist (does not stage or clear them)', () => {
    const onExportData = vi.fn()
    const handleCommit = vi.fn()
    renderToolbar({
      totalPending: 3,
      tableName: 'orders',
      onExportData,
      handleCommit,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }))
    expect(onExportData).toHaveBeenCalledTimes(1)
    expect(handleCommit).not.toHaveBeenCalled()
  })
})
