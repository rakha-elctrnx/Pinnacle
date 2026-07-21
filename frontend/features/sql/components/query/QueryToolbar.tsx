import {
  Play,
  ListEnd,
  HelpCircle,
  WrapText,
  Minimize2,
  History,
  LoaderCircle,
  ChevronDown,
} from 'lucide-react'
import { useState } from 'react'
import { ActionButton } from '../../../_shared/components/ui/ActionButton'
import { Dropdown } from '../../../_shared/components/ui/Dropdown'

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
  const [runMenuOpen, setRunMenuOpen] = useState(false)

  return (
    <div className="flex items-center gap-1 border-b border-border-default px-1.5 py-1.5 animate-in fade-in duration-200">
      <div className="relative">
        <div className="flex items-stretch">
          <ActionButton
            icon={isRunningQuery ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />}
            aria-label={isRunningQuery ? 'Running…' : 'Run (Ctrl+Enter)'}
            variant="accent"
            disabled={isRunningQuery}
            className="rounded-r-none"
            onClick={() => onRunQuery('run')}
          />
          <button
            type="button"
            aria-label="Run options"
            disabled={isRunningQuery}
            onClick={() => setRunMenuOpen((v) => !v)}
            className="flex items-center rounded-r-lg px-1 text-primary transition hover:bg-primary/10 active:bg-primary/15 active:scale-95 disabled:cursor-not-allowed disabled:text-[var(--color-disabled-text)]"
          >
            <ChevronDown size={12} />
          </button>
        </div>
        <Dropdown
          open={runMenuOpen}
          onClose={() => setRunMenuOpen(false)}
          align="left"
          items={[
            {
              label: 'Run',
              icon: <Play size={14} />,
              shortcut: 'Ctrl+Enter',
              action: () => onRunQuery('run'),
            },
            {
              label: 'Run Selected',
              icon: <ListEnd size={14} />,
              shortcut: 'Ctrl+Shift+Enter',
              action: () => onRunQuery('run-selected'),
            },
          ]}
        />
      </div>
      <div className="ml-1.5 flex items-center gap-1">
        <span className="text-[11px] font-mono text-text-muted">Tx:</span>
        <select
          value={transactionMode ? 'manual' : 'auto'}
          onChange={() => onToggleTransactionMode()}
          disabled={isRunningQuery}
          aria-label="Transaction Mode"
          className="h-6 rounded border border-border-default bg-bg-base px-1 text-[11px] font-mono outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="auto">Auto</option>
          <option value="manual">Manual</option>
        </select>
      </div>
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
        icon={<HelpCircle size={14} />}
        aria-label="Explain"
        disabled={isRunningQuery}
        onClick={() => onRunQuery('explain')}
      />
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
