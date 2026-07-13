import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { elasticExecuteQuery } from '../clients/elasticsearch'
import type { ElasticQueryResult } from '../types/elasticsearch'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import {
  Play,
  History,
  Download,
  Copy,
  WrapText,
  Minimize2,
  ChevronDown,
  Plus,
} from 'lucide-react'
import Editor from '@monaco-editor/react'
import { ActionButton } from '../../_shared/components/ui/ActionButton'
import { downloadTextFile } from '../../_shared/utils'
import { useTheme } from '../../../app/theme'
import { useTabStore } from '../../_shared/store/tabStore'
import { useEsQueryStore } from '../store/queryStore'

interface QueryHistoryEntry {
  id: string
  method: string
  path: string
  body: string
  timestamp: number
  result?: ElasticQueryResult
  error?: string
}

interface Props {
  connection: ConnectionPayload
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD']

const QUICK_TEMPLATES = [
  {
    label: 'Cluster Health',
    method: 'GET',
    path: '/_cluster/health',
    body: '',
  },
  { label: 'Cat Indices', method: 'GET', path: '/_cat/indices?v', body: '' },
  { label: 'Cat Nodes', method: 'GET', path: '/_cat/nodes?v', body: '' },
  {
    label: 'Search All',
    method: 'POST',
    path: '/_search',
    body: '{\n  "query": {\n    "match_all": {}\n  }\n}',
  },
  { label: 'Cluster Stats', method: 'GET', path: '/_cluster/stats', body: '' },
  { label: 'Cat Shards', method: 'GET', path: '/_cat/shards?v', body: '' },
]

type ResultTab = 'response' | 'messages' | 'statistics'

export function QueryConsole({ connection }: Props) {
  const { theme } = useTheme()
  const { connectionId } = useParams<{ connectionId: string }>()
  const navigate = useNavigate()

  // ── Per-tab state via Zustand ───────────────────────────────────────
  const activeTabId = useTabStore((s) => s.activeTabId)
  const tabState = useEsQueryStore((s) =>
    activeTabId ? s.tabs[activeTabId] : undefined,
  )
  const setTab = useEsQueryStore((s) => s.setTab)

  const [method, setMethod] = useState(tabState?.method ?? 'GET')
  const [path, setPath] = useState(tabState?.path ?? '/_cluster/health')
  const [body, setBody] = useState(tabState?.body ?? '')
  const [result, setResult] = useState<ElasticQueryResult | null>(
    tabState?.result ?? null,
  )
  const [error, setError] = useState<string | null>(tabState?.error ?? null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<QueryHistoryEntry[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [resultTab, setResultTab] = useState<ResultTab>(
    (tabState?.resultTab as ResultTab) ?? 'response',
  )
  const [resultHeight, setResultHeight] = useState(240)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  const templatesRef = useRef<HTMLDivElement>(null)

  // Persist state to zustand store on every change
  useEffect(() => {
    if (!activeTabId) return
    setTab(activeTabId, { method, path, body, resultTab, result, error })
  }, [activeTabId, setTab, method, path, body, resultTab, result, error])

  // Persist history separately
  const historyKey = activeTabId ? `es-query-${activeTabId}-history` : null

  // Load history from sessionStorage on mount
  useEffect(() => {
    if (!historyKey) return
    try {
      const raw = sessionStorage.getItem(historyKey)
      if (raw) {
        setHistory(JSON.parse(raw) as QueryHistoryEntry[])
      }
    } catch {
      // ignore
    }
  }, [historyKey])

  // Save history on change
  useEffect(() => {
    if (!historyKey) return
    sessionStorage.setItem(historyKey, JSON.stringify(history))
  }, [historyKey, history])

  // Sequential tab label counter (persisted across sessions)
  const tabCounterRef = useRef(() => {
    const raw = sessionStorage.getItem('es-query-tab-counter')
    const next = (raw ? parseInt(raw, 10) : 1) + 1
    sessionStorage.setItem('es-query-tab-counter', String(next))
    return next
  })

  const handleNewQuery = useCallback(() => {
    const newTabId = `es-query-${connectionId}-${Date.now()}`
    const label = `Query_${tabCounterRef.current()}`
    const route = `/elasticsearch/${connectionId}/query`

    setMethod('GET')
    setPath('/_cluster/health')
    setBody('')
    setResult(null)
    setError(null)
    setHistoryOpen(false)
    setShowTemplates(false)
    setResultTab('response')

    useTabStore.getState().openTab({
      id: newTabId,
      label,
      type: 'elasticsearch',
      pageType: 'elastic-query',
      route,
      connectionId,
    })
    navigate(route)
  }, [connectionId, navigate])

  const executeQuery = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    setResultTab('response')
    try {
      const parsedBody = body.trim() ? JSON.parse(body) : undefined
      const res = await elasticExecuteQuery({
        connection,
        method,
        path,
        body: parsedBody,
      })
      setResult(res)
      setHistory((prev) =>
        [
          {
            id: `${Date.now()}`,
            method,
            path,
            body,
            timestamp: Date.now(),
            result: res,
          },
          ...prev,
        ].slice(0, 50),
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setHistory((prev) =>
        [
          {
            id: `${Date.now()}`,
            method,
            path,
            body,
            timestamp: Date.now(),
            error: msg,
          },
          ...prev,
        ].slice(0, 50),
      )
    } finally {
      setLoading(false)
    }
  }, [connection, method, path, body])

  const loadFromHistory = useCallback((entry: QueryHistoryEntry) => {
    setMethod(entry.method)
    setPath(entry.path)
    setBody(entry.body)
  }, [])

  const loadTemplate = useCallback((tpl: (typeof QUICK_TEMPLATES)[number]) => {
    setMethod(tpl.method)
    setPath(tpl.path)
    setBody(tpl.body)
    setShowTemplates(false)
  }, [])

  const copyResult = useCallback(() => {
    if (result) {
      navigator.clipboard.writeText(JSON.stringify(result.data, null, 2))
    }
  }, [result])

  const formatBody = useCallback(() => {
    try {
      const parsed = JSON.parse(body)
      setBody(JSON.stringify(parsed, null, 2))
    } catch {
      // ignore invalid JSON
    }
  }, [body])

  const minifyBody = useCallback(() => {
    try {
      const parsed = JSON.parse(body)
      setBody(JSON.stringify(parsed))
    } catch {
      // ignore invalid JSON
    }
  }, [body])

  const resultJson = result ? JSON.stringify(result.data, null, 2) : ''

  // Global keyboard shortcut for Cmd+Enter / Ctrl+Enter
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        executeQuery()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [executeQuery])

  // Close templates dropdown on outside click
  useEffect(() => {
    if (!showTemplates) return
    const handleClick = (e: MouseEvent) => {
      if (
        templatesRef.current &&
        !templatesRef.current.contains(e.target as Node)
      ) {
        setShowTemplates(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showTemplates])

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragRef.current = { startY: e.clientY, startH: resultHeight }
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return
        const delta = dragRef.current.startY - ev.clientY
        setResultHeight(
          Math.max(80, Math.min(600, dragRef.current.startH + delta)),
        )
      }
      const onUp = () => {
        dragRef.current = null
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [resultHeight],
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <section className="flex h-full min-h-0 flex-col bg-bg-base">
        {/* ── Toolbar ────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 border-b border-border-default px-1.5 py-1.5">
          {/* Quick Templates */}
          <div ref={templatesRef} className="relative">
            <ActionButton
              icon={<ChevronDown size={14} />}
              aria-label="Templates"
              variant={showTemplates ? 'accent' : 'default'}
              onClick={() => setShowTemplates((v) => !v)}
            />
            {showTemplates && (
              <div className="absolute left-0 top-full z-30 mt-1 min-w-44 rounded-md border border-border-default bg-bg-base py-0.5 shadow-lg">
                {QUICK_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => loadTemplate(tpl)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="mx-0.5 h-5 w-px bg-border-default" />

          {/* Method + Path */}
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="h-7 w-20 rounded border border-border-default bg-bg-base px-1 text-[11px] font-mono outline-none focus:border-primary"
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/_search"
            className="h-7 flex-1 rounded border border-border-default bg-bg-base px-2 text-[11px] font-mono outline-none placeholder:text-text-muted focus:border-primary"
          />

          <span className="mx-0.5 h-5 w-px bg-border-default" />

          {/* Run */}
          <ActionButton
            icon={<Play size={14} />}
            aria-label="Run (Cmd+Enter)"
            variant="accent"
            disabled={loading}
            onClick={() => void executeQuery()}
          />

          <span className="mx-0.5 h-5 w-px bg-border-default" />

          {/* Format / Minify JSON body */}
          <ActionButton
            icon={<WrapText size={14} />}
            aria-label="Format JSON"
            disabled={!body.trim()}
            onClick={formatBody}
          />
          <ActionButton
            icon={<Minimize2 size={14} />}
            aria-label="Minify JSON"
            disabled={!body.trim()}
            onClick={minifyBody}
          />

          <span className="mx-0.5 h-5 w-px bg-border-default" />

          {/* History */}
          <ActionButton
            icon={<History size={14} />}
            aria-label="Query History"
            variant={historyOpen ? 'accent' : 'default'}
            onClick={() => setHistoryOpen((v) => !v)}
          />
          <ActionButton
            icon={<Plus size={14} />}
            aria-label="New Query Tab"
            onClick={handleNewQuery}
          />
        </div>

        {/* ── Body Editor ──────────────────────────────────────────────── */}
        <div className="relative min-h-40 flex-1">
          <Editor
            height="100%"
            language="json"
            value={body}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            onChange={(value) => setBody(value ?? '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              wordWrap: 'on',
              lineNumbers: 'on',
              padding: { top: 8 },
              tabSize: 2,
              automaticLayout: true,
              scrollBeyondLastLine: false,
              readOnly: loading,
            }}
            loading={
              <div className="p-3 text-xs text-text-muted">Loading editor…</div>
            }
          />
          {loading && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg-base/60 text-xs text-text-muted">
              Running…
            </div>
          )}
        </div>

        {/* ── Results ─────────────────────────────────────────────────── */}
        {(result || error) && (
          <>
            {/* Resize handle */}
            <div
              className="flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-t border-border-default bg-bg-subtle/50 transition-colors hover:bg-primary/10 active:bg-primary/15"
              onMouseDown={handleResizeMouseDown}
            >
              <span className="h-px w-8 rounded-full bg-text-muted/40" />
            </div>

            <div
              className="flex min-h-0 flex-col"
              style={{ height: resultHeight }}
            >
              {/* ── Result tabs bar ───────────────────────────────── */}
              <div className="flex items-center gap-1 border-b border-border-default px-1.5 py-1">
                <button
                  type="button"
                  onClick={() => setResultTab('response')}
                  className={`rounded-md px-2 py-0.5 text-caption capitalize transition-colors ${
                    resultTab === 'response'
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
                  }`}
                >
                  Response
                </button>
                <button
                  type="button"
                  onClick={() => setResultTab('messages')}
                  className={`rounded-md px-2 py-0.5 text-caption capitalize transition-colors ${
                    resultTab === 'messages'
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
                  }`}
                >
                  Messages
                </button>
                <button
                  type="button"
                  onClick={() => setResultTab('statistics')}
                  className={`rounded-md px-2 py-0.5 text-caption capitalize transition-colors ${
                    resultTab === 'statistics'
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
                  }`}
                >
                  Statistics
                </button>

                {result && resultTab === 'response' && (
                  <span className="text-[10px] text-text-muted tabular-nums">
                    {result.elapsed_ms}ms
                  </span>
                )}

                <span className="ml-auto" />

                {result && (
                  <>
                    <ActionButton
                      icon={<Copy size={13} />}
                      aria-label="Copy response"
                      onClick={copyResult}
                    />
                    <ActionButton
                      icon={<Download size={13} />}
                      aria-label="Export"
                      onClick={() => {
                        const json = JSON.stringify(result.data, null, 2)
                        downloadTextFile(
                          'es-response.json',
                          json,
                          'application/json',
                        )
                      }}
                    />
                  </>
                )}
              </div>

              {/* ── Tab content ──────────────────────────────── */}
              {resultTab === 'response' && (
                <div className="flex-1 min-h-0">
                  {error && (
                    <pre className="whitespace-pre-wrap break-all px-3 py-2 font-mono text-[11px] text-danger">
                      {error}
                    </pre>
                  )}
                  {result && (
                    <Editor
                      height="100%"
                      language="json"
                      value={resultJson}
                      theme={theme === 'dark' ? 'vs-dark' : 'light'}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        wordWrap: 'on',
                        lineNumbers: 'on',
                        padding: { top: 8 },
                        tabSize: 2,
                        automaticLayout: true,
                        scrollBeyondLastLine: false,
                        readOnly: true,
                        domReadOnly: true,
                      }}
                      loading={
                        <div className="p-3 text-xs text-text-muted">
                          Loading editor…
                        </div>
                      }
                    />
                  )}
                </div>
              )}

              {resultTab === 'messages' && (
                <div className="flex-1 min-h-0 overflow-auto bg-bg-base p-1.5 text-xs text-text-primary font-mono">
                  {error && (
                    <div className="rounded px-1.5 py-0.5 text-[11px] text-danger">
                      ✗ {error}
                    </div>
                  )}
                  {result && (
                    <div className="rounded px-1.5 py-0.5 text-[11px] text-text-muted">
                      ✓ Request completed in {result.elapsed_ms}ms
                    </div>
                  )}
                  {!error && !result && (
                    <div className="rounded px-1.5 py-0.5 text-[11px] text-text-muted">
                      No messages
                    </div>
                  )}
                </div>
              )}

              {resultTab === 'statistics' && (
                <div className="flex items-center gap-4 bg-bg-base px-3 py-2 text-xs">
                  <div>
                    <span className="text-text-muted">Method </span>
                    <span className="font-semibold text-text-primary tabular-nums">
                      {method}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted">Path </span>
                    <span className="font-mono text-[11px] text-text-primary">
                      {path}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted">Time </span>
                    <span className="font-semibold text-text-primary tabular-nums">
                      {result ? `${result.elapsed_ms}ms` : '-'}
                    </span>
                  </div>
                  {result && (
                    <div>
                      <span className="text-text-muted">Size </span>
                      <span className="font-semibold text-text-primary tabular-nums">
                        {resultJson.length.toLocaleString()} B
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Empty state (no result, no error) ─────────────────────────── */}
        {!result && !error && !loading && (
          <div className="flex flex-1 items-center justify-center border-t border-border-default text-xs text-text-muted">
            Press{' '}
            <kbd className="mx-1 rounded border border-border-default bg-bg-subtle px-1 py-0.5 font-mono text-[10px]">
              Cmd+Enter
            </kbd>{' '}
            or click{' '}
            <kbd className="mx-1 rounded border border-border-default bg-bg-subtle px-1 py-0.5 font-mono text-[10px]">
              Run
            </kbd>{' '}
            to execute a request
          </div>
        )}

        {/* ── Query History (collapsible) ────────────────────────────── */}
        {historyOpen && (
          <div className="border-t border-border-default bg-bg-subtle/50 px-1.5 py-1.5">
            <div className="max-h-28 space-y-0.5 overflow-auto">
              {history.length === 0 && (
                <p className="px-2 py-1 text-caption text-text-muted">
                  No history yet.
                </p>
              )}
              {history.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => loadFromHistory(entry)}
                  className="flex w-full items-center gap-2 rounded px-2 py-0.5 text-left text-[11px] transition-colors hover:bg-bg-hover"
                  title={`${entry.method} ${entry.path}`}
                >
                  <span
                    className={`shrink-0 font-mono text-[10px] ${
                      entry.error
                        ? 'text-danger'
                        : entry.method === 'GET'
                          ? 'text-green-500'
                          : entry.method === 'POST'
                            ? 'text-sky-500'
                            : entry.method === 'DELETE'
                              ? 'text-red-500'
                              : 'text-amber-500'
                    }`}
                  >
                    {entry.method}
                  </span>
                  <span className="truncate font-mono text-[11px] text-text-primary">
                    {entry.path}
                  </span>
                  {entry.error && (
                    <span className="ml-auto shrink-0 text-[10px] text-danger">
                      Error
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
