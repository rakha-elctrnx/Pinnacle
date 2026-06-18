import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TableInfoTab } from '../../../types'
import type { TableIndex } from '../../../hooks/useExplorerData'
import { CenteredLoadingState } from '../../shared/CenteredLoadingState'

interface TableBrowserProps {
  selectedTable: string | null
  tableInfoTab: TableInfoTab
  onTableInfoTabChange: (tab: TableInfoTab) => void
  tableDataLoading: boolean
  displayColumns: string[]
  displayRows: Record<string, string>[]
  realTableStructure: Record<string, string>[]
  realTableIndexes: TableIndex[]
  embedded?: boolean
}

const TABLE_INFO_TABS: TableInfoTab[] = [
  'data',
  'structure',
  'indexes',
  'relationships',
]

const DEFAULT_COL_WIDTH = 150
const MIN_COL_WIDTH = 80
const MAX_COL_WIDTH = 360
const ESTIMATED_CHAR_WIDTH_PX = 8
const COLUMN_HORIZONTAL_PADDING_PX = 32

function useColumnResizer(initialWidths: number[]) {
  const [widths, setWidths] = useState<number[]>(() =>
    [...initialWidths],
  )
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const onMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      startXRef.current = e.clientX
      startWidthRef.current = widths[index] ?? DEFAULT_COL_WIDTH

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startXRef.current
        const newWidth = Math.min(
          MAX_COL_WIDTH,
          Math.max(MIN_COL_WIDTH, startWidthRef.current + delta),
        )
        setWidths((prev) => {
          const next = [...prev]
          next[index] = newWidth
          return next
        })
      }

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [widths],
  )

  // Sync widths when auto-sized result changes.
  const syncWidths = useCallback((nextWidths: number[]) => {
    setWidths((prev) => {
      if (prev.length !== nextWidths.length) return [...nextWidths]
      const hasDiff = prev.some((width, index) => width !== nextWidths[index])
      return hasDiff ? [...nextWidths] : prev
    })
  }, [])

  return { widths, onMouseDown, syncWidths }
}

const MAX_DISPLAY_ROWS = 100

