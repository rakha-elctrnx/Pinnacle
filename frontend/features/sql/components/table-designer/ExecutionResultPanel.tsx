import { CheckCircle, XCircle, RefreshCw, X } from 'lucide-react'
import type { DdlExecutionResult } from '../../logic/table-designer'

interface ExecutionResultPanelProps {
  result: DdlExecutionResult | null
  isExecuting: boolean
  onRetry?: () => void
  onClose?: () => void
}

/**
 * Execution Result Panel — shows per-statement success/error results
 * after DDL execution, with retry and close actions.
 */
export function ExecutionResultPanel({
  result,
  isExecuting,
  onRetry,
  onClose,
}: ExecutionResultPanelProps) {
  if (isExecuting) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500" />
          <p className="mt-2 text-xs text-slate-500">Executing DDL statements...</p>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-slate-500">No execution results yet.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 overflow-auto p-4">
      {/* Overall status */}
      <div
        className={`flex items-center gap-3 rounded-lg p-3 ${
          result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}
      >
        {result.success ? (
          <CheckCircle size={18} className="text-green-600" />
        ) : (
          <XCircle size={18} className="text-red-600" />
        )}
        <div>
          <p className={`text-sm font-semibold ${result.success ? 'text-green-800' : 'text-red-800'}`}>
            {result.success ? 'Execution Successful' : 'Execution Failed'}
          </p>
          <p className="text-xs text-slate-600">
            {result.executedCount} of {result.statements.length} statement
            {result.statements.length !== 1 ? 's' : ''} executed
          </p>
        </div>
      </div>

      {/* Per-statement results */}
      <div className="space-y-1.5">
        {result.statements.map((stmt) => (
          <div
            key={stmt.order}
            className={`flex items-center gap-2 rounded-lg border p-2.5 ${
              stmt.success
                ? 'border-green-200 bg-green-50/30'
                : 'border-red-200 bg-red-50/30'
            }`}
          >
            {stmt.success ? (
              <CheckCircle size={13} className="shrink-0 text-green-500" />
            ) : (
              <XCircle size={13} className="shrink-0 text-red-500" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-mono truncate text-slate-700">
                {stmt.sql}
              </p>
              {stmt.error && (
                <p className="mt-0.5 text-[11px] text-red-600">{stmt.error}</p>
              )}
            </div>
            <span className="shrink-0 text-[10px] text-slate-400">
              {stmt.elapsedMs}ms
            </span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        {!result.success && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <RefreshCw size={12} /> Retry
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <X size={12} /> Close
          </button>
        )}
      </div>
    </div>
  )
}
