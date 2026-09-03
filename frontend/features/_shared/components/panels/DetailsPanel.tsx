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
    <aside className="bg-bg-subtle">
      <section className="space-y-3 border-border-default p-3">
        <div className="flex items-center justify-between">
          <p className="text-subheading text-text-primary">Details Panel</p>
        </div>
        {!selectedConnection ? (
          <p className="text-body text-text-secondary">
            Connection details and live statistics appear here.
          </p>
        ) : (
          <>
            <div className="rounded-lg border border-border-default bg-bg-base p-3 text-body text-text-secondary">
              <p>
                <span className="text-subheading text-text-primary">Host:</span>{' '}
                {selectedConnection.host}
              </p>
              <p>
                <span className="text-subheading text-text-primary">Port:</span>{' '}
                {selectedConnection.port}
              </p>
              <p>
                <span className="text-subheading text-text-primary">
                  Database:
                </span>{' '}
                {selectedConnection.database}
              </p>
              <p>
                <span className="text-subheading text-text-primary">SSL:</span>{' '}
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
                  className="rounded-lg border border-border-default bg-bg-base px-3 py-2 text-body"
                >
                  <p className="text-label text-text-muted">{stat.label}</p>
                  <p className="text-subheading text-text-secondary">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border-default bg-bg-base p-3">
              <p className="mb-2 text-label text-text-secondary">
                Productivity
              </p>
              <div className="space-y-2 text-body text-text-secondary">
                <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-bg-muted">
                  <Sparkles size={14} className="text-text-muted" /> Favorite
                  this table/query
                </button>
                <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-bg-muted">
                  <WandSparkles size={14} className="text-text-muted" /> Open
                  snippets and templates
                </button>
                <button
                  onClick={onExportData}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-bg-muted"
                >
                  <Download size={14} className="text-text-muted" /> Export
                  Table Data
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </aside>
  )
}
