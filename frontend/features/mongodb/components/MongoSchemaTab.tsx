import { useState } from 'react'
import { Cpu, RefreshCw } from 'lucide-react'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import type { MongoSampleSchemaResult } from '../types/mongodb'
import { mongoAnalyzeSchema } from '../clients/mongodb'

interface Props {
  payload: ConnectionPayload | null
  database: string
  collection: string
}

export function MongoSchemaTab({ payload, database, collection }: Props) {
  const [result, setResult] = useState<MongoSampleSchemaResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAnalyze = async () => {
    if (!payload) return
    setError(null)
    setLoading(true)
    try {
      const res = await mongoAnalyzeSchema({
        connection: payload,
        database,
        collection,
        sampleSize: 100,
      })
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-bg-base text-text-primary p-4 gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-success" />
          <span className="text-xs font-semibold text-text-primary">Schema Analysis (100 Sampled Docs)</span>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-text-inverse rounded text-xs font-medium transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Analyze Schema
        </button>
      </div>

      {error && (
        <div className="p-3 bg-danger-subtle border border-border-danger text-danger text-xs rounded-md">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto bg-bg-subtle border border-border-default rounded-lg p-4 font-mono text-xs">
        {loading ? (
          <div className="text-text-muted">Sampling schema...</div>
        ) : !result ? (
          <div className="text-text-muted">Click Analyze Schema to sample document fields and types</div>
        ) : (
          <div className="space-y-4">
            <div className="text-text-muted text-[11px]">
              Examined {result.sampledDocuments} documents in {result.samplingDurationMs}ms
            </div>
            <div className="divide-y divide-border-default">
              {result.fields.map((field) => (
                <div key={field.path} className="py-2 flex items-center justify-between">
                  <span className="text-success font-semibold">{field.path}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-text-muted">{field.presencePercentage}% presence</span>
                    <div className="flex gap-1">
                      {field.types.map((t) => (
                        <span key={t.typeName} className="px-2 py-0.5 bg-bg-muted text-text-secondary rounded text-[10px]">
                          {t.typeName} ({t.percentage}%)
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
