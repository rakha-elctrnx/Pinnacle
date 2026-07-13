interface ConfirmTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  onCommit: () => void
  onRollback: () => void
}

export function ConfirmTransactionModal({
  isOpen,
  onClose,
  onCommit,
  onRollback,
}: ConfirmTransactionModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Transaction exit"
    >
      <div
        className="min-w-[300px] max-w-sm rounded-xl bg-bg-base p-5 shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-sm font-semibold text-text-primary">
          Transaction in progress
        </h3>
        <p className="mb-5 text-xs text-text-muted">
          You have an open transaction. What would you like to do?
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="w-full rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover"
            onClick={() => {
              onClose()
              onCommit()
            }}
          >
            Commit &amp; exit
          </button>
          <button
            type="button"
            className="w-full rounded-lg border border-border-default px-3 py-1.5 text-xs text-text-primary transition-colors hover:bg-bg-muted"
            onClick={() => {
              onClose()
              onRollback()
            }}
          >
            Rollback &amp; exit
          </button>
          <button
            type="button"
            className="w-full rounded-lg border border-border-default px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-bg-hover"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
