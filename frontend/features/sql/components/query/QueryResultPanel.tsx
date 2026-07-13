import { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import type { QueryResult, QueryResultTab } from '../../../_shared/types/shared'
import { ActionButton } from '../../../_shared/components/ui/ActionButton'
import { downloadTextFile, createCsv } from '../../../_shared/utils'
import { DataGrid } from '../DataGrid'

interface TransactionStep {
  statementIndex: number
  success: boolean
  error: string | null
  elapsedMs: number
  queryResult: QueryResult | null
  rowsAffected: number
}

interface QueryResultPanelProps {
  queryResult: QueryResult | null
  queryMessages: string[]
  queryResultTab: QueryResultTab
  setQueryResultTab: (tab: QueryResultTab) => void
  transactionMode: boolean
  transactionSteps: TransactionStep[]
  resultHeight: number
  handleResizeMouseDown: (e: React.MouseEvent) => void
}

const RESULT_TABS: QueryResultTab[] = ['results', 'messages', 'statistics']

export function QueryResultPanel({
  queryResult,
  queryMessages,
  queryResultTab,
  setQueryResultTab,
  transactionMode,
  transactionSteps,
  resultHeight,
  handleResizeMouseDown,
}: QueryResultPanelProps) {
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportOpen) return
    const handleClick = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [exportOpen])

  if (!queryResult) return null

  return (
    <>
      {/* Resize handle */}
      <div
        className="flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-t border-border-default bg-bg-subtle/50 hover:bg-primary/10 active:bg-primary/15 transition-colors"
        onMouseDown={handleResizeMouseDown}
      >
        <span className="h-px w-8 rounded-full bg-text-muted/40" />
      </div>
      <div
        className="flex min-h-0 flex-col"
        style={{ height: resultHeight }}
      >
        <div className="flex items-center gap-1 px-1.5 py-1">
          {RESULT_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setQueryResultTab(tab)}
              className={`rounded-md px-2 py-0.5 text-caption capitalize transition-colors ${
                queryResultTab === tab
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
              }`}
            >
              {tab}
            </button>
          ))}
          {queryResultTab === 'results' && (
            <span className="text-[10px] text-text-muted tabular-nums">
              {queryResult.rows.length} rows · {queryResult.elapsedMs}ms
            </span>
          )}
          <span className="ml-auto" />
          <div ref={exportRef} className="relative">
            <ActionButton
              icon={<Download size={13} />}
              aria-label="Export"
              onClick={() => setExportOpen((v) => !v)}
            />
            {exportOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 min-w-28 rounded-md border border-border-default bg-bg-base py-0.5 shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover"
                  onClick={() => {
                    downloadTextFile(
                      'query-result.json',
                      JSON.stringify(queryResult.rows, null, 2),
                      'application/json',
                    )
                    setExportOpen(false)
                  }}
                >
                  JSON
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover"
                  onClick={() => {
                    downloadTextFile(
                      'query-result.csv',
                      createCsv(queryResult.columns, queryResult.rows),
                      'text/csv',
                    )
                    setExportOpen(false)
                  }}
                >
                  CSV
                </button>
              </div>
            )}
          </div>
        </div>

        {queryResultTab === 'results' && (
          <DataGrid
            columns={queryResult.columns}
            rows={queryResult.rows}
            emptyMessage="No results"
          />
        )}

        {queryResultTab === 'messages' && (
          <ul className="flex-1 min-h-0 space-y-0.5 overflow-auto bg-bg-base p-1.5 text-xs text-text-primary font-mono">
            {transactionMode &&
              transactionSteps.map((step, i) => (
                <li
                  key={`tx-${i}`}
                  className="rounded px-1.5 py-0.5 hover:bg-bg-subtle text-[11px]"
                >
                  <span
                    className={
                      step.success ? 'text-green-500' : 'text-red-500'
                    }
                  >
                    {step.success ? '✓' : '✗'}
                  </span>{' '}
                  [step {step.statementIndex}]{' '}
                  {step.success
                    ? `Completed in ${step.elapsedMs} ms`
                    : `Error: ${step.error ?? 'Unknown error'}`}
                  {step.rowsAffected > 0 && (
                    <> · {step.rowsAffected} rows</>
                  )}
                </li>
              ))}
            {queryMessages.map((m, i) => (
              <li
                key={`msg-${i}`}
                className="rounded px-1.5 py-0.5 hover:bg-bg-subtle text-[11px]"
              >
                {m}
              </li>
            ))}
          </ul>
        )}

        {queryResultTab === 'statistics' && (
          <div className="flex items-center gap-4 bg-bg-base px-3 py-2 text-xs">
            <div>
              <span className="text-text-muted">Rows </span>
              <span className="font-semibold text-text-primary tabular-nums">
                {queryResult.rows.length}
              </span>
            </div>
            <div>
              <span className="text-text-muted">Time </span>
              <span className="font-semibold text-text-primary tabular-nums">
                {queryResult.elapsedMs}ms
              </span>
            </div>
            <div>
              <span className="text-text-muted">Affected </span>
              <span className="font-semibold text-text-primary tabular-nums">
                {queryResult.rowsAffected}
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
