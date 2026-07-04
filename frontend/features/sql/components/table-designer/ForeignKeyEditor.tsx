import { Link, Plus, X } from 'lucide-react'
import { useDesignerStore } from '../../store/designerStore'
import type { ReferentialAction } from '../../logic/table-designer'

const REF_ACTIONS: ReferentialAction[] = [
  'NO ACTION',
  'RESTRICT',
  'CASCADE',
  'SET NULL',
  'SET DEFAULT',
]

/**
 * Foreign Key Editor — add/remove foreign keys, select local and
 * referenced columns, set ON UPDATE / ON DELETE behavior.
 */
export function ForeignKeyEditor() {
  const pendingModel = useDesignerStore((s) => s.pendingModel)
  const addForeignKey = useDesignerStore((s) => s.addForeignKey)
  const updateForeignKey = useDesignerStore((s) => s.updateForeignKey)
  const removeForeignKey = useDesignerStore((s) => s.removeForeignKey)

  if (!pendingModel) return null

  const availableColumns = pendingModel.columns.filter((c) => c.name.trim() !== '')

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Foreign Keys</h3>
          <p className="text-xs text-slate-500">
            Define relationships between this table and other tables.
          </p>
        </div>
        <button
          type="button"
          onClick={addForeignKey}
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={12} /> Add Foreign Key
        </button>
      </header>

      {pendingModel.foreignKeys.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <Link size={28} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">No foreign keys defined.</p>
          <p className="text-xs text-slate-400">Click "Add Foreign Key" to create one.</p>
        </div>
      ) : (
        pendingModel.foreignKeys.map((fk) => (
          <div
            key={fk.id}
            className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <label className="block text-[10px] uppercase tracking-wide text-slate-500">
                  Constraint Name (optional)
                </label>
                <input
                  type="text"
                  value={fk.name ?? ''}
                  onChange={(e) =>
                    updateForeignKey(fk.id, { name: e.target.value || null })
                  }
                  placeholder="Auto-generated if empty"
                  className="mt-1 w-full max-w-xs rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
                />
              </div>
              <button
                type="button"
                onClick={() => removeForeignKey(fk.id)}
                className="rounded p-1 text-red-500 hover:bg-red-50"
                title="Remove foreign key"
              >
                <X size={12} />
              </button>
            </div>

            {/* Local columns */}
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500">
                Local Columns
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {availableColumns.map((col) => {
                  const selected = fk.columns.includes(col.name)
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => {
                        const cols = selected
                          ? fk.columns.filter((c) => c !== col.name)
                          : [...fk.columns, col.name]
                        updateForeignKey(fk.id, { columns: cols })
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

            {/* Reference target */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-slate-500">
                  Ref Schema
                </label>
                <input
                  type="text"
                  value={fk.referencedSchema}
                  onChange={(e) =>
                    updateForeignKey(fk.id, { referencedSchema: e.target.value })
                  }
                  placeholder="public"
                  className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] uppercase tracking-wide text-slate-500">
                  Ref Table
                </label>
                <input
                  type="text"
                  value={fk.referencedTable}
                  onChange={(e) =>
                    updateForeignKey(fk.id, { referencedTable: e.target.value })
                  }
                  placeholder="referenced_table"
                  className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500">
                Ref Columns
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {fk.referencedColumns.map((col, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <input
                      type="text"
                      value={col}
                      onChange={(e) => {
                        const next = [...fk.referencedColumns]
                        next[i] = e.target.value
                        updateForeignKey(fk.id, { referencedColumns: next })
                      }}
                      className="w-32 rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = fk.referencedColumns.filter((_, idx) => idx !== i)
                        updateForeignKey(fk.id, { referencedColumns: next })
                      }}
                      className="rounded p-0.5 text-red-400 hover:bg-red-50"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    updateForeignKey(fk.id, {
                      referencedColumns: [...fk.referencedColumns, ''],
                    })
                  }
                  className="rounded-full border border-dashed border-slate-300 px-2 py-1 text-[10px] text-slate-500 hover:border-blue-300 hover:text-blue-600"
                >
                  + Column
                </button>
              </div>
            </div>

            {/* ON UPDATE / ON DELETE */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-slate-500">
                  ON UPDATE
                </label>
                <select
                  value={fk.onUpdate}
                  onChange={(e) =>
                    updateForeignKey(fk.id, {
                      onUpdate: e.target.value as ReferentialAction,
                    })
                  }
                  className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
                >
                  {REF_ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-slate-500">
                  ON DELETE
                </label>
                <select
                  value={fk.onDelete}
                  onChange={(e) =>
                    updateForeignKey(fk.id, {
                      onDelete: e.target.value as ReferentialAction,
                    })
                  }
                  className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
                >
                  {REF_ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))
      )}
    </section>
  )
}
