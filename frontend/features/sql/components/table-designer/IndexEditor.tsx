import { Plus, X, ListTree } from 'lucide-react'
import { useDesignerStore } from '../../store/designerStore'

const INDEX_TYPES = ['btree', 'hash', 'gin', 'gist', 'fulltext', 'spatial'] as const

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

  const availableColumns = pendingModel.columns.filter((c) => c.name.trim() !== '')

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Indexes</h3>
          <p className="text-xs text-slate-500">
            Speed up queries on frequently searched columns.
          </p>
        </div>
        <button
          type="button"
          onClick={addIndex}
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={12} /> Add Index
        </button>
      </header>

      {pendingModel.indexes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <ListTree size={28} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">No indexes defined.</p>
          <p className="text-xs text-slate-400">Click "Add Index" to create one.</p>
        </div>
      ) : (
        pendingModel.indexes.map((idx) => (
          <div
            key={idx.id}
            className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <label className="block text-[10px] uppercase tracking-wide text-slate-500">
                  Index Name (optional)
                </label>
                <input
                  type="text"
                  value={idx.name ?? ''}
                  onChange={(e) =>
                    updateIndex(idx.id, { name: e.target.value || null })
                  }
                  placeholder="Auto-generated if empty"
                  className="mt-1 w-full max-w-xs rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
                />
              </div>
              <button
                type="button"
                onClick={() => removeIndex(idx.id)}
                className="rounded p-1 text-red-500 hover:bg-red-50"
                title="Remove index"
              >
                <X size={12} />
              </button>
            </div>

            {/* Columns */}
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500">
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
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-300'
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
                <label className="block text-[10px] uppercase tracking-wide text-slate-500">
                  Type
                </label>
                <select
                  value={idx.indexType}
                  onChange={(e) =>
                    updateIndex(idx.id, {
                      indexType: e.target.value as (typeof INDEX_TYPES)[number],
                    })
                  }
                  className="mt-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
                >
                  {INDEX_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-slate-700 pt-4">
                <input
                  type="checkbox"
                  checked={idx.isUnique}
                  onChange={(e) =>
                    updateIndex(idx.id, { isUnique: e.target.checked })
                  }
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
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
