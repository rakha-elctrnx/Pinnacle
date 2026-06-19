import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import { Play, Save, Download, History, Plus, X, Star } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import * as monacoEditor from 'monaco-editor'
import { useDataExplorerContext } from '../../_shared/context/DataExplorerContext'
import { downloadTextFile, createCsv } from '../../_shared/utils'
import { registerSqlProviders } from '../components/query/SqlCompletionProvider'
import { validateSql } from '../components/query/SqlValidator'
import type { SchemaColumn } from '../types/sql'
import type { QueryResultTab, QueryTab, SavedQuery } from '../../_shared/types/shared'

const RESULT_TABS: QueryResultTab[] = ['results', 'messages', 'statistics']
const EMPTY_SCHEMA: Record<string, SchemaColumn[]> = {}

/**
 * QueryPage — Monaco-based SQL editor + result viewer.
 * Route: `/sql/:connectionId/query` (or `/sql/:connectionId/query/:queryId` to
 * deep-link into a saved query).
 */
export function QueryPage() {
  const { connectionId, queryId } = useParams<{ connectionId: string; queryId?: string }>()
  const {
    selectedConnection,
    explorerData,
    queryExecution,
    setQueryResultTab,
    queryResultTab,
  } = useDataExplorerContext()

  const {
    queryTabs, activeQueryTab, activeQueryTabId, isRunningQuery,
    queryResult, queryMessages, queryDatabase, querySchema,
    queryHistoryByConnection, savedQueriesByConnection,
    addQueryTab, closeQueryTab, setActiveQueryTabId, updateActiveQuery,
    handleRunQuery, saveActiveQuery, applySavedQueryToActiveTab,
  } = queryExecution

  const schemaColumnsByTable = explorerData.schemaColumnsByTable ?? EMPTY_SCHEMA
  const connectionType = selectedConnection?.type ?? ''
  const history = connectionId ? (queryHistoryByConnection[connectionId] ?? []) : []
  const savedQueries: SavedQuery[] = connectionId ? (savedQueriesByConnection[connectionId] ?? []) : []

  // Stable ref so the completion provider always sees fresh schema data.
  const tablesRef = useRef(schemaColumnsByTable)
  useEffect(() => { tablesRef.current = schemaColumnsByTable }, [schemaColumnsByTable, activeQueryTabId])

  // Refs for the validator
  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof monacoEditor | null>(null)

  // Optional: load saved query when queryId is in the URL
  useEffect(() => {
    if (!queryId || !connectionId) return
    const match = savedQueriesByConnection[connectionId]?.find((q) => q.id === queryId)
    if (match) applySavedQueryToActiveTab(match.sql)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryId, connectionId])

  // Re-run validator on SQL change
  useEffect(() => {
    const editor = editorRef.current, mono = monacoRef.current
    if (!editor || !mono) return
    const model = editor.getModel()
    if (!model) return
    mono.editor.setModelMarkers(model, 'sql-validator', validateSql(activeQueryTab?.sql ?? '', mono))
  }, [activeQueryTab?.sql, activeQueryTabId])

  // ── Monaco lifecycle ──────────────────────────────────────────────────────
  const handleBeforeMount: BeforeMount = (monacoInstance) => {
    registerSqlProviders(monacoInstance, tablesRef)
  }
  const handleMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor
    monacoRef.current = monacoInstance as unknown as typeof monacoEditor
    const model = editor.getModel()
    if (model) {
      const mono = monacoInstance as unknown as typeof monacoEditor
      mono.editor.setModelMarkers(model, 'sql-validator', validateSql(activeQueryTab?.sql ?? '', mono))
    }
  }

  // ── Tab bar (query tabs) ──────────────────────────────────────────────────
  const tabBar = (
    <div className="flex flex-wrap items-center gap-1 border-b border-outline-variant bg-surface-variant px-2 py-1">
      {queryTabs.map((tab: QueryTab) => (
        <div key={tab.id}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
            tab.id === activeQueryTabId
              ? 'bg-primary-container text-on-primary-container'
              : 'text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          <button type="button" onClick={() => setActiveQueryTabId(tab.id)}
            className="cursor-pointer truncate max-w-37.5" title={tab.title}>
            {tab.title}
          </button>
          {queryTabs.length > 1 && (
            <button type="button" onClick={() => closeQueryTab(tab.id)}
              className="cursor-pointer rounded p-0.5 hover:bg-error-container/30"
              aria-label={`Close ${tab.title}`}>
              <X size={11} />
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={addQueryTab}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-on-surface-variant transition-colors hover:bg-surface-container-low"
        aria-label="New query tab">
        <Plus size={12} /> New
      </button>
    </div>
  )

  // Empty state
  if (!activeQueryTab) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {tabBar}
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-on-surface-variant">
          <div className="flex flex-col items-center gap-2 text-center">
            <p>No active query tab.</p>
            <button type="button" onClick={addQueryTab}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:opacity-90">
              <Plus size={13} /> New Query Tab
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {tabBar}
      <section className="flex h-full min-h-0 flex-col bg-surface">
        {/* ── Toolbar ────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <span className="rounded-full border border-outline-variant bg-surface-container-low px-2 py-0.5">
              {connectionType || 'connection'}
            </span>
            {queryDatabase && (
              <span className="rounded-full border border-outline-variant bg-surface-container-low px-2 py-0.5">db: {queryDatabase}</span>
            )}
            {querySchema && connectionType === 'postgresql' && (
              <span className="rounded-full border border-outline-variant bg-surface-container-low px-2 py-0.5">schema: {querySchema}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void handleRunQuery('run')} disabled={isRunningQuery}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-on-primary hover:opacity-90 disabled:opacity-60">
              <Play size={13} /> Run
            </button>
            <button type="button" onClick={() => void handleRunQuery('run-selected')} disabled={isRunningQuery}
              className="rounded-lg border border-outline-variant px-2.5 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-60">
              Run Selected
            </button>
            <button type="button" onClick={() => void handleRunQuery('explain')} disabled={isRunningQuery}
              className="rounded-lg border border-outline-variant px-2.5 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-60">
              Explain
            </button>
            <button type="button" onClick={saveActiveQuery}
              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-2.5 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-low">
              <Save size={13} /> Save Query
            </button>
          </div>
        </div>

        {/* ── Editor ──────────────────────────────────────────────────── */}
        <div className="relative min-h-45 flex-1">
          <Editor height="100%" language="sql" value={activeQueryTab.sql}
            onChange={(value) => updateActiveQuery(value ?? '')}
            options={{
              minimap: { enabled: false }, fontSize: 13, wordWrap: 'on',
              quickSuggestions: { other: true, comments: false, strings: false },
              suggestOnTriggerCharacters: true, parameterHints: { enabled: true },
              tabCompletion: 'on', acceptSuggestionOnCommitCharacter: true,
              acceptSuggestionOnEnter: 'smart',
              suggest: {
                showKeywords: true, showSnippets: true, showFunctions: true,
                showClasses: true, showFields: true, showWords: false,
                insertMode: 'replace', preview: true,
              },
              suggestFontSize: 13, suggestLineHeight: 22, readOnly: isRunningQuery,
            }}
            beforeMount={handleBeforeMount} onMount={handleMount}
            loading={<div className="p-3 text-xs text-on-surface-variant">Loading editor…</div>}
          />
          {isRunningQuery && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface/60 text-xs text-on-surface-variant">
              Running…
            </div>
          )}
        </div>

        {/* ── Results / Messages / Statistics ─────────────────────────── */}
        {queryResult && (
          <div className="flex max-h-72 min-h-0 flex-col border-t border-outline-variant bg-surface-container-low">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="inline-flex rounded-md border border-outline-variant bg-surface p-1">
                {RESULT_TABS.map((tab) => (
                  <button key={tab} type="button" onClick={() => setQueryResultTab(tab)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition-colors ${
                      queryResultTab === tab
                        ? 'bg-surface-container-high text-on-surface'
                        : 'text-on-surface-variant hover:bg-surface-container'
                    }`}>
                    {tab}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => downloadTextFile('query-result.json', JSON.stringify(queryResult.rows, null, 2), 'application/json')}
                  className="inline-flex items-center gap-1 rounded-md border border-outline-variant bg-surface px-2 py-1 text-xs text-on-surface transition-colors hover:bg-surface-container">
                  <Download size={13} /> JSON
                </button>
                <button type="button" onClick={() => downloadTextFile('query-result.csv', createCsv(queryResult.columns, queryResult.rows), 'text/csv')}
                  className="inline-flex items-center gap-1 rounded-md border border-outline-variant bg-surface px-2 py-1 text-xs text-on-surface transition-colors hover:bg-surface-container">
                  <Download size={13} /> CSV
                </button>
              </div>
            </div>

            {queryResultTab === 'results' && (
              <div className="flex-1 min-h-0 overflow-auto bg-surface">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-surface-container text-on-surface-variant">
                    <tr>{queryResult.columns.map((c) => (
                      <th key={c} className="border-b border-outline-variant px-2 py-1.5 text-left font-semibold">{c}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {queryResult.rows.slice(0, 100).map((row, i) => (
                      <tr key={i} className="even:bg-surface-container-low hover:bg-surface-container">
                        {queryResult.columns.map((c) => (
                          <td key={`${i}-${c}`} className="border-b border-outline-variant/60 px-2 py-1.5 text-on-surface">
                            {String(row[c] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {queryResultTab === 'messages' && (
              <ul className="flex-1 min-h-0 space-y-1 overflow-auto bg-surface p-2 text-xs text-on-surface">
                {queryMessages.map((m, i) => (
                  <li key={`${m}-${i}`} className="rounded px-2 py-1 hover:bg-surface-container-low">{m}</li>
                ))}
              </ul>
            )}

            {queryResultTab === 'statistics' && (
              <div className="grid gap-2 bg-surface p-3 text-xs sm:grid-cols-3">
                <div className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-2">
                  <p className="text-on-surface-variant">Rows Returned</p>
                  <p className="font-semibold text-on-surface">{queryResult.rows.length}</p>
                </div>
                <div className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-2">
                  <p className="text-on-surface-variant">Execution Time</p>
                  <p className="font-semibold text-on-surface">{queryResult.elapsedMs} ms</p>
                </div>
                <div className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-2">
                  <p className="text-on-surface-variant">Rows Affected</p>
                  <p className="font-semibold text-on-surface">{queryResult.rowsAffected}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Saved queries + History (split panel) ───────────────────── */}
        <div className="grid grid-cols-1 gap-2 border-t border-outline-variant bg-surface-container-low p-2.5 md:grid-cols-2">
          <SidebarList
            icon={<Star size={11} />}
            title="Saved Queries"
            count={savedQueries.length}
            emptyText="No saved queries yet."
            items={savedQueries.map((q) => ({ key: q.id, label: q.title, title: q.sql, onClick: () => applySavedQueryToActiveTab(q.sql) }))}
          />
          <SidebarList
            icon={<History size={11} />}
            title="Query History"
            count={history.length}
            emptyText="No query history yet."
            items={history.map((q, i) => ({ key: `${i}-${q}`, label: q, title: q, onClick: () => updateActiveQuery(q) }))}
          />
        </div>
      </section>
    </div>
  )
}

// ── Internal: small reusable list for sidebar panels (saved queries, history) ──
function SidebarList({
  icon, title, count, emptyText, items,
}: {
  icon: React.ReactNode
  title: string
  count: number
  emptyText: string
  items: { key: string; label: string; title?: string; onClick: () => void }[]
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
          {icon} {title}
        </p>
        <span className="rounded-full border border-outline-variant bg-surface px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant">
          {count} items
        </span>
      </div>
      <div className="max-h-32 space-y-1 overflow-auto text-xs text-on-surface">
        {items.length === 0 && (
          <p className="rounded-md bg-surface px-2 py-1.5 text-on-surface-variant">{emptyText}</p>
        )}
        {items.map((it) => (
          <button key={it.key} type="button" onClick={it.onClick}
            className="block w-full truncate rounded-md bg-surface px-2 py-1 text-left transition-colors hover:bg-surface-container"
            title={it.title}>
            {it.label}
          </button>
        ))}
      </div>
    </div>
  )
}
