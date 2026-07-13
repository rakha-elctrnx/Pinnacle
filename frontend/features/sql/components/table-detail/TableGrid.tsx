import { flexRender, type Table as TanStackTable } from '@tanstack/react-table'
import type { CSSProperties, RefObject, MutableRefObject } from 'react'
import type { TableRow, ColumnMetadata } from '../../types/tableDetail'
import {
  getPinnedLeftOffset,
  buildRowId,
  ROW_GUTTER_WIDTH,
} from '../../logic/tableDetailPageHelpers'
import type { CellPosition } from '../../store/tableSelectionStore'
import { cellKey } from '../../store/tableSelectionStore'
import type { CellEdit } from '../../store/tableEditStore'

interface TableGridProps {
  scrollContainerRef: RefObject<HTMLDivElement | null>
  drawerAnimState: string
  drawerWidth: number
  isResizingDetailDrawer: boolean
  tableName: string
  tableWidth: number
  realTableColumns: string[]
  boundedWidths: number[]
  table: TanStackTable<TableRow>
  tableColumnsMeta: ColumnMetadata[]
  activeCell: CellPosition | null
  selectedCells: Set<string>
  pendingDeletes: string[]
  pendingEdits: Record<string, CellEdit[]>
  pkColumn: string | undefined
  handleCellMouseDown: (
    rowIndex: number,
    columnId: string,
    e: React.MouseEvent,
  ) => void
  handleCellMouseEnter: (rowIndex: number, columnId: string) => void
  handleCellMouseUp: () => void
  handleGutterMouseDown: (rowIndex: number, e: React.MouseEvent) => void
  setContextMenu: (menu: { x: number; y: number } | null) => void
  contextRowIndexRef: MutableRefObject<number>
}

