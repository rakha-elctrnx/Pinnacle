import { AlertTriangle, Check, Loader2, Plug, X } from 'lucide-react'
import { useState } from 'react'

type ModalPhase = 'confirm' | 'loading' | 'success' | 'error'

interface DeleteConnectionModalProps {
  connectionId: string
  connectionName: string
  onDelete: (connectionId: string) => Promise<void>
  onClose: () => void
}

export function DeleteConnectionModal({
  connectionId,
  connectionName,
  onDelete,
  onClose,
}: DeleteConnectionModalProps) {
  const [phase, setPhase] = useState<ModalPhase>('confirm')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (phase !== 'confirm') return

    setPhase('loading')
    setErrorMessage(null)

    try {
      await onDelete(connectionId)
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
            <h2 className="text-subheading">Delete Connection</h2>
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
                <p className="text-body font-medium text-danger">
                  This action is permanent and cannot be undone.
                </p>
                <p className="mt-1 text-caption text-danger/70">
                  The connection profile and all saved queries associated with it will be permanently removed.
                </p>
              </div>

              {/* Connection identity card */}
              <div className="rounded-lg border border-border-default bg-bg-subtle p-3">
                <p className="mb-2 text-label">
                  Connection to be deleted
                </p>
                <div className="flex items-center gap-2 text-body">
                  <Plug size={13} className="shrink-0 text-text-muted" />
                  <span className="text-body-secondary">Name:</span>
                  <span className="text-mono rounded bg-danger-subtle px-1.5 py-0.5 text-danger">
                    {connectionName}
                  </span>
                </div>
              </div>
            </>
          )}

          {phase === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={28} className="animate-spin text-danger" />
              <p className="text-body-secondary">
                Deleting <span className="text-mono">{connectionName}</span>...
              </p>
            </div>
          )}

          {phase === 'success' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-subtle">
                <Check size={20} className="text-success" />
              </span>
              <div className="text-center">
                <p className="text-subheading">Connection deleted</p>
                <p className="mt-1 text-body-secondary">
                  <span className="text-mono">{connectionName}</span> has been removed.
                </p>
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-subtle">
                <X size={20} className="text-danger" />
              </span>
              <div className="text-center">
                <p className="text-subheading">Failed to delete connection</p>
                <p className="mt-1 text-caption text-text-muted">{errorMessage}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-border-default px-5 py-3.5">
          {phase === 'confirm' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-body text-text-secondary transition-colors hover:bg-bg-subtle"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="rounded-lg bg-danger px-4 py-2 text-body font-medium text-white transition-colors hover:bg-danger/90 active:scale-[0.98]"
              >
                Delete Connection
              </button>
            </>
          )}
          {(phase === 'success' || phase === 'error') && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-bg-subtle px-4 py-2 text-body font-medium text-text-primary transition-colors hover:bg-bg-muted"
            >
              {phase === 'success' ? 'Done' : 'Close'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
