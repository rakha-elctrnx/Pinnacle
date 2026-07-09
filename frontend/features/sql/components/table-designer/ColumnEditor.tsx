import { Database, X, Plus } from 'lucide-react'
import type { ColumnDefinition } from '../../logic/table-designer'
import { useDesignerStore } from '../../store/designerStore'
import { Combobox } from '../../../_shared/components/ui/Combobox'

const COMMON_DATA_TYPES = [
  'VARCHAR',
  'TEXT',
  'INT',
  'BIGINT',
  'SMALLINT',
  'DECIMAL',
  'NUMERIC',
  'FLOAT',
  'DOUBLE',
  'BOOLEAN',
  'DATE',
  'TIME',
  'TIMESTAMP',
  'TIMESTAMPTZ',
  'UUID',
  'JSON',
  'JSONB',
  'BYTEA',
  'SERIAL',
  'BIGSERIAL',
]

const NEEDS_LENGTH = ['VARCHAR', 'CHAR', 'NVARCHAR']
const NEEDS_PRECISION = ['DECIMAL', 'NUMERIC', 'FLOAT']

/**
 * Column Editor — table-style list of columns with add/edit/delete/reorder.
 * Edits are committed to the designer store on every input change.
 */
export function ColumnEditor() {
  const pendingModel = useDesignerStore((s) => s.pendingModel)
  const errors = useDesignerStore((s) => s.errors)
  const addColumn = useDesignerStore((s) => s.addColumn)
  const updateColumn = useDesignerStore((s) => s.updateColumn)
  const removeColumn = useDesignerStore((s) => s.removeColumn)
  const moveColumn = useDesignerStore((s) => s.moveColumn)

  // Find column-level errors by id
  const columnErrors = new Map<string, string[]>()
  for (const err of errors) {
    if (err.path) {
      const list = columnErrors.get(err.path) ?? []
      list.push(err.message)
      columnErrors.set(err.path, list)
    }
  }

  if (!pendingModel) return null

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Columns</h3>
          <p className="text-xs text-slate-500">
            Define the column structure of the table. Reorder with up/down
            arrows.
          </p>
        </div>
        <button
          type="button"
          onClick={addColumn}
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={12} /> Add Column
        </button>
      </header>

      {pendingModel.columns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <Database size={28} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">No columns yet.</p>
          <p className="text-xs text-slate-400">Click "Add Column" to begin.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="w-8 px-2 py-2 text-center">#</th>
                <th className="w-10 px-2 py-2 text-center">Ord</th>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Type</th>
                <th className="w-20 px-2 py-2">Length</th>
                <th className="px-2 py-2 text-center">Null</th>
                <th className="px-2 py-2">Default</th>
                <th className="px-2 py-2 text-center">Auto</th>
                <th className="px-2 py-2">Comment</th>
                <th className="w-20 px-2 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingModel.columns.map((col, idx) => (
                <ColumnRow
                  key={col.id}
                  column={col}
                  index={idx}
                  total={pendingModel.columns.length}
                  errorMessages={columnErrors.get(col.id) ?? []}
                  onChange={(changes) => updateColumn(col.id, changes)}
                  onRemove={() => removeColumn(col.id)}
                  onMoveUp={() => moveColumn(col.id, 'up')}
                  onMoveDown={() => moveColumn(col.id, 'down')}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ── Column Row ─────────────────────────────────────────────────────

interface ColumnRowProps {
  column: ColumnDefinition
  index: number
  total: number
  errorMessages: string[]
  onChange: (changes: Partial<ColumnDefinition>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

function ColumnRow({
  column,
  index,
  total,
  errorMessages,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: ColumnRowProps) {
  const dataType = column.dataType.toUpperCase()
  const needsLength = NEEDS_LENGTH.includes(dataType)
  const needsPrecision = NEEDS_PRECISION.includes(dataType)
  const hasError = errorMessages.length > 0

  return (
    <tr
      className={`border-b border-slate-100 ${hasError ? 'bg-red-50/40' : 'hover:bg-slate-50/50'}`}
    >
      <td className="px-2 py-1.5 text-center text-slate-400">{index + 1}</td>
      <td className="px-2 py-1.5">
        <div className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30"
            title="Move up"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30"
            title="Move down"
          >
            ▼
          </button>
        </div>
      </td>
      <td className="px-2 py-1.5">
        <input
          type="text"
          value={column.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="column_name"
          className={`w-full rounded border bg-white px-2 py-1 text-xs outline-none focus:ring-1 ${
            hasError
              ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
              : 'border-slate-200 focus:border-blue-300 focus:ring-blue-100'
          }`}
        />
      </td>
      <td className="px-2 py-1.5">
        <DataTypeSelect
          value={column.dataType}
          onChange={(value) => {
            onChange({ dataType: value })
            // Reset length/precision when type changes
            const upper = value.toUpperCase()
            if (!NEEDS_LENGTH.includes(upper)) onChange({ length: null })
            if (!NEEDS_PRECISION.includes(upper)) {
              onChange({ precision: null, scale: null })
            }
          }}
        />
      </td>
      <td className="px-2 py-1.5">
        {needsLength ? (
          <input
            type="text"
            inputMode="numeric"
            value={column.length ?? ''}
            onChange={(e) =>
              onChange({
                length: e.target.value ? Number(e.target.value) : null,
              })
            }
            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
            placeholder="255"
          />
        ) : needsPrecision ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              inputMode="numeric"
              value={column.precision ?? ''}
              onChange={(e) =>
                onChange({
                  precision: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
              placeholder="10"
            />
            <input
              type="text"
              inputMode="numeric"
              value={column.scale ?? ''}
              onChange={(e) =>
                onChange({
                  scale: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
              placeholder="0"
            />
          </div>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={column.isNullable}
          onChange={(e) => onChange({ isNullable: e.target.checked })}
          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="text"
          value={column.defaultValue ?? ''}
          onChange={(e) => onChange({ defaultValue: e.target.value || null })}
          placeholder="NULL"
          className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={column.isAutoIncrement}
          onChange={(e) => onChange({ isAutoIncrement: e.target.checked })}
          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          disabled={!['INT', 'BIGINT', 'SMALLINT'].includes(dataType)}
          title={
            !['INT', 'BIGINT', 'SMALLINT'].includes(dataType)
              ? 'Auto-increment only for integer types'
              : ''
          }
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="text"
          value={column.comment ?? ''}
          onChange={(e) => onChange({ comment: e.target.value || null })}
          placeholder="—"
          className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-red-500 hover:bg-red-50"
          title="Remove column"
        >
          <X size={12} />
        </button>
      </td>
    </tr>
  )
}

// ── Data Type Selector with Autocomplete ──────────────────────────

interface DataTypeSelectProps {
  value: string
  onChange: (value: string) => void
}

const DATA_TYPE_ITEMS = COMMON_DATA_TYPES.map((t) => ({ value: t, label: t }))

function DataTypeSelect({ value, onChange }: DataTypeSelectProps) {
  return (
    <Combobox
      value={value}
      onChange={onChange}
      items={DATA_TYPE_ITEMS}
      placeholder="data type"
      allowCustom
    />
  )
}
