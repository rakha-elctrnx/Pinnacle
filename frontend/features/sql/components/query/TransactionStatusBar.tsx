import { Check, Undo2 } from 'lucide-react'
import { ActionButton } from '../../../_shared/components/ui/ActionButton'

interface TransactionStatusBarProps {
  activeTransactionId: string
  stepCount: number
  connectionType: string
  isRunningQuery: boolean
  onCommit: () => void
  onRollback: () => void
}

export function TransactionStatusBar({
  activeTransactionId,
  stepCount,
  connectionType,
  isRunningQuery,
  onCommit,
  onRollback,
}: TransactionStatusBarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-border-default bg-blue-500/5 px-3 py-1.5 text-[11px]">
      <span className="font-medium text-text-primary">
        Transaction:{' '}
        <span className="font-mono text-primary">
          {activeTransactionId.slice(0, 8)}
        </span>
      </span>
      <span className="text-text-muted">·</span>
      <span className="text-text-muted">
        {stepCount} step{stepCount !== 1 ? 's' : ''}
      </span>
      {connectionType === 'mysql' && (
        <span
          className="rounded bg-yellow-500/10 px-1.5 py-0.5 text-[10px] text-yellow-600"
          title="MySQL DDL auto-commits"
        >
          MySQL DDL auto-commits
        </span>
      )}
      <span className="ml-auto flex items-center gap-1">
        <ActionButton
          icon={<Check size={13} />}
          aria-label="Commit"
          variant="success"
          disabled={isRunningQuery}
          onClick={onCommit}
        />
        <ActionButton
          icon={<Undo2 size={13} />}
          aria-label="Rollback"
          variant="danger"
          disabled={isRunningQuery}
          onClick={onRollback}
        />
      </span>
    </div>
  )
}
