import { useConnectionHealth } from '../../hooks/useConnectionHealth'

const STATES: Record<string, { dot: string; label: string; text: string }> = {
  connected: {
    dot: 'bg-success-text',
    label: 'Connected',
    text: 'text-success-text',
  },
  reconnecting: {
    dot: 'bg-[var(--color-warning)]',
    label: 'Reconnecting',
    text: 'text-[var(--color-warning)]',
  },
  disconnected: {
    dot: 'bg-text-muted',
    label: 'Disconnected',
    text: 'text-text-secondary',
  },
}

export function ConnectionStatusBadge({
  connectionId,
}: {
  connectionId: string | null | undefined
}) {
  const health = useConnectionHealth(connectionId)
  if (!health) return null
  const s = STATES[health.state]
  if (!s) return null
  return (
    <div className="flex items-center justify-end border-b border-border-default px-4 py-1.5">
      <div className="flex items-center gap-1.5 text-caption">
        <span className={`h-2 w-2 rounded-full ${s.dot}`} />
        <span className={s.text}>{s.label}</span>
      </div>
    </div>
  )
}
