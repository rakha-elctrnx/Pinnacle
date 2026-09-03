import { AlertTriangle, Check, Database, Loader2, Table, X } from 'lucide-react'
import { useState } from 'react'
import type {
  DataOperation,
  DataOperationTarget,
} from '../../../_shared/types/shared'

type ModalPhase = 'confirm' | 'loading' | 'success' | 'error'

interface DataOperationModalProps {
  target: DataOperationTarget
  onExecute: (target: DataOperationTarget) => Promise<void>
  onClose: () => void
}

const OPERATION_META: Record<
  DataOperation,
  {
    title: string
    verb: string
    warningTitle: string
    warningDetail: string
    confirmLabel: string
    successTitle: string
    successDetail: (tableName: string) => string
    errorTitle: string
    loadingText: (tableName: string) => string
  }
> = {
  empty: {
    title: 'Empty Table',
    verb: 'empty',
    warningTitle: 'All rows will be permanently deleted.',
    warningDetail:
      'This will remove every row from the table using DELETE FROM. The table structure, columns, indexes, and constraints will be preserved.',
    confirmLabel: 'Empty Table',
    successTitle: 'Table emptied successfully',
    successDetail: (name) => `All rows have been removed from ${name}.`,
    errorTitle: 'Failed to empty table',
    loadingText: (name) => `Emptying ${name}...`,
  },
  truncate: {
    title: 'Truncate Table',
    verb: 'truncate',
    warningTitle: 'All rows will be permanently removed and sequences reset.',
    warningDetail:
      'This will remove every row from the table using TRUNCATE TABLE. The table structure will be preserved, but auto-increment counters and sequences may be reset.',
    confirmLabel: 'Truncate Table',
    successTitle: 'Table truncated successfully',
    successDetail: (name) => `${name} has been truncated.`,
    errorTitle: 'Failed to truncate table',
    loadingText: (name) => `Truncating ${name}...`,
  },
}

export function DataOperationModal({
  target,
  onExecute,
  onClose,
}: DataOperationModalProps) {
  const [phase, setPhase] = useState<ModalPhase>('confirm')
  const [acknowledged, setAcknowledged] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const meta = OPERATION_META[target.operation]
  const canSubmit = acknowledged && phase === 'confirm'

  const handleSubmit = async () => {
    if (!canSubmit) return

    setPhase('loading')
    setErrorMessage(null)

    try {
      await onExecute(target)
      setPhase('success')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }

  const accentBg = 'bg-bg-muted'
  const accentText = 'text-text-secondary'
  const accentBorder = 'border-border-default'
  const accentBgLight = 'bg-bg-subtle'
  const accentBgLighter = 'bg-bg-subtle/50'
  const accentTextBold = 'text-text-primary'
  const accentTextMid = 'text-text-secondary'
  const btnBg = 'bg-text-primary'
  const btnHover = 'hover:bg-text-primary/90'
  const ringColor = 'focus:ring-border-focus'
  const checkColor = 'text-text-secondary'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={phase !== 'loading' ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border-default bg-bg-base shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${accentBg}`}
            >
              <AlertTriangle size={16} className={accentText} />
            </span>
            <h2 className="text-sm font-semibold text-text-primary">
              {meta.title}
            </h2>
          </div>
          {phase !== 'loading' && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-subtle hover:text-text-secondary"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {phase === 'confirm' && (
            <>
              {/* Warning message */}
              <div
                className={`rounded-lg border ${accentBorder} ${accentBgLight} px-3.5 py-2.5`}
              >
                <p className={`text-[13px] font-medium ${accentTextBold}`}>
                  {meta.warningTitle}
                </p>
                <p className={`mt-1 text-xs ${accentTextMid}`}>
                  {meta.warningDetail}
                </p>
              </div>

              {/* Table identity card */}
              <div className="rounded-lg border border-border-default bg-bg-subtle p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  Table to {meta.verb}
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <Database size={13} className="shrink-0 text-text-muted" />
                    <span className="font-medium text-text-secondary">
                      Connection:
                    </span>
                    <span className="font-semibold text-text-primary">
                      {target.connectionName}
                    </span>
                  </div>
                  {target.schema && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-3.25" />
                      <span className="font-medium text-text-secondary">
                        Schema:
                      </span>
                      <span className="rounded bg-bg-muted px-1.5 py-0.5 font-mono text-xs text-text-primary">
                        {target.schema}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Table size={13} className="shrink-0 text-text-muted" />
                    <span className="font-medium text-text-secondary">
                      Table:
                    </span>
                    <span
                      className={`rounded ${accentBg} px-1.5 py-0.5 font-mono text-xs font-semibold ${accentTextBold}`}
                    >
                      {target.tableName}
                    </span>
                  </div>
                </div>
              </div>

              {/* Acknowledgement checkbox */}
              <div
                className={`rounded-lg border ${accentBorder} ${accentBgLighter} px-3.5 py-3`}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className={`mt-0.5 h-4 w-4 rounded border-border-strong ${checkColor} ${ringColor}`}
                  />
                  <span className={`text-sm font-medium ${accentTextBold}`}>
                    I understand that all data in this table will be permanently
                    removed
                  </span>
                </label>
              </div>
            </>
          )}

          {phase === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={28} className={`animate-spin ${accentText}`} />
              <p className="text-sm text-text-secondary">
                {meta.loadingText(target.tableName)}
              </p>
            </div>
          )}

          {phase === 'success' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-subtle">
                <Check size={20} className="text-success-text" />
              </span>
              <div className="text-center">
                <p className="text-sm font-semibold text-text-primary">
                  {meta.successTitle}
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  {meta.successDetail(target.tableName)}
                </p>
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-subtle">
                <X size={20} className="text-[var(--color-danger)]" />
              </span>
              <div className="text-center">
                <p className="text-sm font-semibold text-text-primary">
                  {meta.errorTitle}
                </p>
                <p className="mt-1 max-w-sm text-xs text-[var(--color-danger)]">
                  {errorMessage}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border-default px-5 py-3">
          {phase === 'confirm' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border-default px-3.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-subtle"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!canSubmit}
                className={`rounded-lg ${btnBg} px-3.5 py-1.5 text-xs font-medium text-white transition-colors ${btnHover} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {meta.confirmLabel}
              </button>
            </>
          )}

          {phase === 'success' && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-text-primary px-3.5 py-1.5 text-xs font-medium text-text-inverse transition-colors hover:bg-text-primary/90"
            >
              Done
            </button>
          )}

          {phase === 'error' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border-default px-3.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-subtle"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhase('confirm')
                  setErrorMessage(null)
                }}
                className={`rounded-lg ${btnBg} px-3.5 py-1.5 text-xs font-medium text-white transition-colors ${btnHover}`}
              >
                Try Again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
