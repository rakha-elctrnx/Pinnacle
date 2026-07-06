import { useEffect, useMemo } from 'react'
import { Inbox } from 'lucide-react'
import {
  useColumnResizer,
  calculateAutoColumnWidths,
  MIN_COL_WIDTH,
  MAX_COL_WIDTH,
} from '../hooks/useColumnResizer'

const ROW_GUTTER_WIDTH = 36

interface DataGridProps {
  columns: string[]
  rows: Record<string, unknown>[]
  columnsMetadata?: Array<{ columnName: string; dataType: string }>
  emptyMessage?: string
}

export function DataGrid({
  columns,
  rows,
  columnsMetadata = [],
  emptyMessage = 'No data',
}: DataGridProps) {
  const autoColumnWidths = useMemo(
    () =>
      calculateAutoColumnWidths({
        columns,
        previewRows: rows.slice(0, 50),
        columnsMetadata,
      }),
    [columns, rows, columnsMetadata],
  )

  const { widths, onMouseDown, syncWidths, handleDoubleClick } = useColumnResizer({
    initialWidths: autoColumnWidths,
  })

  useEffect(() => {
    syncWidths(autoColumnWidths)
  }, [autoColumnWidths, syncWidths])

  const boundedWidths = useMemo(
    () => widths.map((w) => Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, w))),
    [widths],
  )

  const tableWidth = useMemo(
    () => ROW_GUTTER_WIDTH + boundedWidths.reduce((sum, w) => sum + w, 0),
    [boundedWidths],
  )

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-auto bg-bg-base [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-text-muted [&::-webkit-scrollbar-track]:bg-bg-muted">
      <table
        className="min-w-full border-collapse text-xs"
        style={{ tableLayout: 'fixed', width: tableWidth }}
      >
        <colgroup>
          <col style={{ width: ROW_GUTTER_WIDTH }} />
          {boundedWidths.map((width, i) => (
            <col key={columns[i] ?? i} style={{ width }} />
          ))}
        </colgroup>

        <thead className="sticky top-0 z-20 bg-bg-muted text-text-muted shadow-[0_1px_0_0_var(--color-border-default)]">
          <tr>
            <th className="sticky left-0 z-30 border-b border-r border-border-default bg-bg-muted px-0 py-0.5" />
            {columns.map((col, i) => {
              const meta = columnsMetadata.find((m) => m.columnName === col)
              return (
                <th
                  key={col}
                  className="group relative border-b border-r border-border-default bg-bg-muted px-2 py-1 text-left whitespace-nowrap"
                >
                  <div className="flex flex-col">
                    <span className="truncate text-label text-text-secondary">{col}</span>
                    {meta?.dataType && (
                      <span className="truncate text-micro text-text-muted">{meta.dataType}</span>
                    )}
                  </div>
                  {/* Resize handle */}
                  <span
                    className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize opacity-0 transition-opacity hover:bg-primary/30 group-hover:opacity-100"
                    onMouseDown={(e) => onMouseDown(i, e)}
                    onDoubleClick={() => handleDoubleClick(i, rows, col, meta?.dataType)}
                  />
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="px-2 py-0">
                <div className="flex flex-col items-center justify-center gap-4 py-16">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-muted/50">
                    <Inbox className="h-8 w-8 text-text-secondary" strokeWidth={1.5} />
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-text-primary">No data</h3>
                    <p className="text-xs text-text-muted">{emptyMessage}</p>
                  </div>
                </div>
              </td>
            </tr>
          )}
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="text-text-primary transition-colors hover:bg-bg-muted/70"
            >
              <td className="sticky left-0 z-10 border-b border-r border-border-default bg-bg-base p-0 text-center text-micro text-text-muted select-none">
                {rowIndex + 1}
              </td>
              {columns.map((col) => (
                <td
                  key={`${rowIndex}-${col}`}
                  className="overflow-hidden border-b border-r border-border-default px-2 py-1 text-text-primary"
                >
                  <span className="block truncate">{String(row[col] ?? '')}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
