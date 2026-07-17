import { useConnectionHealth } from '../../hooks/useConnectionHealth'

const STATES: Record<string, { dot: string; label: string; text: string }> = {
  connected: {
    dot: 'bg-emerald-500',
    label: 'Connected',
    text: 'text-emerald-600',
  },
  reconnecting: {
    dot: 'bg-amber-500',
    label: 'Reconnecting',
    text: 'text-amber-600',
  },
  disconnected: {
    dot: 'bg-slate-400',
    label: 'Disconnected',
    text: 'text-slate-500',
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
    <div className="flex items-center gap-1.5 text-caption">
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      <span className={s.text}>{s.label}</span>
    </div>
  )
}
