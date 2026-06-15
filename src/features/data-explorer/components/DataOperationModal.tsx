import { AlertTriangle, Check, Database, Loader2, Table, X } from 'lucide-react'
import { useState } from 'react'
import type { DataOperation, DataOperationTarget } from '../types'

type ModalPhase = 'confirm' | 'loading' | 'success' | 'error'

interface DataOperationModalProps {
  target: DataOperationTarget
  onExecute: (target: DataOperationTarget) => Promise<void>
  onClose: () => void
}

const OPERATION_META: Record<DataOperation, {
  title: string
  verb: string
  warningTitle: string
  warningDetail: string
  confirmLabel: string
  successTitle: string
  successDetail: (tableName: string) => string
  errorTitle: string
  loadingText: (tableName: string) => string
}> = {
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

export function DataOperationModal({ target, onExecute, onClose }: DataOperationModalProps) {
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

  const accentBg = 'bg-slate-100'
  const accentText = 'text-slate-500'
  const accentBorder = 'border-slate-200'
  const accentBgLight = 'bg-slate-50'
  const accentBgLighter = 'bg-slate-50/50'
  const accentTextBold = 'text-slate-700'
  const accentTextMid = 'text-slate-500'
  const btnBg = 'bg-slate-700'
  const btnHover = 'hover:bg-slate-800'
  const ringColor = 'focus:ring-slate-500'
  const checkColor = 'text-slate-600'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={phase !== 'loading' ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${accentBg}`}>
              <AlertTriangle size={16} className={accentText} />
            </span>
            <h2 className="text-sm font-semibold text-slate-800">{meta.title}</h2>
          </div>
          {phase !== 'loading' && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
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
              <div className={`rounded-lg border ${accentBorder} ${accentBgLight} px-3.5 py-2.5`}>
                <p className={`text-[13px] font-medium ${accentTextBold}`}>
                  {meta.warningTitle}
                </p>
                <p className={`mt-1 text-xs ${accentTextMid}`}>
                  {meta.warningDetail}
                </p>
              </div>

              {/* Table identity card */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Table to {meta.verb}
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <Database size={13} className="shrink-0 text-slate-400" />
                    <span className="font-medium text-slate-500">Connection:</span>
                    <span className="font-semibold text-slate-800">{target.connectionName}</span>
                  </div>
                  {target.schema && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-3.25" />
                      <span className="font-medium text-slate-500">Schema:</span>
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-xs text-slate-700">
                        {target.schema}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Table size={13} className="shrink-0 text-slate-400" />
                    <span className="font-medium text-slate-500">Table:</span>
                    <span className={`rounded ${accentBg} px-1.5 py-0.5 font-mono text-xs font-semibold ${accentTextBold}`}>
                      {target.tableName}
                    </span>
                  </div>
                </div>
              </div>

              {/* Acknowledgement checkbox */}
              <div className={`rounded-lg border ${accentBorder} ${accentBgLighter} px-3.5 py-3`}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className={`mt-0.5 h-4 w-4 rounded border-slate-300 ${checkColor} ${ringColor}`}
                  />
                  <span className={`text-sm font-medium ${accentTextBold}`}>
                    I understand that all data in this table will be permanently removed
                  </span>
                </label>
              </div>
            </>
          )}

          {phase === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={28} className={`animate-spin ${accentText}`} />
              <p className="text-sm text-slate-600">
                {meta.loadingText(target.tableName)}
              </p>
            </div>
          )}

          {phase === 'success' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                <Check size={20} className="text-emerald-600" />
              </span>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800">{meta.successTitle}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {meta.successDetail(target.tableName)}
                </p>
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <X size={20} className="text-red-600" />
              </span>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800">{meta.errorTitle}</p>
                <p className="mt-1 max-w-sm text-xs text-red-500">{errorMessage}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          {phase === 'confirm' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
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
              className="rounded-lg bg-slate-800 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-700"
            >
              Done
            </button>
          )}

          {phase === 'error' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
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
