import { save as saveFileDialog } from '@tauri-apps/plugin-dialog'
import { Download, X } from 'lucide-react'
import { useState } from 'react'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import type { MongoExportFormat } from '../types/mongodb'
import { mongoExport } from '../clients/mongodb'

interface Props {
  payload: ConnectionPayload | null
  database: string
  collection: string
  onClose: () => void
}

export function MongoExportModal({ payload, database, collection, onClose }: Props) {
  const [format, setFormat] = useState<MongoExportFormat>('json')
  const [filterText, setFilterText] = useState('{}')
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successPath, setSuccessPath] = useState<string | null>(null)

  const handleExport = async () => {
    if (!payload) return
    let filter: Record<string, unknown> = {}
    try {
      if (filterText.trim()) {
        filter = JSON.parse(filterText)
      }
    } catch (e) {
      setError(`Invalid filter JSON: ${e instanceof Error ? e.message : String(e)}`)
      return
    }

    const defaultExt = format === 'csv' ? 'csv' : 'json'
    const defaultName = `${database}_${collection}_export.${defaultExt}`

    const destinationPath = await saveFileDialog({
      defaultPath: defaultName,
      filters: [
        {
          name: format.toUpperCase(),
          extensions: [defaultExt],
        },
      ],
    })

    if (!destinationPath) return

    setError(null)
    setIsExporting(true)
    try {
      const res = await mongoExport({
        connection: payload,
        database,
        collection,
        format,
        destinationPath,
        filter,
      })
      if (res.success && res.filePath) {
        setSuccessPath(res.filePath)
      } else {
        setError(res.error || 'Export failed')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-shadow/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-bg-subtle border border-border-default rounded-xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden text-text-primary">
        <div className="flex items-center justify-between p-4 border-b border-border-default bg-bg-subtle">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Download className="w-4 h-4 text-success" /> Export Collection ({collection})
          </h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-secondary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-danger-subtle border border-border-danger text-danger rounded-md">
              {error}
            </div>
          )}
          {successPath && (
            <div className="p-3 bg-success-subtle border border-border-success text-success rounded-md">
              Exported successfully to: <br />
              <span className="font-mono break-all">{successPath}</span>
            </div>
          )}

          <div>
            <label className="block text-text-muted mb-1 font-medium">Export Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as MongoExportFormat)}
              className="w-full bg-bg-base text-text-primary p-2 rounded border border-border-default focus:outline-none focus:border-primary"
            >
              <option value="json">Canonical Extended JSON Lines</option>
              <option value="jsonArray">Canonical Extended JSON Array</option>
              <option value="csv">CSV (Flattened dot paths)</option>
            </select>
          </div>

          <div>
            <label className="block text-text-muted mb-1 font-medium">Filter (JSON)</label>
            <textarea
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full h-24 bg-bg-base font-mono text-text-primary p-2 rounded border border-border-default focus:outline-none focus:border-primary resize-none"
            />
          </div>
        </div>

        <div className="p-4 border-t border-border-default flex justify-end gap-2 bg-bg-subtle">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-bg-muted hover:bg-bg-hover text-text-secondary rounded text-xs"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-4 py-1.5 bg-primary hover:bg-primary-hover text-text-inverse rounded text-xs font-medium transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
