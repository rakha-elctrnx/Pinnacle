import { AlertTriangle, Plus, Pencil, Trash2 } from 'lucide-react'
import type {
  SchemaChangeItem,
  SchemaDiffSummary,
} from '../../logic/table-designer'

interface SchemaDiffPanelProps {
  diff: SchemaDiffSummary | null
}

/**
 * Schema Diff Panel — shows grouped schema changes with destructive
 * operations highlighted in warning color.
 */
export function SchemaDiffPanel({ diff }: SchemaDiffPanelProps) {
  if (!diff || !diff.hasChanges) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <p className="text-sm text-slate-500">No changes detected.</p>
          <p className="text-xs text-slate-400">
            Edit the table structure to see a diff here.
          </p>
        </div>
      </div>
    )
  }

  const grouped = groupByTarget(diff.changes)

  return (
    <div className="flex flex-col gap-3 overflow-auto p-4">
      {/* Summary */}
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
          {diff.changes.length} change{diff.changes.length !== 1 ? 's' : ''}
        </span>
        {diff.destructiveCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
            <AlertTriangle size={11} />
            {diff.destructiveCount} destructive
          </span>
        )}
      </div>

      {/* Grouped changes */}
      {Object.entries(grouped).map(([target, items]) => (
        <div key={target} className="space-y-1.5">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {targetLabels[target as keyof typeof targetLabels] ?? target}
          </h4>
          {items.map((item, i) => (
            <ChangeItem key={`${target}-${i}`} item={item} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────

const targetLabels = {
  column: 'Columns',
  primaryKey: 'Primary Key',
  uniqueConstraint: 'Unique Constraints',
  foreignKey: 'Foreign Keys',
  index: 'Indexes',
}

function groupByTarget(changes: SchemaChangeItem[]) {
  const groups: Record<string, SchemaChangeItem[]> = {}
  for (const change of changes) {
    if (!groups[change.target]) groups[change.target] = []
    groups[change.target].push(change)
  }
  return groups
}

function ChangeItem({ item }: { item: SchemaChangeItem }) {
  const iconMap = {
    add: { icon: Plus, color: 'text-green-600 bg-green-50' },
    modify: { icon: Pencil, color: 'text-blue-600 bg-blue-50' },
    remove: { icon: Trash2, color: 'text-red-600 bg-red-50' },
  }
  const { icon: Icon, color } = iconMap[item.type]

  return (
    <div
      className={`rounded-lg border p-2.5 ${
        item.isDestructive
          ? 'border-red-200 bg-red-50/40'
          : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 rounded-md p-1 ${color}`}>
          <Icon size={11} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-800">
            {item.description}
          </p>
          {item.details.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {item.details.map((d, i) => (
                <li key={i} className="text-[11px] text-slate-500">
                  {d}
                </li>
              ))}
            </ul>
          )}
          {item.isDestructive && (
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-red-600">
              <AlertTriangle size={10} /> Destructive operation
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
