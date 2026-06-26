import { AlertTriangle, Check, Database, Download, FileText, FileSpreadsheet, FileJson, FileCode, Loader2, Table, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type {
  TableExportFormat,
  TableExportOptions,
  TableExportEstimate,
  TableExportJob,
  TableExportTarget,
  RecentTableExport,
} from '../../../_shared/types/shared'

type ModalPhase = 'configure' | 'confirm-large' | 'loading' | 'success' | 'error'

const FORMAT_OPTIONS: Array<{
  value: TableExportFormat
  label: string
  description: string
  icon: typeof FileText
}> = [
  { value: 'csv', label: 'CSV', description: 'Comma-separated values', icon: FileText },
  { value: 'json', label: 'JSON', description: 'Array of row objects', icon: FileJson },
  { value: 'txt', label: 'TXT', description: 'Tab-delimited plain text', icon: FileText },
  { value: 'sql', label: 'SQL', description: 'INSERT statements', icon: FileCode },
  { value: 'xlsx', label: 'XLSX', description: 'Excel workbook', icon: FileSpreadsheet },
]

const ENCODING_OPTIONS: Array<{ value: TableExportOptions['encoding']; label: string }> = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'utf-16', label: 'UTF-16' },
  { value: 'latin1', label: 'Latin-1' },
]

const SQL_MODE_OPTIONS: Array<{ value: TableExportOptions['sqlMode']; label: string }> = [
  { value: 'data-only', label: 'Data Only' },
  { value: 'schema-only', label: 'Schema Only' },
  { value: 'schema-and-data', label: 'Schema + Data' },
]

const TXT_DELIMITER_OPTIONS: Array<{ value: TableExportOptions['txtDelimiter']; label: string }> = [
  { value: '\t', label: 'Tab' },
  { value: ',', label: 'Comma' },
  { value: '|', label: 'Pipe' },
  { value: ';', label: 'Semicolon' },
]

const LARGE_EXPORT_THRESHOLD_BYTES = 50 * 1024 * 1024 // 50 MB

