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
        <div className="flex items-center gap-2">
          <Copy size={14} className="text-teal-500" />
          <h3 className="text-sm font-semibold text-slate-800">Unique Constraints</h3>
        </div>
        <button
          type="button"
          onClick={addUniqueConstraint}
          className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-100"
        >
          <Plus size={11} /> Add Unique
        </button>
      </header>

      {pendingModel.uniqueConstraints.length === 0 && (
        <p className="text-xs text-slate-400 italic">No unique constraints defined.</p>
      )}

      {pendingModel.uniqueConstraints.map((uq) => (
        <div
          key={uq.id}
          className="rounded-lg border border-teal-200 bg-teal-50/30 p-3"
        >
          <div className="mb-2 flex items-start justify-between">
            <div>
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

          <label className="block text-[10px] uppercase tracking-wide text-slate-500">
            Columns
          </label>
          <div className="mt-1 flex flex-wrap gap-1.5">
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
                      ? 'bg-teal-500 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-teal-300'
                  }`}
                >
                  {col.name}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
