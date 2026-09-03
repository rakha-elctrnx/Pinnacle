import { useState, useEffect } from 'react'
import { Folder, Plus, Trash2, Eye, EyeOff } from 'lucide-react'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import { CenteredLoadingState } from '../../_shared/components/ui/CenteredLoadingState'
import type { MongoIndexInfo } from '../types/mongodb'
import {
  mongoListIndexes,
  mongoCreateIndex,
  mongoDropIndex,
  mongoSetIndexHidden,
} from '../clients/mongodb'

interface Props {
  payload: ConnectionPayload | null
  database: string
  collection: string
}

export function MongoIndexesTab({ payload, database, collection }: Props) {
  const [indexes, setIndexes] = useState<MongoIndexInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newKey, setNewKey] = useState('')

  const loadIndexes = () => {
    if (!payload) return
    setLoading(true)
    mongoListIndexes({ connection: payload, database, collection })
      .then((res) => setIndexes(res))
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!payload) return
    let isMounted = true

    const fetchIndexes = async () => {
      setLoading(true)
      try {
        const result = await mongoListIndexes({
          connection: payload,
          database,
          collection,
        })
        if (isMounted) setIndexes(result)
      } catch (reason: unknown) {
        if (isMounted) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    void fetchIndexes()
    return () => {
      isMounted = false
    }
  }, [payload, database, collection])

  const handleCreateIndex = async () => {
    if (!payload || !newKey.trim()) return
    try {
      await mongoCreateIndex({
        connection: payload,
        database,
        collection,
        keys: { [newKey.trim()]: 1 },
      })
      setNewKey('')
      loadIndexes()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDropIndex = async (name: string) => {
    if (!payload) return
    if (!confirm(`Drop index ${name}?`)) return
    try {
      await mongoDropIndex({
        connection: payload,
        database,
        collection,
        indexName: name,
      })
      loadIndexes()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleToggleHidden = async (name: string, currentHidden: boolean) => {
    if (!payload) return
    try {
      await mongoSetIndexHidden({
        connection: payload,
        database,
        collection,
        indexName: name,
        hidden: !currentHidden,
      })
      loadIndexes()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="flex flex-col h-full bg-bg-base text-text-primary p-4 gap-4">
      <div className="flex items-center justify-between bg-bg-subtle p-3 rounded-lg border border-border-default">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <Folder className="w-4 h-4 text-success" />
          <input
            type="text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Field name (e.g. email)"
            className="w-full bg-bg-base text-xs font-mono text-text-primary px-3 py-1.5 rounded border border-border-default focus:outline-none focus:border-primary"
          />
        </div>
        <button
          onClick={handleCreateIndex}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-text-inverse rounded text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Create Index
        </button>
      </div>

      {error && (
        <div className="p-3 bg-danger-subtle border border-border-danger text-danger text-xs rounded-md">
          {error}
        </div>
      )}

      <div className="relative flex-1 overflow-auto border border-border-default rounded-lg bg-bg-subtle">
        {loading ? (
          <CenteredLoadingState loading label="Loading indexes..." />
        ) : indexes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-caption text-text-muted">
            No indexes are available for this collection.
          </div>
        ) : (
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-bg-subtle text-text-muted border-b border-border-default">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Keys</th>
                <th className="px-4 py-2.5 font-medium">Unique</th>
                <th className="px-4 py-2.5 font-medium">Hidden</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default/50">
              {indexes.map((idx) => (
                <tr key={idx.name} className="hover:bg-bg-muted/40">
                  <td className="px-4 py-2.5 text-success font-semibold">
                    {idx.name}
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">
                    {JSON.stringify(idx.keys)}
                  </td>
                  <td className="px-4 py-2.5 text-text-muted">
                    {idx.unique ? 'Yes' : 'No'}
                  </td>
                  <td className="px-4 py-2.5 text-text-muted">
                    {idx.hidden ? 'Yes' : 'No'}
                  </td>
                  <td className="px-4 py-2.5 text-right flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleToggleHidden(idx.name, idx.hidden)}
                      className="text-text-muted hover:text-text-primary"
                      title={idx.hidden ? 'Unhide' : 'Hide'}
                      aria-label={`${idx.hidden ? 'Unhide' : 'Hide'} ${idx.name}`}
                    >
                      {idx.hidden ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4" />
                      )}
                    </button>
                    {idx.name !== '_id_' && (
                      <button
                        onClick={() => handleDropIndex(idx.name)}
                        className="text-text-muted hover:text-danger"
                        title="Drop Index"
                        aria-label={`Drop ${idx.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
