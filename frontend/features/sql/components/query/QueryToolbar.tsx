import {
  Play,
  ListEnd,
  Sparkles,
  GitBranch,
  WrapText,
  Minimize2,
  History,
  LoaderCircle,
} from 'lucide-react'
import { ActionButton } from '../../../_shared/components/ui/ActionButton'

interface QueryToolbarProps {
  connectionType: string
  queryDatabase: string
  querySchema: string
  databases: string[]
  schemas: string[]
  querySql: string
  isRunningQuery: boolean
  transactionMode: boolean
  historyOpen: boolean
  onRunQuery: (mode: 'run' | 'run-selected' | 'explain') => void
  onToggleTransactionMode: () => void
  onBeautify: () => void
  onMinify: () => void
  onToggleHistory: () => void
  onDatabaseChange: (db: string) => void
  onSchemaChange: (schema: string) => void
}

export function QueryToolbar({
  connectionType,
  queryDatabase,
  querySchema,
  databases,
  schemas,
  querySql,
  isRunningQuery,
  transactionMode,
  historyOpen,
  onRunQuery,
  onToggleTransactionMode,
  onBeautify,
  onMinify,
  onToggleHistory,
  onDatabaseChange,
  onSchemaChange,
}: QueryToolbarProps) {
  return (
    <div className="flex items-center gap-1 border-b border-border-default px-1.5 py-1.5 animate-in fade-in duration-200">
      <ActionButton
        icon={isRunningQuery ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />}
        aria-label={isRunningQuery ? 'Running…' : 'Run (Ctrl+Enter)'}
        variant="accent"
        disabled={isRunningQuery}
        onClick={() => onRunQuery('run')}
      />
      <ActionButton
        icon={<ListEnd size={14} />}
        aria-label="Run Selected"
        variant="accent"
        disabled={isRunningQuery}
        onClick={() => onRunQuery('run-selected')}
      />
      <ActionButton
        icon={<Sparkles size={14} />}
        aria-label="Explain"
        disabled={isRunningQuery}
        onClick={() => onRunQuery('explain')}
      />
      <span className="mx-0.5 h-5 w-px bg-border-default" />
      <ActionButton
        icon={<GitBranch size={14} />}
        aria-label="Transaction Mode"
        variant={transactionMode ? 'accent' : 'default'}
        disabled={isRunningQuery}
        onClick={onToggleTransactionMode}
      />
      <span className="mx-0.5 h-5 w-px bg-border-default" />
      <ActionButton
        icon={<WrapText size={14} />}
        aria-label="Beautify SQL"
        disabled={isRunningQuery || !querySql.trim()}
        onClick={onBeautify}
      />
      <ActionButton
        icon={<Minimize2 size={14} />}
        aria-label="Minify SQL"
        disabled={isRunningQuery || !querySql.trim()}
        onClick={onMinify}
      />
      <span className="mx-0.5 h-5 w-px bg-border-default" />
      <ActionButton
        icon={<History size={14} />}
        aria-label="Query History"
        variant={historyOpen ? 'accent' : 'default'}
        onClick={onToggleHistory}
      />
      <span className="ml-auto" />
      <div className="flex items-center gap-1.5">
        <span className="rounded border border-border-default bg-bg-subtle px-1.5 py-0.5 text-[10px] text-text-muted">
          {connectionType || 'sql'}
        </span>
        <select
          value={queryDatabase}
          onChange={(e) => onDatabaseChange(e.target.value)}
          className="h-6 rounded border border-border-default bg-bg-base px-1 text-[11px] font-mono outline-none focus:border-primary"
        >
          {!databases.includes(queryDatabase) && queryDatabase && (
            <option value={queryDatabase}>{queryDatabase}</option>
          )}
          {databases.map((db) => (
            <option key={db} value={db}>
              {db}
            </option>
          ))}
        </select>
        {connectionType === 'postgresql' && (
          <select
            value={querySchema}
            onChange={(e) => onSchemaChange(e.target.value)}
            className="h-6 rounded border border-border-default bg-bg-base px-1 text-[11px] font-mono outline-none focus:border-primary"
          >
            {!schemas.includes(querySchema) && querySchema && (
              <option value={querySchema}>{querySchema}</option>
            )}
            {schemas.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}
