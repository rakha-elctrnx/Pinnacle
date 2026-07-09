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
          <h3 className="text-sm font-semibold text-slate-800">Primary Key</h3>
          <p className="text-xs text-slate-500">
            Uniquely identifies each row in the table.
          </p>
        </div>
        {!pk && (
          <button
            type="button"
            onClick={handleAdd}
            disabled={availableColumns.length === 0}
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus size={12} /> Add Primary Key
          </button>
        )}
      </header>

      {!pk ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <Key size={28} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">No primary key defined.</p>
          <p className="text-xs text-slate-400">
            Click "Add Primary Key" to create one.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <label className="block text-[10px] uppercase tracking-wide text-slate-500">
                Constraint Name (optional)
              </label>
              <input
                type="text"
                value={pk.name ?? ''}
                onChange={(e) =>
                  setPrimaryKey({ ...pk, name: e.target.value || null })
                }
                placeholder="Auto-generated if empty"
                className="mt-1 w-full max-w-xs rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
              />
            </div>
            <button
              type="button"
              onClick={handleRemove}
              className="rounded p-1 text-red-500 hover:bg-red-50"
              title="Remove primary key"
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
                const selected = pk.columns.includes(col.name)
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => handleToggleColumn(col.name)}
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
      )}
    </section>
  )
}