export function TableGrid({
  scrollContainerRef,
  drawerAnimState,
  drawerWidth,
  isResizingDetailDrawer,
  tableName,
  tableWidth,
  realTableColumns,
  boundedWidths,
  table,
  tableColumnsMeta,
  activeCell,
  selectedCells,
  pendingDeletes,
  pendingEdits,
  pkColumn,
  handleCellMouseDown,
  handleCellMouseEnter,
  handleCellMouseUp,
  handleGutterMouseDown,
  setContextMenu,
  contextRowIndexRef,
}: TableGridProps) {
  return (
    <div
      ref={scrollContainerRef}
      tabIndex={0}
      className="scrollbar-thin min-h-0 flex-1 overflow-auto border border-border-default outline-none focus:ring-1 focus:ring-primary [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-text-muted [&::-webkit-scrollbar-track]:bg-bg-muted"
      style={{
        marginRight:
          drawerAnimState !== 'closed' && drawerAnimState !== 'exiting'
            ? drawerWidth
            : 0,
        transition: isResizingDetailDrawer
          ? 'none'
          : 'margin-right 150ms ease-out',
      }}
    >
      <table
        role="grid"
        aria-label={`Table data for ${tableName}`}
        className="min-w-full border-collapse text-xs"
        style={{ tableLayout: 'fixed', width: tableWidth }}
      >
        <colgroup>
          <col style={{ width: ROW_GUTTER_WIDTH }} />
          {boundedWidths.map((width, index) => (
            <col
              key={`col-${realTableColumns[index] ?? index}`}
              style={{ width }}
            />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-20 bg-bg-muted text-text-muted shadow-[0_1px_0_0_var(--color-border-default)]">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} role="row">
              <th
                role="columnheader"
                className="sticky left-0 z-30 border-b border-r border-border-default bg-bg-muted px-0 py-0.5"
              />
              {headerGroup.headers.map((header, columnIndex) => {
                const columnId = header.column.id
                const stickyLeft = getPinnedLeftOffset(
                  columnIndex,
                  realTableColumns,
                  boundedWidths,
                  tableColumnsMeta,
                )
                const style: CSSProperties =
                  stickyLeft == null ? {} : { left: stickyLeft }

                return (
                  <th
                    key={header.id}
                    role="columnheader"
                    className={[
                      'group relative border-b border-r border-border-default px-0 py-0 text-left whitespace-nowrap',
                      stickyLeft == null
                        ? 'bg-bg-muted'
                        : 'sticky z-20 bg-bg-muted shadow-[1px_0_0_0_var(--color-border-default)]',
                    ].join(' ')}
                    style={style}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                    <span className="sr-only">{columnId}</span>
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 && (
            <tr role="row">
              <td
                role="gridcell"
                colSpan={realTableColumns.length + 1 || 1}
                className="px-2 py-0"
              >
                <div className="h-16" />
              </td>
            </tr>
          )}
          {table.getRowModel().rows.map((row) => {
            const rowIndex = row.index
            const rowHasActiveCell = activeCell?.rowIndex === rowIndex
            const rowId = buildRowId(
              row.original,
              row.index,
              tableName,
              pkColumn,
            )
            const isDeletedRow = pendingDeletes.includes(rowId)
            const hasRowEdits = rowId in pendingEdits
            const isInsertedRow = rowId.startsWith('__insert__')
            const hasSelectedCell = [...selectedCells].some(
              (k) => Number(k.split(':')[0]) === rowIndex,
            )
            const editedFields = new Set(
              pendingEdits[rowId]?.map((e) => e.field) || [],
            )

            return (
              <tr
                key={row.id}
                role="row"
                className={[
                  'text-text-primary transition-colors',
                  rowHasActiveCell ? 'bg-primary-subtle' : '',
                  hasSelectedCell && !rowHasActiveCell ? 'bg-selection-bg' : '',
                  !rowHasActiveCell && !hasSelectedCell
                    ? 'hover:bg-bg-muted/70'
                    : '',
                  isDeletedRow
                    ? 'bg-red-100 dark:bg-red-900/25 line-through'
                    : '',
                  isInsertedRow ? 'bg-green-100 dark:bg-green-900/25' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onContextMenu={(e) => {
                  e.preventDefault()
                  contextRowIndexRef.current = rowIndex
                  setContextMenu({ x: e.clientX, y: e.clientY })
                }}
              >
                <td
                  role="gridcell"
                  className={[
                    'sticky left-0 z-10 cursor-pointer border-b border-r border-border-default p-0 text-center text-micro select-none',
                    rowHasActiveCell || hasSelectedCell
                      ? 'bg-primary-subtle text-primary'
                      : 'bg-bg-base text-text-muted',
                  ].join(' ')}
                  onMouseDown={(e) => handleGutterMouseDown(rowIndex, e)}
                  aria-label={`Select row ${rowIndex + 1}`}
                >
                  <div className="flex items-center justify-center gap-1">
                    {(hasRowEdits || isDeletedRow || isInsertedRow) && (
                      <span
                        className={[
                          'inline-block h-1.5 w-1.5 rounded-full',
                          isDeletedRow
                            ? 'bg-red-500'
                            : isInsertedRow
                              ? 'bg-green-500'
                              : 'bg-yellow-500',
                        ].join(' ')}
                        aria-label="Pending changes"
                      />
                    )}
                    <span>{rowIndex + 1}</span>
                  </div>
                </td>
                {row.getVisibleCells().map((cell, columnIndex) => {
                  const stickyLeft = getPinnedLeftOffset(
                    columnIndex,
                    realTableColumns,
                    boundedWidths,
                    tableColumnsMeta,
                  )
                  const style: CSSProperties =
                    stickyLeft == null ? {} : { left: stickyLeft }
                  const columnId = cell.column.id
                  const isActiveCellHere =
                    activeCell?.rowIndex === rowIndex &&
                    activeCell?.columnId === columnId
                  const isSelectedCell = selectedCells.has(
                    cellKey(rowIndex, columnId),
                  )
                  const isDeletedHere = isDeletedRow
                  const isCellDirty = editedFields.has(columnId)

                  let selectionBoxShadow = ''
                  if (isSelectedCell && selectedCells.size > 1) {
                    let minRow = Infinity,
                      maxRow = -Infinity
                    let minColIdx = Infinity,
                      maxColIdx = -Infinity
                    const colIndexMap = new Map<string, number>()
                    realTableColumns.forEach((c, i) => colIndexMap.set(c, i))
                    for (const key of selectedCells) {
                      const [r, c] = key.split(':')
                      const ri = Number(r)
                      const ci = colIndexMap.get(c) ?? -1
                      if (ri < minRow) minRow = ri
                      if (ri > maxRow) maxRow = ri
                      if (ci < minColIdx) minColIdx = ci
                      if (ci > maxColIdx) maxColIdx = ci
                    }
                    const colIdx = colIndexMap.get(columnId) ?? -1
                    const isTop = rowIndex === minRow
                    const isBottom = rowIndex === maxRow
                    const isLeft = colIdx === minColIdx
                    const isRight = colIdx === maxColIdx
                    const shadows: string[] = []
                    if (isTop)
                      shadows.push('inset 0 2px 0 0 var(--color-primary)')
                    if (isBottom)
                      shadows.push('inset 0 -2px 0 0 var(--color-primary)')
                    if (isLeft)
                      shadows.push('inset 2px 0 0 0 var(--color-primary)')
                    if (isRight)
                      shadows.push('inset -2px 0 0 0 var(--color-primary)')
                    selectionBoxShadow = shadows.join(', ')
                  }
                  return (
                    <td
                      key={cell.id}
                      role="gridcell"
                      data-cell-row={rowIndex}
                      data-cell-col={columnId}
                      className={[
                        'overflow-hidden border-b border-r border-border-default p-0 select-none',
                        stickyLeft == null ? '' : 'sticky z-10 bg-bg-base',
                        isActiveCellHere
                          ? 'ring-2 ring-inset ring-primary z-5'
                          : isSelectedCell
                            ? 'bg-selection-bg'
                            : isCellDirty && !isInsertedRow
                              ? 'bg-yellow-100 dark:bg-yellow-900/25'
                              : '',
                        rowHasActiveCell && !isDeletedHere
                          ? 'text-primary'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{
                        ...style,
                        boxShadow: selectionBoxShadow || undefined,
                      }}
                      onMouseDown={(e) =>
                        handleCellMouseDown(rowIndex, columnId, e)
                      }
                      onMouseEnter={() =>
                        handleCellMouseEnter(rowIndex, columnId)
                      }
                      onMouseUp={handleCellMouseUp}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        contextRowIndexRef.current = rowIndex
                        setContextMenu({ x: e.clientX, y: e.clientY })
                      }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