interface ExportDataModalProps {
  target: TableExportTarget
  estimate: TableExportEstimate
  job: TableExportJob
  recentExports: RecentTableExport[]
  onFormatChange?: (format: TableExportFormat) => void
  onSubmit: (target: TableExportTarget, options: TableExportOptions) => Promise<void>
  onUseRecent: (recent: RecentTableExport) => void
  onClose: () => void
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatRowCount(count: number | null): string {
  if (count === null) return '—'
  return count.toLocaleString()
}

function suggestedFilename(target: TableExportTarget, format: TableExportFormat): string {
  const parts = [target.connectionName, target.database, target.schema, target.tableName]
    .filter(Boolean)
    .map((p) => p.replaceAll(/[^a-zA-Z0-9_-]/g, '_'))
  const ext = format === 'xlsx' ? 'xlsx' : format === 'sql' ? 'sql' : format === 'json' ? 'json' : format === 'csv' ? 'csv' : 'txt'
  return `${parts.join('_')}.${ext}`
}

export function ExportDataModal({
  target,
  estimate,
  job,
  recentExports,
  onFormatChange,
  onSubmit,
  onUseRecent,
  onClose,
}: ExportDataModalProps) {
  const [overridePhase, setOverridePhase] = useState<ModalPhase | null>(null)
  const [options, setOptions] = useState<TableExportOptions>({
    format: 'csv',
    includeHeaders: true,
    encoding: 'utf-8',
    sqlMode: 'data-only',
    txtDelimiter: '\t',
  })

  const isLargeExport = useMemo(() => {
    if (estimate.estimatedSizeBytes === null) return false
    return estimate.estimatedSizeBytes >= LARGE_EXPORT_THRESHOLD_BYTES
  }, [estimate.estimatedSizeBytes])

  // Derive phase from job status unless user has overridden (e.g., configure, confirm-large)
  const phase: ModalPhase = overridePhase ?? (
    job.status === 'preparing' || job.status === 'exporting' ? 'loading' :
    job.status === 'success' ? 'success' :
    job.status === 'error' ? 'error' :
    'configure'
  )

  const handleFormatChange = (format: TableExportFormat) => {
    setOptions((prev) => ({ ...prev, format }))
    onFormatChange?.(format)
  }

  const handleConfirm = async () => {
    if (isLargeExport && phase === 'configure') {
      setOverridePhase('confirm-large')
      return
    }
    setOverridePhase(null) // Let job.status drive phase
    try {
      await onSubmit(target, options)
    } catch {
      // Error phase is driven by job.status
    }
  }

  const handleSubmitFromConfirm = async () => {
    setOverridePhase(null) // Let job.status drive phase
    try {
      await onSubmit(target, options)
    } catch {
      // Error phase is driven by job.status
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={phase !== 'loading' ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border-default bg-bg-base shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-subtle">
              <Download size={16} className="text-text-muted" />
            </span>
            <h2 className="text-subheading text-text-primary">Export Table Data</h2>
          </div>
          {phase !== 'loading' && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-subtle hover:text-text-secondary"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* ── Configure phase ── */}
          {phase === 'configure' && (
            <>
              {/* Table identity */}
              <div className="rounded-lg border border-border-default bg-bg-subtle p-3">
                <p className="mb-2 text-label text-text-secondary">
                  Source Table
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-body">
                    <Database size={13} className="shrink-0 text-text-muted" />
                    <span className="text-body-secondary">Connection:</span>
                    <span className="text-body">{target.connectionName}</span>
                  </div>
                  {target.schema && (
                    <div className="flex items-center gap-2 text-body">
                      <span className="w-3.25" />
                      <span className="text-body-secondary">Schema:</span>
                      <span className="rounded bg-bg-muted px-1.5 py-0.5 text-mono">
                        {target.schema}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-body">
                    <Table size={13} className="shrink-0 text-text-muted" />
                    <span className="text-body-secondary">Table:</span>
                    <span className="rounded bg-bg-subtle px-1.5 py-0.5 text-mono">
                      {target.tableName}
                    </span>
                  </div>
                </div>
              </div>

              {/* Format selection */}
              <div>
                <p className="mb-2 text-label text-text-secondary">Format</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {FORMAT_OPTIONS.map((fmt) => {
                    const Icon = fmt.icon
                    const isSelected = options.format === fmt.value
                    return (
                      <button
                        key={fmt.value}
                        type="button"
                        onClick={() => handleFormatChange(fmt.value)}
                        className={[
                          'flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-caption transition-colors',
                          isSelected
                            ? 'border-border-strong bg-bg-subtle text-text-primary'
                            : 'border-border-default bg-bg-base text-text-secondary hover:bg-bg-subtle',
                        ].join(' ')}
                      >
                        <Icon size={16} />
                        {fmt.label}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-1.5 text-caption text-text-muted">
                  {FORMAT_OPTIONS.find((f) => f.value === options.format)?.description}
                </p>
              </div>

              {/* Format-specific options */}
              {(options.format === 'csv' || options.format === 'txt') && (
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-label text-text-secondary">
                    <input
                      type="checkbox"
                      checked={options.includeHeaders}
                      onChange={(e) => setOptions((prev) => ({ ...prev, includeHeaders: e.target.checked }))}
                      className="h-3.5 w-3.5 rounded border-border-strong text-text-secondary focus:ring-border-strong"
                    />
                    Include Headers
                  </label>
                  <div className="flex items-center gap-1.5 text-label text-text-secondary">
                    <span>Encoding:</span>
                    <select
                      value={options.encoding}
                      onChange={(e) =>
                        setOptions((prev) => ({ ...prev, encoding: e.target.value as TableExportOptions['encoding'] }))
                      }
                      className="rounded border border-border-default bg-bg-base px-1.5 py-0.5 text-label focus:outline-none focus:ring-1 focus:ring-border-strong"
                    >
                      {ENCODING_OPTIONS.map((enc) => (
                        <option key={enc.value} value={enc.value}>
                          {enc.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {options.format === 'txt' && (
                <div className="flex items-center gap-1.5 text-label text-text-secondary">
                  <span>Delimiter:</span>
                  <select
                    value={options.txtDelimiter}
                    onChange={(e) =>
                      setOptions((prev) => ({ ...prev, txtDelimiter: e.target.value as TableExportOptions['txtDelimiter'] }))
                    }
                    className="rounded border border-border-default bg-bg-base px-1.5 py-0.5 text-label focus:outline-none focus:ring-1 focus:ring-border-strong"
                  >
                    {TXT_DELIMITER_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {options.format === 'sql' && (
                <div className="flex items-center gap-1.5 text-label text-text-secondary">
                  <span>SQL Mode:</span>
                  <select
                    value={options.sqlMode}
                    onChange={(e) =>
                      setOptions((prev) => ({ ...prev, sqlMode: e.target.value as TableExportOptions['sqlMode'] }))
                    }
                    className="rounded border border-border-default bg-bg-base px-1.5 py-0.5 text-label focus:outline-none focus:ring-1 focus:ring-border-strong"
                  >
                    {SQL_MODE_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  {options.sqlMode !== 'data-only' && (
                    <span className="text-caption text-amber-500">
                      Schema modes are coming soon.
                    </span>
                  )}
                </div>
              )}

              {/* Estimate */}
              <div className="rounded-lg border border-border-default bg-bg-subtle p-3">
                <p className="mb-1.5 text-label text-text-secondary">
                  Export Estimate
                </p>
                {estimate.loading ? (
                  <div className="flex items-center gap-2 text-caption text-text-muted">
                    <Loader2 size={13} className="animate-spin" /> Calculating…
                  </div>
                ) : estimate.error ? (
                  <p className="text-caption text-text-muted">Unable to estimate — export will proceed without preview.</p>
                ) : (
                  <div className="flex items-center gap-4 text-body">
                    <div>
                      <span className="text-text-secondary">Rows:</span>{' '}
                      <span className="text-body">{formatRowCount(estimate.rowCount)}</span>
                    </div>
                    <div>
                      <span className="text-text-secondary">Size:</span>{' '}
                      <span className="text-body">{formatBytes(estimate.estimatedSizeBytes)}</span>
                    </div>
                    <span className="text-caption text-text-muted">
                      ({suggestedFilename(target, options.format)})
                    </span>
                  </div>
                )}
              </div>

              {/* Large export warning (inline, subtle) */}
              {isLargeExport && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
                  <p className="text-caption text-amber-700">
                    This export appears large ({formatBytes(estimate.estimatedSizeBytes)}). It may run as a background job.
                  </p>
                </div>
              )}

              {/* Recent exports */}
              {recentExports.length > 0 && (
                <div>
                  <p className="mb-1.5 text-label text-text-secondary">
                    Recent Exports
                  </p>
                  <div className="max-h-24 space-y-1 overflow-y-auto">
                    {recentExports.slice(0, 5).map((recent) => (
                      <button
                        key={recent.id}
                        type="button"
                        onClick={() => onUseRecent(recent)}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-caption text-text-secondary hover:bg-bg-subtle"
                      >
                        <span>
                          <span className="text-body">{recent.options.format.toUpperCase()}</span>
                          {' · '}
                          {recent.target.tableName}
                        </span>
                        <span className="text-text-muted">{new Date(recent.timestamp).toLocaleDateString()}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Confirm large export ── */}
          {phase === 'confirm-large' && (
            <>
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                <div>
                  <p className="text-body text-amber-800">Large Export Warning</p>
                  <p className="mt-1 text-caption text-amber-600">
                    This export is approximately {formatBytes(estimate.estimatedSizeBytes)} with {formatRowCount(estimate.rowCount)} rows.
                    It may take some time and run as a background job.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border-default bg-bg-subtle p-3">
                <div className="flex items-center gap-4 text-body">
                  <div>
                    <span className="text-text-secondary">Format:</span>{' '}
                    <span className="text-body">{options.format.toUpperCase()}</span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Rows:</span>{' '}
                    <span className="text-body">{formatRowCount(estimate.rowCount)}</span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Size:</span>{' '}
                    <span className="text-body">{formatBytes(estimate.estimatedSizeBytes)}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Loading ── */}
          {phase === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={28} className="animate-spin text-text-secondary" />
              <p className="text-body-secondary">
                Exporting {target.tableName} as {options.format.toUpperCase()}…
              </p>
              {job.progress !== null && (
                <div className="w-full max-w-xs">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-muted">
                    <div
                      className="h-full rounded-full bg-text-secondary transition-all"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Success ── */}
          {phase === 'success' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-subtle">
                <Check size={20} className="text-success" />
              </span>
              <div className="text-center">
                <p className="text-subheading text-text-primary">Export Complete</p>
                <p className="mt-1 text-body-secondary text-text-secondary">
                  {target.tableName} exported as {options.format.toUpperCase()}
                </p>
                {job.savedPath && (
                  <p className="mt-1 max-w-xs truncate text-mono">{job.savedPath}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {phase === 'error' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-subtle">
                <AlertTriangle size={20} className="text-danger" />
              </span>
              <div className="text-center">
                <p className="text-subheading text-text-primary">Export Failed</p>
                <p className="mt-1 max-w-xs text-caption text-danger">{job.error ?? 'An unexpected error occurred.'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border-default px-5 py-3">
          {phase === 'configure' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border-default bg-bg-base px-3.5 py-1.5 text-label text-text-secondary transition-colors hover:bg-bg-subtle"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="rounded-lg bg-bg-muted px-3.5 py-1.5 text-label text-text-inverse transition-colors hover:bg-border-strong focus:outline-none focus:ring-2 focus:ring-border-strong focus:ring-offset-1"
              >
                Export {options.format.toUpperCase()}
              </button>
            </>
          )}
          {phase === 'confirm-large' && (
            <>
              <button
                type="button"
                onClick={() => setOverridePhase('configure')}
                className="rounded-lg border border-border-default bg-bg-base px-3.5 py-1.5 text-label text-text-secondary transition-colors hover:bg-bg-subtle"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSubmitFromConfirm}
                className="rounded-lg bg-bg-muted px-3.5 py-1.5 text-label text-text-inverse transition-colors hover:bg-border-strong focus:outline-none focus:ring-2 focus:ring-border-strong focus:ring-offset-1"
              >
                Proceed with Export
              </button>
            </>
          )}
          {(phase === 'success' || phase === 'error') && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-bg-muted px-3.5 py-1.5 text-label text-text-inverse transition-colors hover:bg-border-strong focus:outline-none focus:ring-2 focus:ring-border-strong focus:ring-offset-1"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