export function TableBrowser({
  tableInfoTab,
  onTableInfoTabChange,
  tableDataLoading,
  displayColumns,
  displayRows,
  realTableStructure,
  realTableIndexes,
  embedded = false,
}: TableBrowserProps) {
  const containerClass = embedded
    ? 'h-full min-h-0 flex flex-col overflow-hidden'
    : 'rounded-xl border border-outline-variant bg-white p-3'

  const colTypeMap = useMemo(
    () =>
      Object.fromEntries(
        realTableStructure.map((col) => [
          String(col.column_name ?? col.Field ?? ''),
          String(col.data_type ?? col.Type ?? ''),
        ]),
      ),
    [realTableStructure],
  )

  const previewRows = useMemo(
    () => displayRows.slice(0, MAX_DISPLAY_ROWS),
    [displayRows],
  )

  const autoColumnWidths = useMemo(
    () =>
      displayColumns.map((column) => {
        const maxValueLength = previewRows.reduce((longest, row) => {
          const valueText = row[column] == null ? '(null)' : String(row[column])
          return Math.max(longest, valueText.length)
        }, 0)

        const maxChars = Math.max(
          column.length,
          (colTypeMap[column] ?? '').length,
          maxValueLength,
        )

        const estimatedWidth =
          maxChars * ESTIMATED_CHAR_WIDTH_PX + COLUMN_HORIZONTAL_PADDING_PX

        return Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, estimatedWidth))
      }),
    [colTypeMap, displayColumns, previewRows],
  )

  const { widths, onMouseDown, syncWidths } = useColumnResizer(autoColumnWidths)
  const boundedWidths = useMemo(
    () =>
      widths.map((width) =>
        Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, width)),
      ),
    [widths],
  )
  const tableWidth = useMemo(
    () => 10 + boundedWidths.reduce((total, width) => total + width, 0),
    [boundedWidths],
  )
  const [activeRow, setActiveRow] = useState<number | null>(null)

  // Keep widths in sync with auto-sized values when data/columns change.
  useEffect(() => {
    syncWidths(autoColumnWidths)
  }, [autoColumnWidths, syncWidths])

  const handleCellFocus = useCallback((rowIndex: number) => {
    setActiveRow(rowIndex)
  }, [])

  const handleCellBlur = useCallback(
    (rowIndex: number) => {
      setActiveRow((prev) => (prev === rowIndex ? null : prev))
    },
    [],
  )

  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        e.currentTarget.blur()
      }
    },
    [],
  )

  const handleCellInputFocus = useCallback(
    (rowIndex: number, e: React.FocusEvent<HTMLInputElement>) => {
      handleCellFocus(rowIndex)
      requestAnimationFrame(() => {
        e.currentTarget.select()
      })
    },
    [handleCellFocus],
  )

  // thead class with sticky header and shadow
  const theadClass = `sticky top-0 z-10 bg-surface-variant text-on-surface-variant shadow-[0_1px_0_0_var(--color-outline-variant)]`

  const handleCellInputClick = useCallback(
    (e: React.MouseEvent<HTMLInputElement>) => {
      e.currentTarget.select()
    },
    [],
  )

  return (
    <section className={containerClass}>
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant px-3 py-1.5">
        {/* Tab nav */}
        <div className="flex items-center gap-0.5">
          {TABLE_INFO_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTableInfoTabChange(tab)}
              className={[
                'cursor-pointer relative px-2.5 py-1.5 text-[11px] font-medium capitalize transition-colors',
                tableInfoTab === tab
                  ? 'text-primary after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:rounded-full after:bg-primary'
                  : 'text-on-surface-variant hover:text-primary-container',
              ].join(' ')}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {tableDataLoading && (
        <CenteredLoadingState loading={tableDataLoading} label="Loading table data..." />
      )}

      {/* ── DATA TAB ── */}
      {!tableDataLoading && tableInfoTab === 'data' && (
        <div className="scrollbar-thin flex-1 min-h-0 overflow-auto border border-outline-variant [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-on-surface-variant [&::-webkit-scrollbar-track]:bg-surface-variant">
          <table
            className="min-w-full border-collapse text-xs"
            style={{ tableLayout: 'fixed', width: tableWidth }}
          >
            <colgroup>
              <col style={{ width: 10 }} />
              {boundedWidths.map((width, index) => (
                <col key={`col-${index}`} style={{ width }} />
              ))}
            </colgroup>
            <thead className={theadClass}>
              <tr>
                <th
                  className="border-b border-r border-outline-variant px-0 py-1"
                />
                {displayColumns.map((column, colIdx) => (
                  <th
                    key={column}
                    className="group relative border-b border-r border-outline-variant px-2 py-1.5 text-left whitespace-nowrap"
                  >
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      <span className="overflow-hidden text-ellipsis font-semibold text-on-surface leading-tight">
                        {column}
                      </span>
                      {colTypeMap[column] && (
                        <span className="overflow-hidden text-ellipsis text-[10px] font-medium text-secondary leading-tight uppercase tracking-wide">
                          {colTypeMap[column]}
                        </span>
                      )}
                    </div>
                    {/* Resize handle */}
                    <span
                      role="separator"
                      className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-blue-400"
                      onMouseDown={(e) => onMouseDown(colIdx, e)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.length === 0 && (
                <tr>
                  <td
                    colSpan={displayColumns.length + 1 || 1}
                    className="px-2 py-8 text-center text-slate-400"
                  >
                    No data available
                  </td>
                </tr>
              )}
              {previewRows.map((row, rowIndex) => (
                <tr
                  key={`${rowIndex}`}
                  className={[
                    'text-on-surface transition-colors',
                    activeRow === rowIndex
                      ? 'bg-primary-container'
                      : 'even:bg-surface-variant hover:bg-surface-variant/70',
                  ].join(' ')}
                >
                  <td
                    className="cursor-pointer border-b border-r border-outline p-0"
                    onClick={() => setActiveRow(rowIndex)}
                    aria-label={`Select row ${rowIndex + 1}`}
                  />
                  {displayColumns.map((column) => {
                    const isNull = row[column] === null || row[column] === undefined;
                    console.log('row[column]', row[column], isNull)
                    const isActiveRow = activeRow === rowIndex;
                    const textColor = isActiveRow ? 'text-on-primary-container' : (isNull ? 'text-red-500 italic' : 'text-on-surface');
                    return (<td
                      key={`${rowIndex}-${column}`}
                      className={`${textColor} border-b border-r border-outline-variant p-0.5`}
                    >
                      <input
                        type="text"
                        defaultValue={row[column] == null ? '' : String(row[column])}
                        placeholder="(null)"
                        className={`block w-full min-w-0 bg-transparent px-2 py-1 outline-none focus:bg-surface-container-lowest focus:text-on-surface focus:ring-1 focus:ring-secondary-container placeholder:text-on-surface-variant placeholder:italic`}
                        onFocus={(e) => handleCellInputFocus(rowIndex, e)}
                        onClick={handleCellInputClick}
                        onBlur={() => handleCellBlur(rowIndex)}
                        onKeyDown={handleCellKeyDown}
                        title={row[column] == null ? '(null)' : String(row[column])}
                      />
                    </td>)
                  })}
                </tr>
              ))}
              {displayRows.length > MAX_DISPLAY_ROWS && (
                <tr>
                  <td
                    colSpan={displayColumns.length + 1 || 1}
                    className="px-2 py-2 text-center text-xs text-on-surface-variant"
                  >
                    Showing first {MAX_DISPLAY_ROWS} of {displayRows.length} rows
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── STRUCTURE TAB ── */}
      {!tableDataLoading && tableInfoTab === 'structure' && (
        <div className="flex-1 min-h-0 overflow-auto border border-outline [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-on-surface-variant [&::-webkit-scrollbar-track]:bg-surface-variant">
          <table
            className="w-full border-collapse text-xs"
            style={{ tableLayout: 'fixed' }}
          >
            <thead className={theadClass}>
              <tr>
                <th
                  className="border-b border-r border-outline px-2 py-1.5 text-left font-semibold text-on-surface"
                  style={{ width: 220 }}
                >
                  Column
                </th>
                <th
                  className="border-b border-r border-outline px-2 py-1.5 text-left font-semibold text-on-surface"
                  style={{ width: 180 }}
                >
                  Type
                </th>
                <th
                  className="border-b border-r border-outline px-2 py-1.5 text-left font-semibold text-on-surface"
                  style={{ width: 80 }}
                >
                  Nullable
                </th>
                <th className="border-b border-outline px-2 py-1.5 text-left font-semibold text-on-surface">
                  Default
                </th>
              </tr>
            </thead>
            <tbody>
              {realTableStructure.map((col, index) => (
                <tr key={index} className="text-on-surface transition-colors even:bg-surface-variant hover:bg-surface-variant/70">
                  <td className="border-b border-r border-outline px-2 py-1 font-medium text-on-surface whitespace-nowrap overflow-hidden text-ellipsis">
                    {String(col.column_name ?? col.Field ?? '')}
                  </td>
                  <td className="border-b border-r border-outline px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-secondary">
                      {String(col.data_type ?? col.Type ?? '')}
                    </span>
                  </td>
                  <td className="border-b border-r border-outline px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis">
                    {(() => {
                      const val = String(col.is_nullable ?? col.Null ?? '')
                      const isNo = val.toLowerCase() === 'no' || val === 'NOT NULL'
                      return (
                        <span className={[
                          'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
                          isNo
                            ? 'bg-surface-container-lowest text-error'
                            : 'bg-surface-container-lowest text-success',
                        ].join(' ')}>
                          {val || '—'}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="border-b border-outline px-2 py-1 font-mono text-[10px] text-secondary whitespace-nowrap overflow-hidden text-ellipsis">
                    {String(col.column_default ?? col.Default ?? '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── INDEXES TAB ── */}
      {!tableDataLoading && tableInfoTab === 'indexes' && (
        <div className="flex-1 min-h-0 overflow-auto p-3">
          {/* {realTableIndexes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-on-surface-variant">
              <span className="text-xs">No indexes found</span>
            </div>
          ) : (
           
          )} */}
          <div className="flex-1 min-h-0 overflow-auto border border-outline [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-on-surface-variant [&::-webkit-scrollbar-track]:bg-surface-variant">
            <table
              className="w-full border-collapse text-xs"
              style={{ tableLayout: 'fixed' }}
            >
              <thead className={theadClass}>
                <tr>
                  <th
                    className="border-b border-r border-outline px-2 py-1.5 text-left font-semibold text-on-surface"

                  >
                    Table
                  </th>
                  <th
                    className="border-b border-r border-outline px-2 py-1.5 text-left font-semibold text-on-surface"

                  >
                    Column
                  </th>
                  <th
                    className="border-b border-r border-outline px-2 py-1.5 text-left font-semibold text-on-surface"

                  >
                    Index Name
                  </th>
                  <th className="border-b border-r border-outline px-2 py-1.5 text-left font-semibold text-on-surface">
                    Is Unique
                  </th>
                  <th className="border-b border-r border-outline px-2 py-1.5 text-left font-semibold text-on-surface">
                    Is Primary
                  </th>
                  <th className="border-b border-r border-outline px-2 py-1.5 text-left font-semibold text-on-surface">
                    Index Type
                  </th>
                </tr>
              </thead>
              {realTableIndexes.length === 0 ? (
                <tbody>
                  <tr>
                    <td
                      colSpan={7}
                      className="px-2 py-8 text-center text-on-surface-variant"
                    >
                      No indexes found
                    </td>
                  </tr>
                </tbody>
              ) : (
                <tbody>
                  {realTableIndexes.map((idx, index) => (
                    <tr key={index} className="text-on-surface transition-colors even:bg-surface-variant hover:bg-surface-variant/70">
                      <td className="border-b border-r border-outline px-2 py-1 font-medium text-on-surface whitespace-nowrap overflow-hidden text-ellipsis">
                        {String(idx.tableName ?? '')}
                      </td>
                      <td className="border-b border-r border-outline px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis">
                        {String(idx.columnName ?? '')}
                      </td>
                      <td className="border-b border-r border-outline px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis">
                        {String(idx.indexName ?? '')}
                      </td>
                      <td className="border-b border-r border-outline px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis">
                        {idx.isUnique ? 'Yes' : 'No'}
                      </td>
                      <td className="border-b border-r border-outline px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis">
                        {idx.isPrimary ? 'Yes' : 'No'}
                      </td>
                      <td className="border-b border-outline px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis">
                        {String(idx.indexType ?? '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── RELATIONSHIPS TAB ── */}
      {!tableDataLoading && tableInfoTab === 'relationships' && (
        <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-slate-400">
          <span className="text-xs">Foreign key relationships will appear here when available.</span>
        </div>
      )}
    </section>
  )
}