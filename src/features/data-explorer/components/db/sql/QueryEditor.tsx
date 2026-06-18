import Editor, { type BeforeMount } from '@monaco-editor/react'
import { Download, Play, Save } from 'lucide-react'
import type { QueryResult, QueryResultTab, QueryTab, SavedQuery } from '../../../types'
import type { ExplorerTreeData } from '../../../types'
import { downloadTextFile, createCsv } from '../../../utils'
import type { SchemaColumn } from '../../../../../types/domain'
import { useEffect, useRef } from 'react'
import { registerSqlProviders } from './SqlCompletionProvider'
import { validateSql } from './SqlValidator'
import type { OnMount } from '@monaco-editor/react'
import * as monacoEditor from 'monaco-editor'

interface QueryEditorProps {
  queryTabs: QueryTab[]
  activeQueryTab: QueryTab
  activeQueryTabId: string
  schemaColumnsByTable: Record<string, SchemaColumn[]>
  isRunningQuery: boolean
  queryResult: QueryResult | null
  queryMessages: string[]
  queryResultTab: QueryResultTab
  queryHistoryByConnection: string[]
  savedQueries: SavedQuery[]
  displayColumns: string[]
  displayRows: Record<string, string>[]
  treeData: ExplorerTreeData | null
  selectedConnectionType: string
  queryDatabase: string
  querySchema: string
  onQueryDatabaseChange: (db: string) => void
  onQuerySchemaChange: (schema: string) => void
  onActiveQueryTabIdChange: (id: string) => void
  onAddQueryTab: () => void
  onUpdateActiveQuery: (value: string) => void
  onSaveQuery: () => void
  onUseSavedQuery: (sql: string) => void
  onQueryResultTabChange: (tab: QueryResultTab) => void
  onRunQuery: (mode: 'run' | 'run-selected' | 'explain') => Promise<void>
}

const RESULT_TABS: QueryResultTab[] = ['results', 'messages', 'statistics']

