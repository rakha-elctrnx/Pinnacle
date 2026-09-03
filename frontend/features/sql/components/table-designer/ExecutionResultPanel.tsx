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
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-border-default border-t-primary" />
          <p className="mt-2 text-xs text-text-secondary">
            Executing DDL statements...
          </p>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-text-secondary">No execution results yet.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 overflow-auto p-4">
      {/* Overall status */}
      <div
        className={`flex items-center gap-3 rounded-lg p-3 ${
          result.success
            ? 'bg-success-subtle border border-border-default'
            : 'bg-danger-subtle border border-border-danger'
        }`}
      >
        {result.success ? (
          <CheckCircle size={18} className="text-success-text" />
        ) : (
          <XCircle size={18} className="text-[var(--color-danger)]" />
        )}
        <div>
          <p
            className={`text-sm font-semibold ${result.success ? 'text-success-text' : 'text-[var(--color-danger)]'}`}
          >
            {result.success ? 'Execution Successful' : 'Execution Failed'}
          </p>
          <p className="text-xs text-text-secondary">
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
                ? 'border-border-default bg-success-subtle'
                : 'border-border-danger bg-danger-subtle'
            }`}
          >
            {stmt.success ? (
              <CheckCircle size={13} className="shrink-0 text-success-text" />
            ) : (
              <XCircle
                size={13}
                className="shrink-0 text-[var(--color-danger)]"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-mono truncate text-text-secondary">
                {stmt.sql}
              </p>
              {stmt.error && (
                <p className="mt-0.5 text-[11px] text-[var(--color-danger)]">
                  {stmt.error}
                </p>
              )}
            </div>
            <span className="shrink-0 text-[10px] text-text-muted">
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
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-text-inverse hover:bg-primary-hover"
          >
            <RefreshCw size={12} /> Retry
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-subtle"
          >
            <X size={12} /> Close
          </button>
        )}
      </div>
    </div>
  )
}
