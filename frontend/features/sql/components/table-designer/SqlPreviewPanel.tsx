import { useState } from 'react'
import { Copy, Check, AlertTriangle } from 'lucide-react'
import type { DdlPlan } from '../../logic/table-designer'

interface SqlPreviewPanelProps {
  ddlPlan: DdlPlan | null
  isGenerating: boolean
}

/**
 * SQL Preview Panel — displays the ordered DDL statements with
 * copy-SQL functionality and destructive-statement highlighting.
 */
export function SqlPreviewPanel({
  ddlPlan,
  isGenerating,
}: SqlPreviewPanelProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (!ddlPlan) return
    const sql = ddlPlan.statements.map((s) => s.sql).join('\n\n')
    navigator.clipboard.writeText(sql)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isGenerating) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-border-default border-t-primary" />
          <p className="mt-2 text-xs text-text-secondary">
            Generating SQL preview...
          </p>
        </div>
      </div>
    )
  }

  if (!ddlPlan || ddlPlan.statements.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <p className="text-sm text-text-secondary">No SQL to preview.</p>
          <p className="text-xs text-text-muted">
            Generate a preview after making changes.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 overflow-auto p-4">
      {/* Header + Copy */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary">
            {ddlPlan.statements.length} statement
            {ddlPlan.statements.length !== 1 ? 's' : ''}
          </span>
          {ddlPlan.isDestructive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger-subtle px-2 py-0.5 text-[10px] font-semibold text-[var(--color-danger)]">
              <AlertTriangle size={10} /> Destructive changes
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-md border border-border-default px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-subtle"
        >
          {copied ? (
            <Check size={12} className="text-success-text" />
          ) : (
            <Copy size={12} />
          )}
          {copied ? 'Copied!' : 'Copy SQL'}
        </button>
      </div>

      {/* Warnings */}
      {ddlPlan.warnings.length > 0 && (
        <div className="rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-3">
          <p className="text-xs font-semibold text-[var(--color-warning)]">
            Warnings
          </p>
          <ul className="mt-1 space-y-0.5">
            {ddlPlan.warnings.map((w, i) => (
              <li key={i} className="text-xs text-[var(--color-warning)]">
                • {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Statements */}
      <div className="space-y-2">
        {ddlPlan.statements
          .sort((a, b) => a.order - b.order)
          .map((stmt) => (
            <div
              key={stmt.order}
              className={`rounded-lg border p-3 ${
                stmt.isDestructive
                  ? 'border-border-danger bg-danger-subtle'
                  : 'border-border-default bg-bg-base'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-mono text-text-muted">
                  #{stmt.order}
                </span>
                <span className="text-xs font-medium text-text-secondary">
                  {stmt.description}
                </span>
                {stmt.isDestructive && (
                  <AlertTriangle
                    size={11}
                    className="text-[var(--color-danger)]"
                  />
                )}
              </div>
              <pre className="overflow-x-auto rounded bg-slate-900 p-2 text-xs text-slate-100 font-mono whitespace-pre-wrap">
                {stmt.sql}
              </pre>
            </div>
          ))}
      </div>
    </div>
  )
}
