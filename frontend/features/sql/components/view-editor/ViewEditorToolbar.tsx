import { Play, Save, Database } from 'lucide-react'
import { ActionButton } from '../../../_shared/components/ui/ActionButton'

interface ViewEditorToolbarProps {
  isNewView: boolean
  viewName?: string
  selectedDb: string
  selectedSchema: string
  databases: string[]
  schemas: string[]
  connectionType?: string
  disabled: boolean
  onRun: () => void
  onSave: () => void
  onDbChange: (db: string) => void
  onSchemaChange: (schema: string) => void
}

export function ViewEditorToolbar({
  isNewView,
  viewName,
  selectedDb,
  selectedSchema,
  databases,
  schemas,
  connectionType,
  disabled,
  onRun,
  onSave,
  onDbChange,
  onSchemaChange,
}: ViewEditorToolbarProps) {
  return (
    <div className="flex items-center gap-1 border-b border-border-default px-1.5 py-1.5 animate-in fade-in duration-200">
      <ActionButton
        icon={<Play size={14} />}
        aria-label="Run (Ctrl+Enter)"
        variant="accent"
        disabled={disabled}
        onClick={onRun}
      />
      <ActionButton
        icon={<Save size={14} />}
        aria-label={isNewView ? 'Create View' : 'Save View'}
        variant="success"
        disabled={disabled}
        onClick={onSave}
      />
      <span className="mx-0.5 h-5 w-px bg-border-default" />
      <div className="flex items-center gap-1.5">
        <select
          value={selectedDb}
          onChange={(e) => onDbChange(e.target.value)}
          className="h-6 rounded border border-border-default bg-bg-base px-1 text-[11px] font-mono outline-none focus:border-primary"
        >
          {!databases.includes(selectedDb) && selectedDb && (
            <option value={selectedDb}>{selectedDb}</option>
          )}
          {databases.map((db) => (
            <option key={db} value={db}>
              {db}
            </option>
          ))}
        </select>
        {connectionType === 'postgresql' && (
          <select
            value={selectedSchema}
            onChange={(e) => onSchemaChange(e.target.value)}
            className="h-6 rounded border border-border-default bg-bg-base px-1 text-[11px] font-mono outline-none focus:border-primary"
          >
            {schemas.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>
      <span className="ml-auto flex items-center gap-1 text-[11px] text-text-muted">
        <Database size={12} />
        {isNewView ? 'Create View' : `Edit: ${viewName}`}
      </span>
    </div>
  )
}
