import { Plus, X, ListTree } from 'lucide-react'
import { useDesignerStore } from '../../store/designerStore'

const INDEX_TYPES = [
  'btree',
  'hash',
  'gin',
  'gist',
  'fulltext',
  'spatial',
] as const

/**
 * Index Editor — add/remove indexes, select columns, set unique
 * toggle and index type.
 */
export function IndexEditor() {
  const pendingModel = useDesignerStore((s) => s.pendingModel)
  const addIndex = useDesignerStore((s) => s.addIndex)
  const updateIndex = useDesignerStore((s) => s.updateIndex)
  const removeIndex = useDesignerStore((s) => s.removeIndex)

  if (!pendingModel) return null

  const availableColumns = pendingModel.columns.filter(
    (c) => c.name.trim() !== '',
  )

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Indexes</h3>
          <p className="text-xs text-text-secondary">
            Speed up queries on frequently searched columns.
          </p>
        </div>
        <button
          type="button"
          onClick={addIndex}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-text-inverse transition-colors hover:bg-primary-hover"
        >
          <Plus size={12} /> Add Index
        </button>
      </header>

      {pendingModel.indexes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-default bg-bg-subtle p-8 text-center">
          <ListTree size={28} className="mx-auto text-text-muted" />
          <p className="mt-2 text-sm text-text-secondary">
            No indexes defined.
          </p>
          <p className="text-xs text-text-muted">
            Click "Add Index" to create one.
          </p>
        </div>
      ) : (
        pendingModel.indexes.map((idx) => (
          <div
            key={idx.id}
            className="rounded-lg border border-border-focus/40 bg-primary-subtle/40 p-3 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <label className="block text-[10px] uppercase tracking-wide text-text-secondary">
                  Index Name (optional)
                </label>
                <input
                  type="text"
                  value={idx.name ?? ''}
                  onChange={(e) =>
                    updateIndex(idx.id, { name: e.target.value || null })
                  }
                  placeholder="Auto-generated if empty"
                  className="mt-1 w-full max-w-xs rounded border border-border-default bg-bg-base px-2 py-1 text-xs outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus/20"
                />
              </div>
              <button
                type="button"
                onClick={() => removeIndex(idx.id)}
                className="rounded p-1 text-[var(--color-danger)] hover:bg-danger-subtle"
                title="Remove index"
              >
                <X size={12} />
              </button>
            </div>

            {/* Columns */}
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-text-secondary">
                Columns
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {availableColumns.map((col) => {
                  const selected = idx.columns.includes(col.name)
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => {
                        const cols = selected
                          ? idx.columns.filter((c) => c !== col.name)
                          : [...idx.columns, col.name]
                        updateIndex(idx.id, { columns: cols })
                      }}
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

            {/* Type & Unique */}
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-text-secondary">
                  Type
                </label>
                <select
                  value={idx.indexType}
                  onChange={(e) =>
                    updateIndex(idx.id, {
                      indexType: e.target.value as (typeof INDEX_TYPES)[number],
                    })
                  }
                  className="mt-1 rounded border border-border-default bg-bg-base px-2 py-1 text-xs outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus/20"
                >
                  {INDEX_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-text-primary pt-4">
                <input
                  type="checkbox"
                  checked={idx.isUnique}
                  onChange={(e) =>
                    updateIndex(idx.id, { isUnique: e.target.checked })
                  }
                  className="h-3.5 w-3.5 rounded border-border-default text-primary focus:ring-border-focus"
                />
                Unique
              </label>
            </div>
          </div>
        ))
      )}
    </section>
  )
}
