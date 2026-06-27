/**
 * GenerateSqlModal — modal that displays generated SQL statements for review.
 *
 * Provides syntax-highlighted (monospace) SQL in a read-only textarea for
 * manual copy/paste. This is a preview tool only — SQL is NOT executed.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Copy, X, TriangleAlert } from 'lucide-react'

interface GenerateSqlModalProps {
  open: boolean
  sql: string
  onClose: () => void
}

export function GenerateSqlModal({ open, sql, onClose }: GenerateSqlModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [copied, setCopied] = useState(false)

  // Focus textarea on open
  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus()
      // Select all for easy copy
      textareaRef.current.select()
    }
  }, [open, sql])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sql)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select all for manual copy
      textareaRef.current?.select()
    }
  }, [sql])

  if (!open) return null

  // Determine if the SQL contains "No primary key" messages
  const hasWarnings = sql.includes('No primary key')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Generated SQL"
    >
      <div
        className="flex w-full max-w-2xl flex-col rounded-xl bg-bg-base p-0 shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
          <h3 className="flex items-center gap-2 text-subheading text-text-primary">
            <TriangleAlert size={16} className="text-text-muted" />
            Generated SQL Preview
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-text-muted transition-colors hover:bg-bg-muted hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Warnings ──────────────────────────────────────── */}
        {hasWarnings && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2 text-caption text-text-primary">
            <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" />
            <span>
              Some statements could not be generated because no primary key was detected.
              UPDATE and DELETE statements require a primary key column.
            </span>
          </div>
        )}

        {/* ── SQL contents ──────────────────────────────────── */}
        <div className="max-h-96 overflow-auto p-4">
          <textarea
            ref={textareaRef}
            readOnly
            value={sql}
            className="w-full min-h-48 resize-none rounded-lg border border-border-default bg-bg-subtle p-3 font-mono text-body text-text-primary outline-none focus:ring-1 focus:ring-primary"
            spellCheck={false}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
        </div>

        {/* ── Footer ────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-border-default px-4 py-3">
          <span className="text-caption text-text-muted">
            Read-only preview — SQL is not executed
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border-default px-3 py-1.5 text-body text-text-primary transition-colors hover:bg-bg-muted"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-body text-white transition-colors hover:bg-primary-hover"
            >
              <Copy size={14} />
              {copied ? 'Copied!' : 'Copy SQL'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
