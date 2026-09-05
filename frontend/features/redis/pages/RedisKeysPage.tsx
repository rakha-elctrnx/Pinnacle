import { useState, useEffect, useCallback } from 'react'
import { useParams, useOutletContext } from 'react-router-dom'
import { Search, RefreshCw, Key, ChevronRight } from 'lucide-react'
import { CenteredLoadingState } from '../../_shared/components/ui/CenteredLoadingState'
import { ActionButton } from '../../_shared/components/ui/ActionButton'
import { redisScanKeys, redisGetKey } from '../clients/redis'
import type { RedisKeySummary, RedisKeyDetail } from '../types/redis'
import type { RedisLayoutOutletContext } from '../types/pages'

export function RedisKeysPage() {
  const { dbName } = useParams<{ dbName: string }>()
  const { payload } = useOutletContext<RedisLayoutOutletContext>()

  // DB name resolution: e.g. "db0" or "0" -> "db0"
  const currentDb = dbName ?? 'db0'

  const [pattern, setPattern] = useState('*')
  const [activePattern, setActivePattern] = useState('*')
  const [cursor, setCursor] = useState('0')
  const [keys, setKeys] = useState<RedisKeySummary[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Selected key detail panel state
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [detail, setDetail] = useState<RedisKeyDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const fetchKeys = useCallback(
    async (matchPattern: string, nextCursor: string, append = false) => {
      if (!payload) return
      if (append) {
        setLoadingMore(true)
      } else {
        setLoading(true)
        setSelectedKey(null)
        setDetail(null)
      }
      setError(null)

      try {
        const res = await redisScanKeys(
          payload,
          currentDb,
          matchPattern,
          nextCursor,
        )
        setCursor(res.cursor)
        setKeys((prev) => (append ? [...prev, ...res.keys] : res.keys))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [payload, currentDb],
  )

  useEffect(() => {
    // fetchKeys sets loading state; initial load on db/payload change is intentional
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchKeys(pattern, '0', false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDb, payload]) // Re-run when DB or payload changes

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setActivePattern(pattern)
    void fetchKeys(pattern, '0', false)
  }

  const handleRefresh = () => {
    void fetchKeys(activePattern, '0', false)
  }

  const handleLoadMore = () => {
    if (cursor !== '0' && !loadingMore) {
      void fetchKeys(activePattern, cursor, true)
    }
  }

  const handleSelectKey = async (keyName: string) => {
    if (!payload) return
    setSelectedKey(keyName)
    setLoadingDetail(true)
    setDetailError(null)

    try {
      const res = await redisGetKey(payload, currentDb, keyName)
      setDetail(res)
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingDetail(false)
    }
  }

  const renderValuePreview = (d: RedisKeyDetail) => {
    if (d.value === null || d.value === undefined) {
      return (
        <span className="text-caption text-text-muted italic">
          No value or unknown type preview for type &quot;{d.keyType}&quot;
        </span>
      )
    }

    if (d.keyType === 'string') {
      return (
        <pre className="font-mono text-xs text-text-primary whitespace-pre-wrap break-all bg-bg-subtle p-3 rounded border border-border-default">
          {String(d.value)}
        </pre>
      )
    }

    if (d.keyType === 'list' || d.keyType === 'set') {
      const arr = Array.isArray(d.value) ? (d.value as string[]) : []
      return (
        <div className="border border-border-default rounded overflow-hidden">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-bg-subtle border-b border-border-default text-text-secondary">
              <tr>
                <th className="px-3 py-1.5 w-12 text-center border-r border-border-default">
                  #
                </th>
                <th className="px-3 py-1.5">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default bg-bg-base">
              {arr.map((val, idx) => (
                <tr key={idx} className="hover:bg-bg-hover">
                  <td className="px-3 py-1 text-center text-text-muted border-r border-border-default">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-1 text-text-primary whitespace-pre-wrap break-all">
                    {val}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    if (d.keyType === 'hash') {
      const record =
        typeof d.value === 'object' && d.value !== null
          ? (d.value as Record<string, string>)
          : {}
      const entries = Object.entries(record)

      return (
        <div className="border border-border-default rounded overflow-hidden">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-bg-subtle border-b border-border-default text-text-secondary">
              <tr>
                <th className="px-3 py-1.5 w-1/3 border-r border-border-default">
                  Field
                </th>
                <th className="px-3 py-1.5">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default bg-bg-base">
              {entries.map(([fld, val]) => (
                <tr key={fld} className="hover:bg-bg-hover">
                  <td className="px-3 py-1 text-text-primary font-medium border-r border-border-default">
                    {fld}
                  </td>
                  <td className="px-3 py-1 text-text-secondary whitespace-pre-wrap break-all">
                    {val}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    if (d.keyType === 'zset') {
      const members = Array.isArray(d.value)
        ? (d.value as Array<{ value: string; score: number }>)
        : []

      return (
        <div className="border border-border-default rounded overflow-hidden">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-bg-subtle border-b border-border-default text-text-secondary">
              <tr>
                <th className="px-3 py-1.5 w-24 border-r border-border-default">
                  Score
                </th>
                <th className="px-3 py-1.5">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default bg-bg-base">
              {members.map((m, idx) => (
                <tr key={idx} className="hover:bg-bg-hover">
                  <td className="px-3 py-1 text-text-muted font-mono border-r border-border-default">
                    {m.score}
                  </td>
                  <td className="px-3 py-1 text-text-primary whitespace-pre-wrap break-all">
                    {m.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    return (
      <pre className="font-mono text-xs text-text-primary whitespace-pre-wrap break-all bg-bg-subtle p-3 rounded border border-border-default">
        {JSON.stringify(d.value, null, 2)}
      </pre>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg-base text-text-primary">
      {/* Top Search & Action Bar */}
      <div className="flex items-center justify-between border-border-default border-b bg-bg-subtle px-3 py-2 shrink-0">
        <form
          onSubmit={handleSearchSubmit}
          className="flex items-center gap-2 flex-1 max-w-md"
        >
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
            <input
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="Filter by pattern (e.g. user:*)"
              className="w-full h-8 rounded-md border border-border-default bg-bg-base pl-8 pr-3 font-mono text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-primary"
            />
          </div>
          <button
            type="submit"
            className="h-8 rounded-md bg-bg-base border border-border-default px-3 text-xs text-text-primary font-medium hover:bg-bg-hover transition-colors"
          >
            Scan
          </button>
        </form>

        <div className="flex items-center gap-2">
          <span className="text-caption text-text-muted">
            {keys.length} key{keys.length === 1 ? '' : 's'} found
          </span>
          <ActionButton
            icon={<RefreshCw size={14} />}
            aria-label="Refresh keys"
            onClick={handleRefresh}
          />
        </div>
      </div>

      {/* Main Split Layout: Table Left, Detail Right */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Column: Keys Table */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 border-border-default border-r">
          {error && (
            <div
              role="alert"
              className="shrink-0 border-b border-border-danger bg-danger-subtle px-3 py-2 text-caption text-danger"
            >
              {error}
            </div>
          )}

          {loading ? (
            <CenteredLoadingState loading label="Scanning Redis keys..." />
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              {keys.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-6 text-text-muted">
                  <Key className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-body-secondary">No keys found</p>
                  <p className="text-caption text-text-muted mt-1">
                    Try matching with pattern &quot;*&quot; or select another database.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead className="bg-bg-subtle sticky top-0 border-b border-border-default text-text-secondary z-10">
                    <tr>
                      <th className="px-3 py-2 font-medium">Key</th>
                      <th className="px-3 py-2 font-medium w-24">Type</th>
                      <th className="px-3 py-2 font-medium w-24">TTL</th>
                      <th className="px-2 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-default bg-bg-base">
                    {keys.map((k) => {
                      const isSelected = selectedKey === k.key
                      return (
                        <tr
                          key={k.key}
                          onClick={() => void handleSelectKey(k.key)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'hover:bg-bg-hover text-text-primary'
                          }`}
                        >
                          <td className="px-3 py-1.5 truncate max-w-xs">
                            {k.key}
                          </td>
                          <td className="px-3 py-1.5">
                            <span className="inline-block rounded bg-bg-subtle border border-border-default px-1.5 py-0.5 text-micro font-sans text-text-secondary uppercase">
                              {k.keyType}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-text-muted">
                            {k.ttl === -1
                              ? 'no expiry'
                              : k.ttl === -2
                                ? '-'
                                : `${k.ttl}s`}
                          </td>
                          <td className="px-2 py-1.5 text-right text-text-muted">
                            <ChevronRight className="h-3.5 w-3.5 inline-block" />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Load More Pagination Bar */}
          {cursor !== '0' && !loading && (
            <div className="p-2 border-t border-border-default bg-bg-subtle flex justify-center shrink-0">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-4 py-1 rounded border border-border-default bg-bg-base text-xs font-medium text-text-primary hover:bg-bg-hover disabled:opacity-50 transition-colors"
              >
                {loadingMore ? 'Loading more...' : 'Load more (SCAN)'}
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Key Detail Drawer */}
        <div className="w-80 flex flex-col min-h-0 border-border-default bg-bg-base shrink-0 overflow-hidden">
          {selectedKey ? (
            <div className="flex flex-1 flex-col min-h-0">
              <div className="border-b border-border-default bg-bg-subtle p-3 shrink-0">
                <div className="text-micro font-semibold uppercase tracking-wider text-text-muted mb-1">
                  Key Detail
                </div>
                <div className="font-mono text-sm font-semibold text-text-primary break-all">
                  {selectedKey}
                </div>
                {detail && (
                  <div className="flex items-center gap-2 mt-2 text-micro">
                    <span className="rounded bg-bg-base border border-border-default px-1.5 py-0.5 uppercase text-text-secondary">
                      {detail.keyType}
                    </span>
                    <span className="text-text-muted">
                      TTL:{' '}
                      {detail.ttl === -1
                        ? 'no expiry'
                        : detail.ttl === -2
                          ? 'expired'
                          : `${detail.ttl}s`}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-auto p-3">
                {loadingDetail ? (
                  <CenteredLoadingState loading label="Fetching key value..." />
                ) : detailError ? (
                  <div className="text-xs text-danger font-mono whitespace-pre-wrap">
                    {detailError}
                  </div>
                ) : detail ? (
                  renderValuePreview(detail)
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center text-text-muted">
              <p className="text-body-secondary text-text-secondary">
                Select a key from the list to view its TTL and structured content.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
