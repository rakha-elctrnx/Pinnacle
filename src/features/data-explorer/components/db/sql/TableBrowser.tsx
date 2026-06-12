import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FileDown,
  FileUp,
  Loader2,
  ListFilter,
  Settings2,
} from 'lucide-react'
import type { TableInfoTab } from '../../../types'
import type { TableIndex } from '../../../hooks/useExplorerData'

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

function useColumnResizer(columnCount: number) {
  const [widths, setWidths] = useState<number[]>(() =>
    Array.from({ length: columnCount }, () => 150),
  )
  const startXRef = useRef(0)
  const startIndexRef = useRef(0)
  const startWidthRef = useRef(0)
  const nextWidthRef = useRef(0)

  const onMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      startXRef.current = e.clientX
      startIndexRef.current = index
      startWidthRef.current = widths[index] ?? 150
      nextWidthRef.current = widths[index + 1] ?? 150

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startXRef.current
        const newLeft = Math.max(40, startWidthRef.current + delta)
        const newRight = Math.max(40, nextWidthRef.current - delta)
        setWidths((prev) => {
          const next = [...prev]
          next[index] = newLeft
          if (index + 1 < next.length) next[index + 1] = newRight
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

  // Reset widths when column count changes
  const resetWidths = useCallback((count: number) => {
    setWidths((prev) => {
      if (prev.length === count) return prev
      return Array.from({ length: count }, (_, i) => prev[i] ?? 150)
    })
  }, [])

  return { widths, onMouseDown, resetWidths }
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

  const colResizer = useColumnResizer(displayColumns.length)
  const [activeRow, setActiveRow] = useState<number | null>(null)
  const [selectedRow, setSelectedRow] = useState<number | null>(null)

  // Keep widths in sync when column count changes
  useEffect(() => {
    colResizer.resetWidths(displayColumns.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayColumns.length])

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
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        e.currentTarget.blur()
      }
    },
    [],
  )

  const colTypeMap = Object.fromEntries(
    realTableStructure.map((col) => [
      String(col.column_name ?? col.Field ?? ''),
      String(col.data_type ?? col.Type ?? ''),
    ]),
  )

  const previewRows = displayRows.slice(0, MAX_DISPLAY_ROWS)
  const actionButtonClass = `cursor-pointer rounded-md p-1.5 text-on-surface-variant transition-all hover:bg-surface-variant hover:text-on-surface-variant hover:shadow-[inset_0_0_0_1px_theme(colors.outline-variant)]`
  // thead class with sticky header and shadow
  const theadClass = `sticky top-0 z-10 bg-surface-variant text-on-surface-variant shadow-[0_1px_0_0_var(--color-outline-variant)]`


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

        {/* Action buttons */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Filter & Sort"
            className={actionButtonClass}
          >
            <ListFilter size={13} />
          </button>
          <button
            type="button"
            title="Export Data"
            className={actionButtonClass}
          >
            <FileDown size={13} />
          </button>
          <button
            type="button"
            title="Import Data"
            className={actionButtonClass}
          >
            <FileUp size={13} />
          </button>
          <div className="mx-1.5 h-3.5 w-px bg-slate-200" />
          <button
            type="button"
            title="Column Visibility"
            className={actionButtonClass}
          >
            <Settings2 size={13} />
          </button>
        </div>
      </div>

      {tableDataLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-blue-500" />
          <span className="ml-2 text-sm text-slate-500">
            Loading table data...
          </span>
        </div>
      )}

      {/* ── DATA TAB ── */}
      {!tableDataLoading && tableInfoTab === 'data' && (
        <div className="scrollbar-thin flex-1 min-h-0 overflow-auto border border-outline-variant [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-on-surface-variant [&::-webkit-scrollbar-track]:bg-surface-variant">
          <table
            className="w-full border-collapse text-xs"
            style={{ tableLayout: 'fixed' }}
          >
            <thead className={theadClass}>
              <tr>
                <th
                  className="border-b border-r border-outline-variant px-0 py-1"
                  style={{ width: 10 }}
                />
                {displayColumns.map((column, colIdx) => (
                  <th
                    key={column}
                    className="group relative border-b border-r border-outline-variant px-2 py-1.5 text-left whitespace-nowrap"
                    style={{ width: colResizer.widths[colIdx] }}
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
                      onMouseDown={(e) => colResizer.onMouseDown(colIdx, e)}
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
                    activeRow === rowIndex || selectedRow === rowIndex
                      ? 'bg-primary/50'
                      : 'even:bg-surface-variant hover:bg-surface-variant/70',
                  ].join(' ')}
                >
                  <td
                    className="cursor-pointer border-b border-r border-outline p-0"
                    onClick={() => setSelectedRow(rowIndex)}
                    aria-label={`Select row ${rowIndex + 1}`}
                  />
                  {displayColumns.map((column) => {
                    const isNULL = row[column] === null || row[column] === undefined
                    return (
                      <td
                        key={`${rowIndex}-${column}`}
                        className="border-b border-r border-outline p-0.5"
                      >
                        <div
                          contentEditable
                          suppressContentEditableWarning
                          spellCheck={false}
                          className={`max-w-full ${isNULL ? 'text-on-surface-variant' : 'text-on-surface'} truncate px-2 py-1 outline-none focus:bg-surface-container-lowest focus:ring-4 focus:ring-primary-container focus:ring-offset-[-1px] focus:ring-offset-surface-container-lowest`}
                          onFocus={() => handleCellFocus(rowIndex)}
                          onBlur={() => handleCellBlur(rowIndex)}
                          onKeyDown={handleCellKeyDown}
                          title={String(row[column] ?? '')}
                        >
                          {String(row[column] ?? 'NULL')}
                        </div>
                      </td>
                    )
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
