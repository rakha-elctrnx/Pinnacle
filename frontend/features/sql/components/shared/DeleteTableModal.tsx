import { AlertTriangle, Check, Database, Loader2, Table, X } from 'lucide-react'
import { useState } from 'react'
import type { DeleteTableTarget } from '../../../_shared/types/shared'

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
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border-default bg-bg-base shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger-subtle">
              <AlertTriangle size={16} className="text-danger" />
            </span>
            <h2 className="text-sm font-semibold text-text-primary">Delete Table</h2>
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
              <div className="rounded-lg border border-border-danger bg-danger-subtle px-3.5 py-2.5">
                <p className="text-[13px] font-medium text-danger">
                  This action is permanent and cannot be undone.
                </p>
                <p className="mt-1 text-xs text-danger/70">
                  All data, indexes, and constraints associated with this table will be permanently removed.
                </p>
              </div>

              {/* Table identity card */}
              <div className="rounded-lg border border-border-default bg-bg-subtle p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  Table to be deleted
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <Database size={13} className="shrink-0 text-text-muted" />
                    <span className="font-medium text-text-secondary">Connection:</span>
                    <span className="font-semibold text-text-primary">{target.connectionName}</span>
                  </div>
                  {target.schema && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-3.25" />
                      <span className="font-medium text-text-secondary">Schema:</span>
                      <span className="rounded bg-bg-muted px-1.5 py-0.5 font-mono text-xs text-text-primary">
                        {target.schema}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Table size={13} className="shrink-0 text-text-muted" />
                    <span className="font-medium text-text-secondary">Table:</span>
                    <span className="rounded bg-danger-subtle px-1.5 py-0.5 font-mono text-xs font-semibold text-danger">
                      {target.tableName}
                    </span>
                  </div>
                </div>
              </div>

              {/* Cascade toggle */}
              <div className="rounded-lg border border-border-default bg-bg-base px-3.5 py-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={cascade}
                    onChange={(e) => setCascade(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border-strong text-danger focus:ring-danger"
                  />
                  <div>
                    <p className="text-sm font-medium text-text-primary">Drop with cascade</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      Also remove dependent objects such as foreign key references, views, or other objects that depend on this table.
                    </p>
                  </div>
                </label>
              </div>

              {/* Acknowledgement checkbox */}
              <div className="rounded-lg border border-border-danger bg-danger-subtle/50 px-3.5 py-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border-strong text-danger focus:ring-danger"
                  />
                  <span className="text-sm font-medium text-danger">
                    I understand that this action is permanent and cannot be undone
                  </span>
                </label>
              </div>
            </>
          )}

          {phase === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={28} className="animate-spin text-danger" />
              <p className="text-sm text-text-secondary">
                Deleting <span className="font-mono font-semibold">{target.tableName}</span>...
              </p>
            </div>
          )}

          {phase === 'success' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-subtle">
                <Check size={20} className="text-success" />
              </span>
              <div className="text-center">
                <p className="text-sm font-semibold text-text-primary">Table deleted successfully</p>
                <p className="mt-1 text-xs text-text-secondary">
                  <span className="font-mono">{target.tableName}</span> has been removed.
                </p>
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-subtle">
                <X size={20} className="text-danger" />
              </span>
              <div className="text-center">
                <p className="text-sm font-semibold text-text-primary">Failed to delete table</p>
                <p className="mt-1 max-w-sm text-xs text-danger">{errorMessage}</p>
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
                className="rounded-lg bg-danger px-3.5 py-1.5 text-xs font-medium text-text-inverse transition-colors hover:bg-danger/80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete Table
              </button>
            </>
          )}

          {phase === 'success' && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-bg-muted px-3.5 py-1.5 text-xs font-medium text-text-inverse transition-colors hover:bg-border-strong"
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
                className="rounded-lg bg-danger px-3.5 py-1.5 text-xs font-medium text-text-inverse transition-colors hover:bg-danger/80"
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
