interface QueryHistoryPanelProps {
  history: string[]
  onSelectQuery: (sql: string) => void
}

export function QueryHistoryPanel({
  history,
  onSelectQuery,
}: QueryHistoryPanelProps) {
  return (
    <div className="border-t border-border-default bg-bg-subtle/50 px-1.5 py-1.5">
      <div className="max-h-28 space-y-0.5 overflow-auto">
        {history.length === 0 && (
          <p className="px-2 py-1 text-caption text-text-muted">
            No history yet.
          </p>
        )}
        {history.map((q, i) => (
          <button
            key={`${i}-${q}`}
            type="button"
            onClick={() => onSelectQuery(q)}
            className="block w-full truncate rounded px-2 py-0.5 text-left text-[11px] font-mono text-text-primary transition-colors hover:bg-bg-hover"
            title={q}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
