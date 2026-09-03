// Pagination footer zero/invalid state tests.
// Run with: pnpm vitest run frontend/features/sql/components/table-detail/TablePaginationFooter.test.tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TablePaginationFooter } from './TablePaginationFooter'

// vitest.config has no `globals`, so RTL auto-cleanup does not register.
afterEach(cleanup)

function renderFooter(
  overrides?: Partial<Parameters<typeof TablePaginationFooter>[0]>,
) {
  const props: Parameters<typeof TablePaginationFooter>[0] = {
    page: 1,
    pageSize: 50,
    setPage: () => {},
    setPageSize: () => {},
    totalRowCount: 0,
    totalPending: 0,
    ...overrides,
  }
  return render(<TablePaginationFooter {...props} />)
}

describe('TablePaginationFooter', () => {
  it('shows the exact empty-table label for zero rows', () => {
    renderFooter({ totalRowCount: 0 })
    expect(screen.getByText('Showing 0 of 0 records')).toBeTruthy()
  })
  it('shows Page 1 of 1 for an empty table and disables both buttons', () => {
    renderFooter({ totalRowCount: 0, page: 3 })
    // The clamped display must read "Page 1 of 1" despite stale page=3.
    expect(screen.getByText(/Page .* of/).textContent).toBe('Page 1 of 1')
    // Both nav buttons are disabled: prev clamps at page 1, next at the
    // single (empty) page.
    const [prev, next] = screen.getAllByRole('button') as HTMLButtonElement[]
    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(true)
  })
  it('disables previous on page 1 and next on the last page', () => {
    const { rerender } = render(
      <TablePaginationFooter
        page={1}
        pageSize={50}
        setPage={() => {}}
        setPageSize={() => {}}
        totalRowCount={120}
        totalPending={0}
      />,
    )
    const [prev, next] = screen.getAllByRole('button') as HTMLButtonElement[]
    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(false)

    rerender(
      <TablePaginationFooter
        page={3}
        pageSize={50}
        setPage={() => {}}
        setPageSize={() => {}}
        totalRowCount={120}
        totalPending={0}
      />,
    )
    const [prev2, next2] = screen.getAllByRole('button') as HTMLButtonElement[]
    expect(prev2.disabled).toBe(false)
    expect(next2.disabled).toBe(true)
  })

  it('clamps a stale page past the last page to Page N of N', () => {
    renderFooter({ page: 9, pageSize: 50, totalRowCount: 60 })
    expect(screen.getByText(/Page .* of/).textContent).toBe('Page 2 of 2')
  })

  it('appends pending count to the record label', () => {
    renderFooter({ page: 1, pageSize: 10, totalRowCount: 25, totalPending: 2 })
    expect(
      screen.getByText(/Showing 1–10 of 25 records \(2 pending\)/),
    ).toBeTruthy()
  })

  it('resets to page 1 when the page size changes', () => {
    let currentPage = 4
    const setPage = (p: number | ((prev: number) => number)) => {
      currentPage = typeof p === 'function' ? p(currentPage) : p
    }
    renderFooter({
      page: currentPage,
      setPage,
      pageSize: 10,
      totalRowCount: 500,
    })
    const rowsSelect = screen.getByRole('combobox') as HTMLSelectElement
    fireEvent.change(rowsSelect, { target: { value: '100' } })
    expect(currentPage).toBe(1)
  })
})
