import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import { Play, Download, History, ListEnd, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as monacoEditor from 'monaco-editor'
import { useDataExplorerContext } from '../../_shared/context/DataExplorerContext'
import { useTheme } from '../../../app/theme'
import { ActionButton } from '../../_shared/components/ui/ActionButton'
import { downloadTextFile, createCsv } from '../../_shared/utils'
import { DataGrid } from '../components/DataGrid'
import { registerSqlProviders } from '../components/query/SqlCompletionProvider'
import { validateSql } from '../components/query/SqlValidator'
import type { SchemaColumn } from '../types/sql'
import type { QueryResultTab } from '../../_shared/types/shared'

const RESULT_TABS: QueryResultTab[] = ['results', 'messages', 'statistics']
const EMPTY_SCHEMA: Record<string, SchemaColumn[]> = {}

export function QueryPage() {
  const { connectionId } = useParams<{ connectionId: string }>()
  const {
    selectedConnection,
    explorerData,
    queryExecution,
    setQueryResultTab,
    queryResultTab,
  } = useDataExplorerContext()

  const { theme } = useTheme()

  const {
    querySql, isRunningQuery,
    queryResult, queryMessages, queryDatabase, querySchema,
    queryHistoryByConnection,
    updateActiveQuery, handleRunQuery,
    onQueryDatabaseChange, onQuerySchemaChange,
  } = queryExecution

  const handleRunQueryRef = useRef(handleRunQuery)
  useEffect(() => { handleRunQueryRef.current = handleRunQuery }, [handleRunQuery])

  const schemaColumnsByTable = explorerData.schemaColumnsByTable ?? EMPTY_SCHEMA
  const connectionType = selectedConnection?.type ?? ''
  const history = connectionId ? (queryHistoryByConnection[connectionId] ?? []) : []

  const treeData = connectionId ? explorerData.treeDataMap[connectionId] : undefined
  const databases = useMemo(() => treeData?.databases.map((d) => d.name) ?? [], [treeData])
  const schemas = useMemo(() => {
    if (connectionType !== 'postgresql' || !treeData) return []
    const db = treeData.databases.find((d) => d.name === queryDatabase)
    return db?.schemas.map((s) => s.name) ?? []
  }, [treeData, queryDatabase, connectionType])

  const [historyOpen, setHistoryOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const [resultHeight, setResultHeight] = useState(240)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startH: resultHeight }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startY - ev.clientY
      setResultHeight(Math.max(80, Math.min(600, dragRef.current.startH + delta)))
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [resultHeight])

  useEffect(() => {
    if (!exportOpen) return
    const handleClick = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [exportOpen])

  const tablesRef = useRef(schemaColumnsByTable)
  useEffect(() => { tablesRef.current = schemaColumnsByTable }, [schemaColumnsByTable])

  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof monacoEditor | null>(null)

  useEffect(() => {
    const editor = editorRef.current, mono = monacoRef.current
    if (!editor || !mono) return
    const model = editor.getModel()
    if (!model) return
    mono.editor.setModelMarkers(model, 'sql-validator', validateSql(querySql, mono))
  }, [querySql])

  const handleBeforeMount: BeforeMount = (monacoInstance) => {
    registerSqlProviders(monacoInstance, tablesRef)
  }
  const handleMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor
    monacoRef.current = monacoInstance as unknown as typeof monacoEditor
    const model = editor.getModel()
    if (model) {
      const mono = monacoInstance as unknown as typeof monacoEditor
      mono.editor.setModelMarkers(model, 'sql-validator', validateSql(querySql, mono))
    }
    editor.addAction({
      id: 'run-query',
      label: 'Run Query',
      keybindings: [monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter],
      run: () => { void handleRunQueryRef.current('run') },
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <section className="flex h-full min-h-0 flex-col bg-bg-base">
        {/* ── Toolbar ────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 border-b border-border-default px-1.5 py-1.5">
          <ActionButton
            icon={<Play size={14} />}
            aria-label="Run (Ctrl+Enter)"
            variant="accent"
            disabled={isRunningQuery}
            onClick={() => void handleRunQuery('run')}
          />
          <ActionButton
            icon={<ListEnd size={14} />}
            aria-label="Run Selected"
            variant="accent"
            disabled={isRunningQuery}
            onClick={() => void handleRunQuery('run-selected')}
          />
          <ActionButton
            icon={<Sparkles size={14} />}
            aria-label="Explain"
            disabled={isRunningQuery}
            onClick={() => void handleRunQuery('explain')}
          />
          <span className="mx-0.5 h-5 w-px bg-border-default" />
          <ActionButton
            icon={<History size={14} />}
            aria-label="Query History"
            variant={historyOpen ? 'accent' : 'default'}
            onClick={() => setHistoryOpen((v) => !v)}
          />
          <span className="ml-auto" />
          <div className="flex items-center gap-1.5">
            <span className="rounded border border-border-default bg-bg-subtle px-1.5 py-0.5 text-[10px] text-text-muted">
              {connectionType || 'sql'}
            </span>
            <select
              value={queryDatabase}
              onChange={(e) => onQueryDatabaseChange(e.target.value)}
              className="h-6 rounded border border-border-default bg-bg-base px-1 text-[11px] font-mono outline-none focus:border-primary"
            >
              {!databases.includes(queryDatabase) && queryDatabase && (
                <option value={queryDatabase}>{queryDatabase}</option>
              )}
              {databases.map((db) => (
                <option key={db} value={db}>{db}</option>
              ))}
            </select>
            {connectionType === 'postgresql' && (
              <select
                value={querySchema}
                onChange={(e) => onQuerySchemaChange(e.target.value)}
                className="h-6 rounded border border-border-default bg-bg-base px-1 text-[11px] font-mono outline-none focus:border-primary"
              >
                {!schemas.includes(querySchema) && querySchema && (
                  <option value={querySchema}>{querySchema}</option>
                )}
                {schemas.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* ── Editor ──────────────────────────────────────────────────── */}
        <div className="relative min-h-45 flex-1">
          <Editor height="100%" language="sql" value={querySql}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
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
            loading={<div className="p-3 text-xs text-text-muted">Loading editor…</div>}
          />
          {isRunningQuery && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg-base/60 text-xs text-text-muted">
              Running…
            </div>
          )}
        </div>

        {/* ── Results / Messages / Statistics ─────────────────────────── */}
        {queryResult && (
          <>
            {/* Resize handle */}
            <div
              className="flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-t border-border-default bg-bg-subtle/50 hover:bg-primary/10 active:bg-primary/15 transition-colors"
              onMouseDown={handleResizeMouseDown}
            >
              <span className="h-px w-8 rounded-full bg-text-muted/40" />
            </div>
            <div className="flex min-h-0 flex-col" style={{ height: resultHeight }}>
            <div className="flex items-center gap-1 px-1.5 py-1">
              {RESULT_TABS.map((tab) => (
                <button key={tab} type="button" onClick={() => setQueryResultTab(tab)}
                  className={`rounded-md px-2 py-0.5 text-caption capitalize transition-colors ${
                    queryResultTab === tab
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
                  }`}>
                  {tab}
                </button>
              ))}
              {queryResultTab === 'results' && (
                <span className="text-[10px] text-text-muted tabular-nums">
                  {queryResult.rows.length} rows · {queryResult.elapsedMs}ms
                </span>
              )}
              <span className="ml-auto" />
              <div ref={exportRef} className="relative">
                <ActionButton
                  icon={<Download size={13} />}
                  aria-label="Export"
                  onClick={() => setExportOpen((v) => !v)}
                />
                {exportOpen && (
                  <div className="absolute right-0 top-full z-30 mt-1 min-w-28 rounded-md border border-border-default bg-bg-base py-0.5 shadow-lg">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover"
                      onClick={() => {
                        downloadTextFile('query-result.json', JSON.stringify(queryResult.rows, null, 2), 'application/json')
                        setExportOpen(false)
                      }}
                    >
                      JSON
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover"
                      onClick={() => {
                        downloadTextFile('query-result.csv', createCsv(queryResult.columns, queryResult.rows), 'text/csv')
                        setExportOpen(false)
                      }}
                    >
                      CSV
                    </button>
                  </div>
                )}
              </div>
            </div>

            {queryResultTab === 'results' && (
              <DataGrid
                columns={queryResult.columns}
                rows={queryResult.rows}
                emptyMessage="No results"
              />
            )}

            {queryResultTab === 'messages' && (
              <ul className="flex-1 min-h-0 space-y-0.5 overflow-auto bg-bg-base p-1.5 text-xs text-text-primary font-mono">
                {queryMessages.map((m, i) => (
                  <li key={`${m}-${i}`} className="rounded px-1.5 py-0.5 hover:bg-bg-subtle text-[11px]">{m}</li>
                ))}
              </ul>
            )}

            {queryResultTab === 'statistics' && (
              <div className="flex items-center gap-4 bg-bg-base px-3 py-2 text-xs">
                <div>
                  <span className="text-text-muted">Rows </span>
                  <span className="font-semibold text-text-primary tabular-nums">{queryResult.rows.length}</span>
                </div>
                <div>
                  <span className="text-text-muted">Time </span>
                  <span className="font-semibold text-text-primary tabular-nums">{queryResult.elapsedMs}ms</span>
                </div>
                <div>
                  <span className="text-text-muted">Affected </span>
                  <span className="font-semibold text-text-primary tabular-nums">{queryResult.rowsAffected}</span>
                </div>
              </div>
            )}
          </div>
          </>
        )}

        {/* ── Query History (collapsible) ────────────────────────────── */}
        {historyOpen && (
          <div className="border-t border-border-default bg-bg-subtle/50 px-1.5 py-1.5">
            <div className="max-h-28 space-y-0.5 overflow-auto">
              {history.length === 0 && (
                <p className="px-2 py-1 text-caption text-text-muted">No history yet.</p>
              )}
              {history.map((q, i) => (
                <button key={`${i}-${q}`} type="button" onClick={() => updateActiveQuery(q)}
                  className="block w-full truncate rounded px-2 py-0.5 text-left text-[11px] font-mono text-text-primary transition-colors hover:bg-bg-hover"
                  title={q}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
