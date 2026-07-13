import { RotateCcw } from 'lucide-react'
import type { QueryResult } from '../../../_shared/types/shared'
import { DataGrid } from '../DataGrid'

interface ViewEditorResultPanelProps {
  isExecuting: boolean
  result: QueryResult | null
}

export function ViewEditorResultPanel({
  isExecuting,
  result,
}: ViewEditorResultPanelProps) {
  if (!isExecuting && !result) return null

  return (
    <>
      <div className="flex items-center gap-2 border-t border-border-default px-2 py-1 text-[11px] text-text-muted">
        {isExecuting ? (
          <span className="flex items-center gap-1">
            <RotateCcw size={12} className="animate-spin" />
            Running...
          </span>
        ) : result ? (
          <span className="text-green-500 animate-in fade-in duration-150">
            {result.rowsAffected > 0
              ? `${result.rowsAffected} row(s) affected`
              : result.rows.length > 0
                ? `${result.rows.length} row(s) returned`
                : 'Executed successfully'}
            {' \u00b7 '}
            {result.elapsedMs}ms
          </span>
        ) : null}
      </div>
      {result && result.columns.length > 0 && (
        <div className="min-h-40 flex-1 overflow-auto border-t border-border-default animate-in fade-in duration-200">
          <DataGrid columns={result.columns} rows={result.rows} />
        </div>
      )}
    </>
  )
}
