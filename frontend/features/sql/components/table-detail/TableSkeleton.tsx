import { useMemo } from 'react'

const ROW_GUTTER_WIDTH = 36
const MIN_COL_WIDTH = 60
const MAX_COL_WIDTH = 200
const DEFAULT_ROW_COUNT = 8

interface TableSkeletonProps {
  /**
   * Array of column names to determine column widths.
   * If empty, uses default 5 columns.
   */
  columns?: string[]
  /**
   * Number of skeleton rows to render.
   * Defaults to 8 rows.
   */
  rowCount?: number
}

/**
 * TableSkeleton — Visual placeholder while loading table data.
 *
 * Renders a grid of skeleton cells with varying widths to approximate
 * the expected table structure. Uses animate-pulse for a subtle loading effect.
 *
 * Layout:
 * - First column (gutter): narrow, fixed width, for row numbers
 * - Subsequent columns: variable widths based on column names
 *   - Short names (like IDs): narrower
 *   - Long names (like text fields): wider
 * - All skeleton cells have bg-bg-subtle with animate-pulse
 */
export function TableSkeleton({
  columns = [],
  rowCount = DEFAULT_ROW_COUNT,
}: TableSkeletonProps) {
  const columnWidths = useMemo(() => {
    // Generate deterministic widths based on column names
    return columns.length > 0
      ? columns.map((col) => {
          const baseWidth = MIN_COL_WIDTH + (col.length * 8)
          return Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, baseWidth))
        })
      : [80, 120, 150, 100, 90] // Default 5 columns
  }, [columns])

  const totalWidth = useMemo(
    () => ROW_GUTTER_WIDTH + columnWidths.reduce((sum, w) => sum + w, 0),
    [columnWidths]
  )

  const renderSkeletonCell = (key: string, width: number) => (
    <td
      key={key}
      className="animate-pulse bg-bg-subtle"
      style={{ width }}
    >
      <div className="mx-2 my-1 h-3 w-full rounded bg-bg-muted/50" />
    </td>
  )

  return (
    <div
      className="min-h-0 flex-1 overflow-hidden bg-bg-base"
      style={{ width: totalWidth }}
    >
      <table
        role="presentation"
        className="min-w-full border-collapse text-xs"
        style={{ tableLayout: 'fixed', width: totalWidth }}
      >
        <colgroup>
          <col style={{ width: ROW_GUTTER_WIDTH }} />
          {columnWidths.map((width, i) => (
            <col key={`col-${i}`} style={{ width }} />
          ))}
        </colgroup>

        <thead className="sticky top-0 z-20 bg-bg-muted text-text-muted">
          <tr>
            <th className="sticky left-0 z-30 border-b border-r border-border-default bg-bg-muted px-0 py-0.5">
              <div className="mx-auto h-3 w-8 rounded-full bg-bg-muted/50" />
            </th>
            {columnWidths.map((width, i) => (
              <th
                key={`header-${i}`}
                className="border-b border-r border-border-default bg-bg-muted px-2 py-1 text-left"
              >
                <div
                  className="h-3 w-full rounded-full bg-bg-muted/50"
                  style={{ width: Math.max(40, width - 16) }}
                />
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {Array.from({ length: rowCount }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              <td className="sticky left-0 z-10 border-b border-r border-border-default bg-bg-base p-0 text-center">
                <div className="mx-auto h-3 w-6 rounded-full bg-bg-muted/50" />
              </td>
              {columnWidths.map((width, colIndex) =>
                renderSkeletonCell(
                  `skeleton-${rowIndex}-${colIndex}`,
                  width
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
