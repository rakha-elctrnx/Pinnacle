import { useState, useCallback, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import {
  Play,
  History,
  Download,
  Copy,
  ChevronDown,
  Trash2,
} from 'lucide-react'
import { useTheme } from '../../../app/theme'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import { ActionButton } from '../../_shared/components/ui/ActionButton'
import { downloadTextFile } from '../../_shared/utils'
import { useTabStore } from '../../_shared/store/tabStore'
import { redisExecuteCommand } from '../clients/redis'
import {
  useRedisConsoleStore,
  DEFAULT_REDIS_CONSOLE_TAB_STATE,
} from '../store/consoleStore'

interface QueryHistoryEntry {
  id: string
  command: string
  timestamp: number
  output?: string
  error?: string
}

interface Props {
  connection: ConnectionPayload
}

const QUICK_TEMPLATES = [
  { label: 'PING', command: 'PING' },
  { label: 'INFO', command: 'INFO' },
  { label: 'DBSIZE', command: 'DBSIZE' },
  { label: 'KEYS *', command: 'KEYS *' },
  { label: 'CLIENT LIST', command: 'CLIENT LIST' },
  { label: 'GET key', command: 'GET "my:key"' },
  { label: 'TTL key', command: 'TTL "my:key"' },
]

export function RedisConsole({ connection }: Props) {
  const { theme } = useTheme()
  const activeTabId = useTabStore((s) => s.activeTabId)
  const tabState = useRedisConsoleStore((s) =>
    activeTabId ? s.tabs[activeTabId] : undefined,
  )
  const setTab = useRedisConsoleStore((s) => s.setTab)

  const [command, setCommand] = useState(
    tabState?.command ?? DEFAULT_REDIS_CONSOLE_TAB_STATE.command,
  )
  const [output, setOutput] = useState<string | null>(tabState?.output ?? null)
  const [error, setError] = useState<string | null>(tabState?.error ?? null)
  const [loading, setLoading] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const templatesRef = useRef<HTMLDivElement>(null)
  const historyKey = activeTabId ? `redis-console-${activeTabId}-history` : null
  const [history, setHistory] = useState<QueryHistoryEntry[]>(() => {
    if (!historyKey) return []
    try {
      const saved = sessionStorage.getItem(historyKey)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    if (!activeTabId) return
    setTab(activeTabId, { command, output, error })
  }, [activeTabId, command, output, error, setTab])

  const handleExecute = useCallback(async () => {
    if (!command.trim() || loading) return
    setLoading(true)
    setError(null)
    setOutput(null)

    const cmdToRun = command.trim()
    const startTime = Date.now()

    try {
      const res = await redisExecuteCommand(connection, cmdToRun)
      setOutput(res)
      if (historyKey) {
        setHistory((prev) => {
          const entry: QueryHistoryEntry = {
            id: String(startTime),
            command: cmdToRun,
            timestamp: startTime,
            output: res,
          }
          const next = [entry, ...prev].slice(0, 50)
          sessionStorage.setItem(historyKey, JSON.stringify(next))
          return next
        })
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setError(errMsg)
      if (historyKey) {
        setHistory((prev) => {
          const entry: QueryHistoryEntry = {
            id: String(startTime),
            command: cmdToRun,
            timestamp: startTime,
            error: errMsg,
          }
          const next = [entry, ...prev].slice(0, 50)
          sessionStorage.setItem(historyKey, JSON.stringify(next))
          return next
        })
      }
    } finally {
      setLoading(false)
    }
  }, [command, connection, loading, historyKey])

  // Keybindings (Cmd+Enter / Ctrl+Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        void handleExecute()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleExecute])

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

  const clearHistory = useCallback(() => {
    if (!historyKey) return
    setHistory([])
    sessionStorage.removeItem(historyKey)
  }, [historyKey])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg-base text-text-primary">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1.5 border-border-default border-b bg-bg-subtle px-2 py-1.5 shrink-0">
        {/* Quick Templates */}
        <div ref={templatesRef} className="relative">
          <ActionButton
            icon={<ChevronDown size={14} />}
            aria-label="Quick Templates"
            variant={showTemplates ? 'accent' : 'default'}
            onClick={() => setShowTemplates((v) => !v)}
          />
          {showTemplates && (
            <div className="absolute left-0 top-full z-30 mt-1 min-w-44 rounded-md border border-border-default bg-bg-base py-1 shadow-lg">
              <div className="px-3 py-1 text-micro font-semibold uppercase tracking-wider text-text-muted">
                Templates
              </div>
              {QUICK_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => {
                    setCommand(tpl.command)
                    setShowTemplates(false)
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover"
                >
                  <span>{tpl.label}</span>
                  <span className="font-mono text-micro text-text-muted">
                    {tpl.command}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="h-4 w-px bg-border-default mx-0.5" />

        {/* Run button */}
        <ActionButton
          icon={<Play size={14} />}
          aria-label="Run command (Cmd+Enter)"
          variant="accent"
          disabled={loading || !command.trim()}
          onClick={() => void handleExecute()}
        />

        <span className="text-caption text-text-muted ml-1">
          Cmd+Enter to run
        </span>

        <span className="ml-auto" />

        {/* History toggle */}
        <ActionButton
          icon={<History size={14} />}
          aria-label="Command History"
          variant={showHistory ? 'accent' : 'default'}
          onClick={() => setShowHistory((v) => !v)}
        />
      </div>

      {/* ── Main Panel Split ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex flex-1 flex-col min-h-0 min-w-0">
          {/* Editor Area */}
          <div className="h-44 shrink-0 border-border-default border-b relative">
            <Editor
              height="100%"
              language="redis"
              value={command}
              theme={theme === 'dark' ? 'vs-dark' : 'light'}
              onChange={(val) => setCommand(val ?? '')}
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
                Running command…
              </div>
            )}
          </div>

          {/* Results / Output Area */}
          <div className="flex flex-1 flex-col min-h-0 bg-bg-base p-3">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className="text-caption font-semibold uppercase tracking-wider text-text-secondary">
                Output
              </span>
              {output !== null && (
                <div className="flex items-center gap-1">
                  <ActionButton
                    icon={<Copy size={13} />}
                    aria-label="Copy output"
                    onClick={() => navigator.clipboard.writeText(output)}
                  />
                  <ActionButton
                    icon={<Download size={13} />}
                    aria-label="Download output"
                    onClick={() =>
                      downloadTextFile(
                        'redis-output.txt',
                        output,
                        'text/plain',
                      )
                    }
                  />
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border-default bg-bg-subtle p-3">
              {error ? (
                <pre className="font-mono text-xs text-danger whitespace-pre-wrap break-all">
                  {error}
                </pre>
              ) : output !== null ? (
                <pre className="font-mono text-xs text-text-primary whitespace-pre-wrap break-all leading-relaxed">
                  {output}
                </pre>
              ) : (
                <span className="text-caption text-text-muted italic">
                  Press Cmd+Enter or click Run to execute a command.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Collapsible History Sidebar */}
        {showHistory && (
          <div className="w-72 flex flex-col min-h-0 border-border-default border-l bg-bg-subtle shrink-0">
            <div className="flex items-center justify-between border-border-default border-b px-3 py-2">
              <span className="text-caption font-semibold text-text-secondary uppercase tracking-wider">
                History
              </span>
              {history.length > 0 && (
                <ActionButton
                  icon={<Trash2 size={13} />}
                  aria-label="Clear history"
                  variant="danger"
                  onClick={clearHistory}
                />
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {history.length === 0 ? (
                <div className="p-3 text-center text-caption text-text-muted">
                  No command history yet.
                </div>
              ) : (
                history.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setCommand(entry.command)}
                    className="w-full text-left p-2 rounded border border-border-default bg-bg-base hover:bg-bg-hover transition-colors"
                  >
                    <div className="font-mono text-xs text-text-primary truncate">
                      {entry.command}
                    </div>
                    <div className="text-micro text-text-muted mt-1 flex justify-between">
                      <span>
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                      {entry.error ? (
                        <span className="text-danger font-medium">Error</span>
                      ) : (
                        <span className="text-text-secondary">OK</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
