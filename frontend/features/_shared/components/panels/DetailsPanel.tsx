import { Download, Sparkles, WandSparkles } from 'lucide-react'
import type { ConnectionProfile } from '../../types/domain'
import type { DetailStat } from '../../types/shared'

interface DetailsPanelProps {
  selectedConnection: ConnectionProfile | null
  detailsStats: DetailStat[]
  onClose?: () => void
  onExportData?: () => void
}

export function DetailsPanel({
  selectedConnection,
  detailsStats,
  onExportData,
}: DetailsPanelProps) {
  return (
    <aside className="bg-slate-50">
      <section className="space-y-3 border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <p className="text-subheading text-slate-800">Details Panel</p>
        </div>
        {!selectedConnection ? (
          <p className="text-body text-slate-500">
            Connection details and live statistics appear here.
          </p>
        ) : (
          <>
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-body text-slate-600">
              <p>
                <span className="text-subheading text-slate-800">Host:</span>{' '}
                {selectedConnection.host}
              </p>
              <p>
                <span className="text-subheading text-slate-800">Port:</span>{' '}
                {selectedConnection.port}
              </p>
              <p>
                <span className="text-subheading text-slate-800">
                  Database:
                </span>{' '}
                {selectedConnection.database}
              </p>
              <p>
                <span className="text-subheading text-slate-800">SSL:</span>{' '}
                {selectedConnection.sslConfig
                  ? selectedConnection.sslConfig.mode
                  : selectedConnection.ssl
                    ? 'Enabled'
                    : 'Disabled'}
              </p>
            </div>

            <div className="grid gap-2">
              {detailsStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-body"
                >
                  <p className="text-label text-slate-400">{stat.label}</p>
                  <p className="text-subheading text-slate-700">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="mb-2 text-label text-slate-500">Productivity</p>
              <div className="space-y-2 text-body text-slate-700">
                <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100">
                  <Sparkles size={14} className="text-slate-500" /> Favorite
                  this table/query
                </button>
                <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100">
                  <WandSparkles size={14} className="text-slate-500" /> Open
                  snippets and templates
                </button>
                <button
                  onClick={onExportData}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
                >
                  <Download size={14} className="text-slate-500" /> Export Table
                  Data
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </aside>
  )
}
