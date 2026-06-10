import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Loader2,
} from 'lucide-react'
import type { TableInfoTab } from '../../../types'

interface TableBrowserProps {
  selectedTable: string | null
  tableInfoTab: TableInfoTab
  onTableInfoTabChange: (tab: TableInfoTab) => void
  tableDataLoading: boolean
  displayColumns: string[]
  displayRows: Record<string, string>[]
  realTableStructure: Record<string, string>[]
  realTableIndexes: string[]
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
    : 'rounded-xl border border-slate-200 bg-white p-3'

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

  return (
    <section className={containerClass}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-1.5">
        {/* Tab nav */}
        <div className="flex items-center gap-0.5">
          {TABLE_INFO_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTableInfoTabChange(tab)}
              className={[
                'relative px-2.5 py-1.5 text-[11px] font-medium capitalize transition-colors',
                tableInfoTab === tab
                  ? 'text-blue-600 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:rounded-full after:bg-blue-500'
                  : 'text-slate-400 hover:text-slate-600',
              ].join(' ')}
            >
              {tab}
            </button>
          ))}
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
        <div className="scrollbar-thin flex-1 min-h-0 overflow-auto border border-slate-200 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-50">
          <table
            className="w-full border-collapse text-xs"
            style={{ tableLayout: 'fixed' }}
          >
            <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600 shadow-[0_1px_0_0_theme(colors.slate.200)]">
              <tr>
                <th
                  className="border-b border-r border-slate-200 px-0 py-1"
                  style={{ width: 10 }}
                />
                {displayColumns.map((column, colIdx) => (
                  <th
                    key={column}
                    className="group relative border-b border-r border-slate-200 px-2 py-1.5 text-left whitespace-nowrap"
                    style={{ width: colResizer.widths[colIdx] }}
                  >
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      <span className="overflow-hidden text-ellipsis font-semibold text-slate-700 leading-tight">
                        {column}
                      </span>
                      {colTypeMap[column] && (
                        <span className="overflow-hidden text-ellipsis text-[10px] font-medium text-blue-400 leading-tight uppercase tracking-wide">
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
                    'text-slate-700',
                    activeRow === rowIndex || selectedRow === rowIndex
                      ? 'bg-blue-100/70'
                      : 'even:bg-slate-50/50 hover:bg-blue-50/40',
                  ].join(' ')}
                >
                  <td
                    className="cursor-pointer border-b border-r border-slate-100 p-0"
                    onClick={() => setSelectedRow(rowIndex)}
                    aria-label={`Select row ${rowIndex + 1}`}
                  />
                  {displayColumns.map((column) => (
                    <td
                      key={`${rowIndex}-${column}`}
                      className="border-b border-r border-slate-100 p-0.5"
                    >
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        spellCheck={false}
                        className="max-w-full truncate px-2 py-1 outline-none focus:bg-white focus:ring-1 focus:ring-blue-300"
                        onFocus={() => handleCellFocus(rowIndex)}
                        onBlur={() => handleCellBlur(rowIndex)}
                        onKeyDown={handleCellKeyDown}
                        title={String(row[column] ?? '')}
                      >
                        {String(row[column] ?? '')}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
              {displayRows.length > MAX_DISPLAY_ROWS && (
                <tr>
                  <td
                    colSpan={displayColumns.length + 1 || 1}
                    className="px-2 py-2 text-center text-xs text-slate-400"
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
        <div className="flex-1 min-h-0 overflow-auto border border-slate-200 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-50">
          <table
            className="w-full border-collapse text-xs"
            style={{ tableLayout: 'fixed' }}
          >
            <thead className="sticky top-0 z-10 bg-slate-100 shadow-[0_1px_0_0_theme(colors.slate.200)]">
              <tr>
                <th
                  className="border-b border-r border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700"
                  style={{ width: 220 }}
                >
                  Column
                </th>
                <th
                  className="border-b border-r border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700"
                  style={{ width: 180 }}
                >
                  Type
                </th>
                <th
                  className="border-b border-r border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700"
                  style={{ width: 80 }}
                >
                  Nullable
                </th>
                <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700">
                  Default
                </th>
              </tr>
            </thead>
            <tbody>
              {realTableStructure.map((col, index) => (
                <tr key={index} className="text-slate-600 transition-colors hover:bg-blue-50/40 even:bg-slate-50/50">
                  <td className="border-b border-r border-slate-100 px-2 py-1 font-medium text-slate-700 whitespace-nowrap overflow-hidden text-ellipsis">
                    {String(col.column_name ?? col.Field ?? '')}
                  </td>
                  <td className="border-b border-r border-slate-100 px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-blue-400">
                      {String(col.data_type ?? col.Type ?? '')}
                    </span>
                  </td>
                  <td className="border-b border-r border-slate-100 px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis">
                    {(() => {
                      const val = String(col.is_nullable ?? col.Null ?? '')
                      const isNo = val.toLowerCase() === 'no' || val === 'NOT NULL'
                      return (
                        <span className={[
                          'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
                          isNo
                            ? 'bg-red-50 text-red-500'
                            : 'bg-emerald-50 text-emerald-600',
                        ].join(' ')}>
                          {val || '—'}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-1 font-mono text-[10px] text-slate-400 whitespace-nowrap overflow-hidden text-ellipsis">
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
          {realTableIndexes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-slate-400">
              <span className="text-xs">No indexes found</span>
            </div>
          ) : (
            <ul className="space-y-1">
              {realTableIndexes.map((idx) => (
                <li
                  key={idx}
                  className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 hover:border-slate-200 hover:bg-white transition-colors"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono">
                    {idx}
                  </span>
                </li>
              ))}
            </ul>
          )}
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