import { useState } from 'react'
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

  const [expanded, setExpanded] = useState(false)

  if (!pendingModel) return null

  const pk = pendingModel.primaryKey
  const availableColumns = pendingModel.columns.filter((c) => c.name.trim() !== '')

  const handleAdd = () => {
    setPrimaryKey(createDefaultPrimaryKey())
    setExpanded(true)
  }

  const handleRemove = () => {
    setPrimaryKey(null)
    setExpanded(false)
  }

  const handleToggleColumn = (colName: string) => {
    if (!pk) return
    const cols = pk.columns.includes(colName)
      ? pk.columns.filter((c) => c !== colName)
      : [...pk.columns, colName]
    setPrimaryKey({ ...pk, columns: cols })
  }

  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key size={14} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-800">Primary Key</h3>
          {pk && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
              {pk.columns.length} column{pk.columns.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {pk ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="rounded p-1 text-red-500 hover:bg-red-50"
              title="Remove primary key"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleAdd}
            disabled={availableColumns.length === 0}
            className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
          >
            <Plus size={11} /> Add Primary Key
          </button>
        )}
      </header>

      {pk && expanded && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
          <div className="mb-2">
            <label className="block text-[10px] uppercase tracking-wide text-slate-500">
              Constraint Name (optional)
            </label>
            <input
              type="text"
              value={pk.name ?? ''}
              onChange={(e) => setPrimaryKey({ ...pk, name: e.target.value || null })}
              placeholder="Auto-generated if empty"
              className="mt-1 w-full max-w-xs rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
            />
          </div>

          <label className="block text-[10px] uppercase tracking-wide text-slate-500">
            Columns
          </label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {availableColumns.map((col) => {
              const selected = pk.columns.includes(col.name)
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => handleToggleColumn(col.name)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    selected
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-amber-300'
                  }`}
                >
                  {col.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
