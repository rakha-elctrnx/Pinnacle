import { useState } from 'react'
import { Play, Code } from 'lucide-react'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import type { MongoDocumentListResult } from '../types/mongodb'
import { mongoAggregate } from '../clients/mongodb'

interface Props {
  payload: ConnectionPayload | null
  database: string
  collection: string
}

export function MongoAggregationsTab({ payload, database, collection }: Props) {
  const [pipelineText, setPipelineText] = useState('[\n  { "$match": {} }\n]')
  const [results, setResults] = useState<MongoDocumentListResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRunPipeline = async () => {
    if (!payload) return
    try {
      const parsed = JSON.parse(pipelineText)
      if (!Array.isArray(parsed)) {
        setError('Pipeline must be a JSON array of stage objects.')
        return
      }
      setError(null)
      setLoading(true)

      const res = await mongoAggregate({
        connection: payload,
        database,
        collection,
        pipeline: parsed,
      })
      setResults(res)
    } catch (e) {
      setError(`Invalid pipeline JSON: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-bg-base text-text-primary p-4 gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
            <Code className="w-4 h-4 text-success" /> Pipeline Editor (JSON Array)
          </label>
          <button
            onClick={handleRunPipeline}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-text-inverse rounded text-xs font-medium transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" /> Execute Pipeline
          </button>
        </div>
        <textarea
          value={pipelineText}
          onChange={(e) => setPipelineText(e.target.value)}
          className="w-full h-36 bg-bg-subtle font-mono text-xs text-text-primary p-3 rounded-lg border border-border-default focus:outline-none focus:border-primary resize-none"
        />
      </div>

      {error && (
        <div className="p-3 bg-danger-subtle border border-border-danger text-danger text-xs rounded-md">
          {error}
        </div>
      )}

      <div className="flex-1 flex flex-col bg-bg-subtle border border-border-default rounded-lg overflow-hidden">
        <div className="p-3 border-b border-border-default flex items-center justify-between">
          <span className="text-xs font-semibold text-text-muted">
            Results {results ? `(${results.documents.length} docs, ${results.executionTimeMs}ms)` : ''}
          </span>
        </div>
        <div className="flex-1 overflow-auto p-3 font-mono text-xs">
          {loading ? (
            <div className="text-text-muted">Executing pipeline...</div>
          ) : !results ? (
            <div className="text-text-muted">Click Execute Pipeline to see results</div>
          ) : results.documents.length === 0 ? (
            <div className="text-text-muted">Pipeline returned 0 documents</div>
          ) : (
            <pre className="text-success-text">{JSON.stringify(results.documents, null, 2)}</pre>
          )}
        </div>
      </div>
    </div>
  )
}
