import { PAGE_SIZE_OPTIONS } from '../../logic/tableDetailPageHelpers'

interface TablePaginationFooterProps {
  page: number
  pageSize: number
  setPage: (p: number | ((prev: number) => number)) => void
  setPageSize: (ps: number) => void
  totalRowCount: number
  totalPending: number
}

export function TablePaginationFooter({
  page,
  pageSize,
  setPage,
  setPageSize,
  totalRowCount,
  totalPending,
}: TablePaginationFooterProps) {
  return (
    <div className="flex items-center justify-between border-t border-border-default px-3 py-2">
      <span className="text-micro text-text-muted">
        {(() => {
          const start = (page - 1) * pageSize + 1
          const end = Math.min(page * pageSize, totalRowCount)
          const label = `Showing ${start}–${end} of ${totalRowCount} record${totalRowCount !== 1 ? 's' : ''}`
          return totalPending > 0 ? `${label} (${totalPending} pending)` : label
        })()}
      </span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-micro text-text-muted">
          Rows
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value))
              setPage(1)
            }}
            className="rounded border border-border-default bg-bg-base px-1 py-0.5 text-micro text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-micro text-text-muted transition-colors hover:bg-bg-muted disabled:opacity-30"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ‹
          </button>
          <span className="text-micro text-text-muted">
            Page {page} of {Math.ceil(totalRowCount / pageSize)}
          </span>
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-micro text-text-muted transition-colors hover:bg-bg-muted disabled:opacity-30"
            disabled={page >= Math.ceil(totalRowCount / pageSize)}
            onClick={() => setPage((p) => p + 1)}
          >
            ›
          </button>
        </div>
      </div>
    </div>
  )
}
