import { Plus, X, Copy } from 'lucide-react'
import { useDesignerStore } from '../../store/designerStore'

/**
 * Unique Constraint Editor — add/remove unique constraints,
 * select columns for each, and optionally name them.
 */
export function UniqueConstraintEditor() {
  const pendingModel = useDesignerStore((s) => s.pendingModel)
  const addUniqueConstraint = useDesignerStore((s) => s.addUniqueConstraint)
  const updateUniqueConstraint = useDesignerStore((s) => s.updateUniqueConstraint)
  const removeUniqueConstraint = useDesignerStore((s) => s.removeUniqueConstraint)

  if (!pendingModel) return null

  const availableColumns = pendingModel.columns.filter((c) => c.name.trim() !== '')

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Unique Constraints</h3>
          <p className="text-xs text-slate-500">
            Ensure values in selected columns are unique across all rows.
          </p>
        </div>
        <button
          type="button"
          onClick={addUniqueConstraint}
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={12} /> Add Unique
        </button>
      </header>

      {pendingModel.uniqueConstraints.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <Copy size={28} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">No unique constraints defined.</p>
          <p className="text-xs text-slate-400">Click "Add Unique" to create one.</p>
        </div>
      ) : (
        pendingModel.uniqueConstraints.map((uq) => (
          <div
            key={uq.id}
            className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <label className="block text-[10px] uppercase tracking-wide text-slate-500">
                  Constraint Name (optional)
                </label>
                <input
                  type="text"
                  value={uq.name ?? ''}
                  onChange={(e) =>
                    updateUniqueConstraint(uq.id, { name: e.target.value || null })
                  }
                  placeholder="Auto-generated if empty"
                  className="mt-1 w-full max-w-xs rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
                />
              </div>
              <button
                type="button"
                onClick={() => removeUniqueConstraint(uq.id)}
                className="rounded p-1 text-red-500 hover:bg-red-50"
                title="Remove constraint"
              >
                <X size={12} />
              </button>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500">
                Columns
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {availableColumns.map((col) => {
                  const selected = uq.columns.includes(col.name)
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => {
                        const cols = selected
                          ? uq.columns.filter((c) => c !== col.name)
                          : [...uq.columns, col.name]
                        updateUniqueConstraint(uq.id, { columns: cols })
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
          </div>
        ))
      )}
    </section>
  )
}
