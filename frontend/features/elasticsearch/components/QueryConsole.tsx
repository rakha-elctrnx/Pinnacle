import { useState, useCallback, useEffect } from 'react'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import { elasticExecuteQuery } from '../clients/elasticsearch'
import type { ElasticQueryResult } from '../types/elasticsearch'
import { Play, Clock, Copy, ChevronDown } from 'lucide-react'
import Editor from '@monaco-editor/react'
import { CenteredLoadingState } from '../../_shared/components/CenteredLoadingState'

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
  { label: 'Cluster Health', method: 'GET', path: '/_cluster/health', body: '' },
  { label: 'Cat Indices', method: 'GET', path: '/_cat/indices?v', body: '' },
  { label: 'Cat Nodes', method: 'GET', path: '/_cat/nodes?v', body: '' },
  { label: 'Search All', method: 'POST', path: '/_search', body: '{\n  "query": {\n    "match_all": {}\n  }\n}' },
  { label: 'Cluster Stats', method: 'GET', path: '/_cluster/stats', body: '' },
  { label: 'Cat Shards', method: 'GET', path: '/_cat/shards?v', body: '' },
]

export function QueryConsole({ connection }: Props) {
  const [method, setMethod] = useState('GET')
  const [path, setPath] = useState('/_cluster/health')
  const [body, setBody] = useState('')
  const [result, setResult] = useState<ElasticQueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<QueryHistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [resultView, setResultView] = useState<'raw' | 'formatted'>('formatted')

  const executeQuery = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const parsedBody = body.trim() ? JSON.parse(body) : undefined
      const res = await elasticExecuteQuery({
        connection,
        method,
        path,
        body: parsedBody,
      })
      setResult(res)
      setHistory((prev) => [{
        id: `${Date.now()}`,
        method,
        path,
        body,
        timestamp: Date.now(),
        result: res,
      }, ...prev].slice(0, 50))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setHistory((prev) => [{
        id: `${Date.now()}`,
        method,
        path,
        body,
        timestamp: Date.now(),
        error: msg,
      }, ...prev].slice(0, 50))
    } finally {
      setLoading(false)
    }
  }, [connection, method, path, body])

  const loadFromHistory = useCallback((entry: QueryHistoryEntry) => {
    setMethod(entry.method)
    setPath(entry.path)
    setBody(entry.body)
    setShowHistory(false)
  }, [])

  const loadTemplate = useCallback((tpl: typeof QUICK_TEMPLATES[number]) => {
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

  // Global keyboard shortcut for Cmd+Enter / Ctrl+Enter (works with Monaco editor focus)
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

  const handleContainerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      executeQuery()
    }
  }, [executeQuery])

  const resultJson = result ? JSON.stringify(result.data, null, 2) : ''

  return (
    <div className="flex flex-col h-full" onKeyDown={handleContainerKeyDown}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 bg-white">
        <div className="relative">
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Templates <ChevronDown className="h-3 w-3" />
          </button>
          {showTemplates && (
            <div className="absolute top-full left-0 mt-1 w-48 rounded border border-slate-200 bg-white shadow-lg z-20">
              {QUICK_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  onClick={() => loadTemplate(tpl)}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <Clock className="h-3.5 w-3.5" /> History ({history.length})
          </button>
          {showHistory && (
            <div className="absolute top-full left-0 mt-1 w-80 max-h-64 overflow-auto rounded border border-slate-200 bg-white shadow-lg z-20">
              {history.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-400">No history yet</div>
              ) : (
                history.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => loadFromHistory(entry)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${entry.method === 'GET' ? 'text-emerald-600' : entry.method === 'POST' ? 'text-sky-600' : entry.method === 'DELETE' ? 'text-red-600' : 'text-amber-600'}`}>
                        {entry.method}
                      </span>
                      <span className="text-slate-700 font-mono text-xs truncate">{entry.path}</span>
                      {entry.error && <span className="text-red-500 text-xs ml-auto">Error</span>}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Request Editor */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 bg-slate-50">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm font-bold text-slate-700 focus:border-blue-500 focus:outline-none"
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/_search"
          className="flex-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-mono text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={executeQuery}
          disabled={loading}
          className="flex items-center gap-1.5 rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" /> Run
        </button>
      </div>

      {/* Body Editor */}
      <div className="flex flex-col" style={{ minHeight: '200px', maxHeight: '35%' }}>
        <div className="flex items-center justify-between px-4 py-1 border-b border-slate-200 bg-slate-50">
          <span className="text-xs text-slate-500 uppercase">Request Body</span>
          <button onClick={formatBody} className="text-xs text-slate-500 hover:text-slate-700">Format JSON</button>
        </div>
        <div className="flex-1 min-h-0">
          <Editor
            language="json"
            value={body}
            onChange={(val) => setBody(val ?? '')}
            theme="light"
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              lineNumbers: 'on',
              padding: { top: 8 },
              tabSize: 2,
            }}
          />
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-200" />

      {/* Results */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-1 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 uppercase">Response</span>
            {result && (
              <span className="text-xs text-slate-500">
                {result.elapsed_ms}ms
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setResultView(resultView === 'raw' ? 'formatted' : 'raw')}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              {resultView === 'raw' ? 'Formatted' : 'Raw'}
            </button>
            {result && (
              <button onClick={copyResult} className="text-xs text-slate-500 hover:text-slate-700">
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <CenteredLoadingState loading={loading} label="Executing query..." iconSize={3} />
          {error && (
            <pre className="px-4 py-3 text-sm font-mono text-red-600 whitespace-pre-wrap break-all">
              {error}
            </pre>
          )}
          {result && (
            <pre className="px-4 py-3 text-sm font-mono text-slate-700 whitespace-pre-wrap break-all">
              {resultView === 'formatted' ? resultJson : JSON.stringify(result.data)}
            </pre>
          )}
          {!error && !result && !loading && (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              Press Cmd+Enter or click Run to execute
            </div>
          )}
        </div>
      </div>
    </div>
  )
}