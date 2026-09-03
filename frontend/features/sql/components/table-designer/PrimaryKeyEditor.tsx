import { Key, Plus, X } from 'lucide-react'
import { useDesignerStore } from '../../store/designerStore'
import { createDefaultPrimaryKey } from '../../logic/table-designer/utils'

/**
 * Primary Key Editor — allows selecting one or more columns to form
 * the primary key constraint, with an optional constraint name.
 */
export function PrimaryKeyEditor() {
  const pendingModel = useDesignerStore((s) => s.pendingModel)
  const setPrimaryKey = useDesignerStore((s) => s.setPrimaryKey)

  if (!pendingModel) return null

  const pk = pendingModel.primaryKey
  const availableColumns = pendingModel.columns.filter(
    (c) => c.name.trim() !== '',
  )

  const handleAdd = () => {
    setPrimaryKey(createDefaultPrimaryKey())
  }

  const handleRemove = () => {
    setPrimaryKey(null)
  }

  const handleToggleColumn = (colName: string) => {
    if (!pk) return
    const cols = pk.columns.includes(colName)
      ? pk.columns.filter((c) => c !== colName)
      : [...pk.columns, colName]
    setPrimaryKey({ ...pk, columns: cols })
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            Primary Key
          </h3>
          <p className="text-xs text-text-secondary">
            Uniquely identifies each row in the table.
          </p>
        </div>
        {!pk && (
          <button
            type="button"
            onClick={handleAdd}
            disabled={availableColumns.length === 0}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-text-inverse transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            <Plus size={12} /> Add Primary Key
          </button>
        )}
      </header>

      {!pk ? (
        <div className="rounded-lg border border-dashed border-border-default bg-bg-subtle p-8 text-center">
          <Key size={28} className="mx-auto text-text-muted" />
          <p className="mt-2 text-sm text-text-secondary">
            No primary key defined.
          </p>
          <p className="text-xs text-text-muted">
            Click "Add Primary Key" to create one.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border-focus/40 bg-primary-subtle/40 p-3 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <label className="block text-[10px] uppercase tracking-wide text-text-secondary">
                Constraint Name (optional)
              </label>
              <input
                type="text"
                value={pk.name ?? ''}
                onChange={(e) =>
                  setPrimaryKey({ ...pk, name: e.target.value || null })
                }
                placeholder="Auto-generated if empty"
                className="mt-1 w-full max-w-xs rounded border border-border-default bg-bg-base px-2 py-1 text-xs outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus/20"
              />
            </div>
            <button
              type="button"
              onClick={handleRemove}
              className="rounded p-1 text-[var(--color-danger)] hover:bg-danger-subtle"
              title="Remove primary key"
            >
              <X size={12} />
            </button>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wide text-text-secondary">
              Columns
            </label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {availableColumns.map((col) => {
                const selected = pk.columns.includes(col.name)
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => handleToggleColumn(col.name)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-primary text-text-inverse shadow-sm'
                        : 'border border-border-default bg-bg-base text-text-secondary hover:border-border-focus'
                    }`}
                  >
                    {col.name}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
