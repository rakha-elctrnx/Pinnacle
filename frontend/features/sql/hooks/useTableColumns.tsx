import { useMemo, useEffect } from 'react'
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Table as TanStackTable,
} from '@tanstack/react-table'
import { useColumnResizer, calculateAutoColumnWidths } from './useColumnResizer'
import {
  isPrimaryKeyColumn,
  buildRowId,
  MIN_COLUMN_WIDTH,
  MAX_COLUMN_WIDTH,
  ROW_GUTTER_WIDTH,
} from '../logic/tableDetailPageHelpers'
import { EditableCell } from '../components/table-cells/EditableCell'
import { ChevronUp, ChevronDown, ArrowUpDown, Key, Filter } from 'lucide-react'
import type {
  TableRow,
  ColumnMetadata,
  FilterCondition,
} from '../types/tableDetail'
import type { EditableColumnMeta } from '../store/tableEditStore'

interface UseTableColumnsProps {
  tableName: string
  realTableColumns: string[]
  tableColumnsMeta: ColumnMetadata[]
  filters: FilterCondition[]
  sortColumn: string | null
  sortDirection: 'asc' | 'desc' | undefined
  handleSortColumn: (column: string) => void
  handleColumnFilterClick: (column: string) => void
  displayRows: TableRow[]
  editableColumnMetaMap: Record<string, EditableColumnMeta>
  pkColumn: string | undefined
}

interface UseTableColumnsReturn {
  columns: ColumnDef<TableRow>[]
  table: TanStackTable<TableRow>
  tableWidth: number
  boundedWidths: number[]
  widths: number[]
}

export function useTableColumns({
  tableName,
  realTableColumns,
  tableColumnsMeta,
  filters,
  sortColumn,
  sortDirection,
  handleSortColumn,
  handleColumnFilterClick,
  displayRows,
  editableColumnMetaMap,
  pkColumn,
}: UseTableColumnsProps): UseTableColumnsReturn {
  // ── Column widths auto-calculation ──────────────────────────────────────
  const autoColumnWidths = useMemo(
    () =>
      calculateAutoColumnWidths({
        columns: realTableColumns,
        previewRows: displayRows,
        columnsMetadata: tableColumnsMeta.map((column) => ({
          columnName: column.columnName,
          dataType: column.dataType ?? '',
        })),
      }),
    [realTableColumns, displayRows, tableColumnsMeta],
  )

  const { widths, onMouseDown, syncWidths, handleDoubleClick } =
    useColumnResizer({
      initialWidths: autoColumnWidths,
    })

  const boundedWidths = useMemo(
    () =>
      widths.map((width) =>
        Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)),
      ),
    [widths],
  )

  const tableWidth = useMemo(
    () =>
      ROW_GUTTER_WIDTH +
      boundedWidths.reduce((total, width) => total + width, 0),
    [boundedWidths],
  )

  // Keep widths in sync with auto-sized values when data/columns change.
  useEffect(() => {
    syncWidths(autoColumnWidths)
  }, [tableName, autoColumnWidths, syncWidths])

  // ── Column definitions mapping ──────────────────────────────────────────
  const columns = useMemo<ColumnDef<TableRow>[]>(
    () =>
      realTableColumns.map((column, columnIndex) => ({
        id: column,
        accessorKey: column,
        header: () => {
          const columnMetadata = tableColumnsMeta.find(
            (item) => item.columnName === column,
          )
          const dataType = columnMetadata?.dataType
          const isPrimaryKey = isPrimaryKeyColumn(columnMetadata)
          const hasActiveFilter = filters.some((f) => f.column === column)
          const isSorted = sortColumn === column
          return (
            <div className="group/hdr relative flex min-w-0 items-center overflow-hidden">
              {/* ── Column label — takes full width ── */}
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-2 text-left"
                onClick={() => handleSortColumn(column)}
              >
                {isPrimaryKey && (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/10">
                    <Key size={10} className="text-primary" />
                  </span>
                )}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex min-w-0 items-center gap-1">
                    <span
                      className={`truncate text-xs leading-tight ${isSorted ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary'}`}
                    >
                      {column}
                    </span>
                    {/* Sort arrow — always visible when sorted, sits next to name */}
                    {isSorted &&
                      (sortDirection === 'asc' ? (
                        <ChevronUp
                          size={12}
                          className="shrink-0 text-primary"
                        />
                      ) : (
                        <ChevronDown
                          size={12}
                          className="shrink-0 text-primary"
                        />
                      ))}
                  </div>
                  {dataType && (
                    <span className="truncate text-[10px] leading-tight text-text-muted">
                      {dataType.toLowerCase()}
                    </span>
                  )}
                </div>
              </button>
              {/* ── Hover actions overlay — right-aligned, hidden by default ── */}
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 bg-linear-to-l from-bg-muted from-60% to-transparent pr-1.5 pl-4 opacity-0 transition-opacity group-hover/hdr:pointer-events-auto group-hover/hdr:opacity-100">
                <button
                  type="button"
                  className="rounded p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSortColumn(column)
                  }}
                  aria-label={
                    isSorted
                      ? `Sort ${sortDirection === 'asc' ? 'descending' : 'clear'}`
                      : `Sort by ${column}`
                  }
                >
                  {isSorted ? (
                    sortDirection === 'asc' ? (
                      <ChevronUp size={13} className="text-primary" />
                    ) : (
                      <ChevronDown size={13} className="text-primary" />
                    )
                  ) : (
                    <ArrowUpDown size={13} />
                  )}
                </button>
                <button
                  type="button"
                  className={`rounded p-1 transition-colors hover:bg-bg-hover ${
                    hasActiveFilter
                      ? 'text-primary'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleColumnFilterClick(column)
                  }}
                  aria-label={
                    hasActiveFilter
                      ? `Filter active on ${column}`
                      : `Filter ${column}`
                  }
                >
                  <Filter size={13} />
                </button>
              </div>
              {/* ── Filter dot — tiny persistent indicator when filter is active ── */}
              {hasActiveFilter && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary group-hover/hdr:hidden" />
              )}
              {/* ── Resize handle ── */}
              <span
                role="separator"
                aria-label={`Resize ${column}`}
                className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/60"
                onMouseDown={(event) => onMouseDown(columnIndex, event)}
                onDoubleClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  handleDoubleClick(columnIndex, displayRows, column, dataType)
                }}
              />
            </div>
          )
        },
        cell: (context) => (
          <EditableCell
            context={context}
            columnMeta={editableColumnMetaMap[column]}
            getRowId={(_row, index) =>
              buildRowId(_row, index, tableName, pkColumn)
            }
          />
        ),
      })),
    [
      handleDoubleClick,
      onMouseDown,
      handleSortColumn,
      handleColumnFilterClick,
      sortColumn,
      sortDirection,
      filters,
      realTableColumns,
      tableColumnsMeta,
      editableColumnMetaMap,
      tableName,
      pkColumn,
      displayRows,
    ],
  )

  const table = useReactTable({
    data: displayRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (_row, index) => buildRowId(_row, index, tableName, pkColumn),
  })

  return {
    columns,
    table,
    tableWidth,
    boundedWidths,
    widths,
  }
}
