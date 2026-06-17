import { AlertTriangle, Check, Database, Download, FileText, FileSpreadsheet, FileJson, FileCode, Loader2, Table, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type {
  TableExportFormat,
  TableExportOptions,
  TableExportEstimate,
  TableExportJob,
  TableExportTarget,
  RecentTableExport,
} from '../types'

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
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
              <Download size={16} className="text-slate-500" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800">Export Table Data</h2>
          </div>
          {phase !== 'loading' && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
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
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Source Table
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <Database size={13} className="shrink-0 text-slate-400" />
                    <span className="font-medium text-slate-500">Connection:</span>
                    <span className="font-semibold text-slate-800">{target.connectionName}</span>
                  </div>
                  {target.schema && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-3.25" />
                      <span className="font-medium text-slate-500">Schema:</span>
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-xs text-slate-700">
                        {target.schema}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Table size={13} className="shrink-0 text-slate-400" />
                    <span className="font-medium text-slate-500">Table:</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-700">
                      {target.tableName}
                    </span>
                  </div>
                </div>
              </div>

              {/* Format selection */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Format</p>
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
                          'flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-[11px] transition-colors',
                          isSelected
                            ? 'border-slate-400 bg-slate-100 text-slate-800 font-semibold'
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                        ].join(' ')}
                      >
                        <Icon size={16} />
                        {fmt.label}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {FORMAT_OPTIONS.find((f) => f.value === options.format)?.description}
                </p>
              </div>

              {/* Format-specific options */}
              {(options.format === 'csv' || options.format === 'txt') && (
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={options.includeHeaders}
                      onChange={(e) => setOptions((prev) => ({ ...prev, includeHeaders: e.target.checked }))}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-slate-600 focus:ring-slate-500"
                    />
                    Include Headers
                  </label>
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <span>Encoding:</span>
                    <select
                      value={options.encoding}
                      onChange={(e) =>
                        setOptions((prev) => ({ ...prev, encoding: e.target.value as TableExportOptions['encoding'] }))
                      }
                      className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
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
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span>Delimiter:</span>
                  <select
                    value={options.txtDelimiter}
                    onChange={(e) =>
                      setOptions((prev) => ({ ...prev, txtDelimiter: e.target.value as TableExportOptions['txtDelimiter'] }))
                    }
                    className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
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
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span>SQL Mode:</span>
                  <select
                    value={options.sqlMode}
                    onChange={(e) =>
                      setOptions((prev) => ({ ...prev, sqlMode: e.target.value as TableExportOptions['sqlMode'] }))
                    }
                    className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
                  >
                    {SQL_MODE_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  {options.sqlMode !== 'data-only' && (
                    <span className="text-[11px] text-amber-500">
                      Schema modes are coming soon.
                    </span>
                  )}
                </div>
              )}

              {/* Estimate */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Export Estimate
                </p>
                {estimate.loading ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 size={13} className="animate-spin" /> Calculating…
                  </div>
                ) : estimate.error ? (
                  <p className="text-xs text-slate-400">Unable to estimate — export will proceed without preview.</p>
                ) : (
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-slate-500">Rows:</span>{' '}
                      <span className="font-semibold text-slate-700">{formatRowCount(estimate.rowCount)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Size:</span>{' '}
                      <span className="font-semibold text-slate-700">{formatBytes(estimate.estimatedSizeBytes)}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      ({suggestedFilename(target, options.format)})
                    </span>
                  </div>
                )}
              </div>

              {/* Large export warning (inline, subtle) */}
              {isLargeExport && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
                  <p className="text-xs text-amber-700">
                    This export appears large ({formatBytes(estimate.estimatedSizeBytes)}). It may run as a background job.
                  </p>
                </div>
              )}

              {/* Recent exports */}
              {recentExports.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Recent Exports
                  </p>
                  <div className="max-h-24 space-y-1 overflow-y-auto">
                    {recentExports.slice(0, 5).map((recent) => (
                      <button
                        key={recent.id}
                        type="button"
                        onClick={() => onUseRecent(recent)}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                      >
                        <span>
                          <span className="font-medium text-slate-700">{recent.options.format.toUpperCase()}</span>
                          {' · '}
                          {recent.target.tableName}
                        </span>
                        <span className="text-slate-400">{new Date(recent.timestamp).toLocaleDateString()}</span>
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
                  <p className="text-[13px] font-medium text-amber-800">Large Export Warning</p>
                  <p className="mt-1 text-xs text-amber-600">
                    This export is approximately {formatBytes(estimate.estimatedSizeBytes)} with {formatRowCount(estimate.rowCount)} rows.
                    It may take some time and run as a background job.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="text-slate-500">Format:</span>{' '}
                    <span className="font-semibold text-slate-700">{options.format.toUpperCase()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Rows:</span>{' '}
                    <span className="font-semibold text-slate-700">{formatRowCount(estimate.rowCount)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Size:</span>{' '}
                    <span className="font-semibold text-slate-700">{formatBytes(estimate.estimatedSizeBytes)}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Loading ── */}
          {phase === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={28} className="animate-spin text-slate-500" />
              <p className="text-sm text-slate-600">
                Exporting {target.tableName} as {options.format.toUpperCase()}…
              </p>
              {job.progress !== null && (
                <div className="w-full max-w-xs">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-slate-500 transition-all"
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
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                <Check size={20} className="text-emerald-600" />
              </span>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800">Export Complete</p>
                <p className="mt-1 text-xs text-slate-500">
                  {target.tableName} exported as {options.format.toUpperCase()}
                </p>
                {job.savedPath && (
                  <p className="mt-1 max-w-xs truncate font-mono text-[11px] text-slate-400">{job.savedPath}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {phase === 'error' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle size={20} className="text-red-500" />
              </span>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800">Export Failed</p>
                <p className="mt-1 max-w-xs text-xs text-red-600">{job.error ?? 'An unexpected error occurred.'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          {phase === 'configure' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="rounded-lg bg-slate-700 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-1"
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
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSubmitFromConfirm}
                className="rounded-lg bg-slate-700 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-1"
              >
                Proceed with Export
              </button>
            </>
          )}
          {(phase === 'success' || phase === 'error') && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-700 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-1"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
