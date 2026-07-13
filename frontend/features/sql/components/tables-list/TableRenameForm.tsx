interface TableRenameFormProps {
  tableName: string
  value: string
  onChange: (val: string) => void
  onSave: () => void
  onCancel: () => void
  disabled: boolean
}

export function TableRenameForm({
  tableName,
  value,
  onChange,
  onSave,
  onCancel,
  disabled,
}: TableRenameFormProps) {
  return (
    <div
      className="flex items-center gap-2 border-b border-border-default bg-bg-subtle px-3 py-1.5 animate-in slide-in-from-top-1 duration-150"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="shrink-0 text-label text-text-secondary">
        Rename:
      </span>
      <span className="shrink-0 rounded bg-bg-muted px-1.5 py-0.5 text-mono text-text-primary">
        {tableName}
      </span>
      <span className="shrink-0 text-caption text-text-muted">to</span>
      <input
        type="text"
        placeholder="New table name"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSave()
        }}
        className="w-56 rounded-md border border-border-default bg-bg-base px-2.5 py-1 text-label text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
      />
      <button
        type="button"
        onClick={onSave}
        disabled={disabled}
        className="rounded bg-primary px-2.5 py-1 text-label text-text-inverse transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded px-2 py-1 text-label text-text-secondary transition-colors hover:bg-bg-subtle"
      >
        Cancel
      </button>
    </div>
  )
}
