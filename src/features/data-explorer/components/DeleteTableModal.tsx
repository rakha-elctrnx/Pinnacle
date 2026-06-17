import { AlertTriangle, Check, Database, Loader2, Table, X } from 'lucide-react'
import { useState } from 'react'
import type { DeleteTableTarget } from '../types'

type ModalPhase = 'confirm' | 'loading' | 'success' | 'error'

interface DeleteTableModalProps {
  target: DeleteTableTarget
  onDelete: (tableName: string, cascade: boolean) => Promise<void>
  onClose: () => void
}

export function DeleteTableModal({ target, onDelete, onClose }: DeleteTableModalProps) {
  const [phase, setPhase] = useState<ModalPhase>('confirm')
  const [acknowledged, setAcknowledged] = useState(false)
  const [cascade, setCascade] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const canSubmit = acknowledged && phase === 'confirm'

  const handleSubmit = async () => {
    if (!canSubmit) return

    setPhase('loading')
    setErrorMessage(null)

    try {
      await onDelete(target.tableName, cascade)
      setPhase('success')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }

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
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100">
              <AlertTriangle size={16} className="text-red-600" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800">Delete Table</h2>
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
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5">
                <p className="text-[13px] font-medium text-red-700">
                  This action is permanent and cannot be undone.
                </p>
                <p className="mt-1 text-xs text-red-500">
                  All data, indexes, and constraints associated with this table will be permanently removed.
                </p>
              </div>

              {/* Table identity card */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Table to be deleted
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
                    <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-red-700">
                      {target.tableName}
                    </span>
                  </div>
                </div>
              </div>

              {/* Cascade toggle */}
              <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={cascade}
                    onChange={(e) => setCascade(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-700">Drop with cascade</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Also remove dependent objects such as foreign key references, views, or other objects that depend on this table.
                    </p>
                  </div>
                </label>
              </div>

              {/* Acknowledgement checkbox */}
              <div className="rounded-lg border border-red-200 bg-red-50/50 px-3.5 py-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm font-medium text-red-700">
                    I understand that this action is permanent and cannot be undone
                  </span>
                </label>
              </div>
            </>
          )}

          {phase === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={28} className="animate-spin text-red-500" />
              <p className="text-sm text-slate-600">
                Deleting <span className="font-mono font-semibold">{target.tableName}</span>...
              </p>
            </div>
          )}

          {phase === 'success' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                <Check size={20} className="text-emerald-600" />
              </span>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800">Table deleted successfully</p>
                <p className="mt-1 text-xs text-slate-500">
                  <span className="font-mono">{target.tableName}</span> has been removed.
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
                <p className="text-sm font-semibold text-slate-800">Failed to delete table</p>
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
                className="rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete Table
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
                className="rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
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