export function QueryEditor({
  activeQueryTab,
  isRunningQuery,
  queryResult,
  activeQueryTabId,
  queryMessages,
  queryResultTab,
  queryHistoryByConnection,
  displayColumns,
  displayRows,
  treeData,
  selectedConnectionType,
  queryDatabase,
  querySchema,
  schemaColumnsByTable,
  onQueryDatabaseChange,
  onQuerySchemaChange,
  onUpdateActiveQuery,
  onSaveQuery,
  onQueryResultTabChange,
  onRunQuery,
}: QueryEditorProps) {
  const databaseOptions = treeData?.databases.map((db) => db.name) ?? []
  const schemaOptions =
    treeData?.databases
      .find((db) => db.name === (queryDatabase || treeData?.databases[0]?.name))
      ?.schemas.map((s) => s.name) ?? []

  // Keep a stable ref so the registered provider always sees fresh schema data
  const rawSchemaColumns = JSON.stringify(schemaColumnsByTable)
  const tablesRef = useRef<Record<string, SchemaColumn[]>>(
    JSON.parse(rawSchemaColumns),
  )
  useEffect(() => {
    tablesRef.current = JSON.parse(rawSchemaColumns)
  }, [rawSchemaColumns, activeQueryTabId])

  // Refs to editor instance and monaco namespace for validator
  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof monacoEditor | null>(null)

  // Re-run validator whenever the SQL changes
  useEffect(() => {
    const editor = editorRef.current
    const mono = monacoRef.current
    if (!editor || !mono) return
    const model = editor.getModel()
    if (!model) return
    const markers = validateSql(activeQueryTab.sql, mono)
    mono.editor.setModelMarkers(model, 'sql-validator', markers)
  }, [activeQueryTab.sql])

  const handleMount: OnMount = (editor, mono) => {
    editorRef.current = editor
    monacoRef.current = mono as unknown as typeof monacoEditor
    // Run validator immediately on mount
    const model = editor.getModel()
    if (model) {
      const markers = validateSql(activeQueryTab.sql, mono as unknown as typeof monacoEditor)
        ; (mono as unknown as typeof monacoEditor).editor.setModelMarkers(model, 'sql-validator', markers)
    }
  }

  // Register the enhanced providers once, before the editor mounts.
  // Monaco deduplicates provider registrations by language, so this is safe
  // to call multiple times (it does nothing on subsequent mounts).
  const handleBeforeMount: BeforeMount = (monacoInstance) => {
    registerSqlProviders(monacoInstance, tablesRef)
  }

  return (
    <section className="bg-white">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Database selector */}
          <select
            value={queryDatabase}
            onChange={(e) => onQueryDatabaseChange(e.target.value)}
            className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-300"
          >
            <option value="">Default</option>
            {databaseOptions.map((db) => (
              <option key={db} value={db}>{db}</option>
            ))}
          </select>

          {/* Schema selector (PostgreSQL only) */}
          {selectedConnectionType === 'postgresql' && (
            <select
              value={querySchema}
              onChange={(e) => onQuerySchemaChange(e.target.value)}
              className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-300"
            >
              <option value="">Default schema</option>
              {schemaOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onRunQuery('run')}
            disabled={isRunningQuery}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Play size={13} />
            Run
          </button>
          <button
            type="button"
            onClick={() => onRunQuery('run-selected')}
            disabled={isRunningQuery}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Run Selected
          </button>
          <button
            type="button"
            onClick={() => onRunQuery('explain')}
            disabled={isRunningQuery}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Explain
          </button>
          <button
            type="button"
            onClick={onSaveQuery}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <Save size={13} />
            Save Query
          </button>
        </div>
      </div>

      <Editor
        height="220px"
        language="sql"
        value={activeQueryTab.sql}
        onChange={(value) => onUpdateActiveQuery(value ?? '')}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          wordWrap: 'on',
          quickSuggestions: {
            other: true,
            comments: false,
            strings: false,
          },
          suggestOnTriggerCharacters: true,
          // Show parameter hints for functions automatically
          parameterHints: { enabled: true },
          // Better tab completion behaviour
          tabCompletion: 'on',
          // Accept suggestion with Tab (like DataGrip)
          acceptSuggestionOnCommitCharacter: true,
          acceptSuggestionOnEnter: 'smart',
          // Larger completion popup — more rows visible at once
          suggest: {
            showKeywords: true,
            showSnippets: true,
            showFunctions: true,
            showClasses: true,    // tables
            showFields: true,     // columns
            showWords: false,     // disable noisy word-based guesses
            insertMode: 'replace',
            preview: true,
          },
          // Show documentation card next to suggestion list
          suggestFontSize: 13,
          suggestLineHeight: 22,
        }}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
      />

      {queryResult && (
        <div className="mt-3 border border-slate-200 bg-slate-50 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-md border border-slate-200 bg-white p-1">
              {RESULT_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => onQueryResultTabChange(tab)}
                  className={[
                    'rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition-colors',
                    queryResultTab === tab
                      ? 'bg-slate-100 text-slate-800'
                      : 'text-slate-500 hover:bg-slate-50',
                  ].join(' ')}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!queryResult) return
                  downloadTextFile(
                    'query-result.json',
                    JSON.stringify(queryResult.rows, null, 2),
                    'application/json',
                  )
                }}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-100"
              >
                <Download size={13} /> JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!queryResult) return
                  const csv = createCsv(queryResult.columns, queryResult.rows)
                  downloadTextFile('query-result.csv', csv, 'text/csv')
                }}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-100"
              >
                <Download size={13} /> CSV
              </button>
            </div>
          </div>

          {queryResultTab === 'results' && (
            <div className="max-h-56 overflow-auto rounded-md border border-slate-200 bg-white">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
                  <tr>
                    {displayColumns.map((column) => (
                      <th
                        key={column}
                        className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.slice(0, 20).map((row, index) => (
                    <tr key={index} className="even:bg-slate-50/60 hover:bg-slate-50">
                      {displayColumns.map((column) => (
                        <td
                          key={`${index}-${column}`}
                          className="border-b border-slate-100 px-2 py-1.5 text-slate-700"
                        >
                          {String(row[column] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {queryResultTab === 'messages' && (
            <ul className="max-h-52 space-y-1 overflow-auto rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700">
              {queryMessages.map((message, index) => (
                <li key={`${message}-${index}`} className="rounded px-2 py-1 hover:bg-slate-50">
                  {message}
                </li>
              ))}
            </ul>
          )}

          {queryResultTab === 'statistics' && (
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                <p className="text-slate-400">Rows Returned</p>
                <p className="font-semibold text-slate-700">
                  {queryResult?.rows.length ?? displayRows.length}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                <p className="text-slate-400">Execution Time</p>
                <p className="font-semibold text-slate-700">{queryResult?.elapsedMs ?? 0} ms</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                <p className="text-slate-400">Rows Affected</p>
                <p className="font-semibold text-slate-700">{queryResult?.rowsAffected ?? 0}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {queryResult && (
        <div className="border border-slate-200 border-t-0 bg-slate-50 p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Query History
            </p>
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
              {queryHistoryByConnection.length} items
            </span>
          </div>
          <div className="max-h-40 space-y-1 overflow-auto text-xs text-slate-600">
            {queryHistoryByConnection.length === 0 && (
              <p className="rounded-md bg-white px-2 py-1.5 text-slate-400">No query history yet.</p>
            )}
            {queryHistoryByConnection.map((query, index) => (
              <button
                key={`${query}-${index}`}
                type="button"
                onClick={() => onUpdateActiveQuery(query)}
                className="block w-full truncate rounded-md bg-white px-2 py-1 text-left transition-colors hover:bg-slate-100"
              >
                {query}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}