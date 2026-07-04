import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ConnectionStatus } from '../../types/shared'
import { statusStyle } from '../../constants'

/** Pagination info for SQL (offset-based) */
export interface SqlPagination {
  page: number
  totalPages: number
  pageSize: number
}

/** Pagination info for Elasticsearch (cursor-based) */
export interface EsPagination {
  hasPrev: boolean
  hasNext: boolean
  searchAfter?: unknown[]
}

export type PaginationState = SqlPagination | EsPagination

export interface StatusBarContext {
  /** Connector badge label (e.g. "SQL", "Elasticsearch") */
  connector: string
  /** Active entity name (table/index/query) */
  entity?: string
  /** Sub-mode (e.g. "Data", "Documents", "Mapping") */
  mode?: string
  /** Data info string (e.g. "125 rows", "42 hits") */
  dataInfo?: string
  /** Pagination state. If provided, pagination nav renders. */
  pagination?: PaginationState
  /** Runtime status */
  runtimeStatus: 'idle' | 'loading' | 'error'
  /** Short error message (shown only when runtimeStatus === 'error') */
  errorMessage?: string
  /** Connection status indicator */
  connectionStatus?: ConnectionStatus
  /** Optional: elapsed time info (e.g. "done in 120ms") */
  elapsedMs?: number
  /** Callbacks for pagination */
  onPrevPage?: () => void
  onNextPage?: () => void
}

interface WorkspaceStatusBarProps {
  context: StatusBarContext
}

/**
 * Shared status bar component rendered at the bottom of workspace.
 * Displays contextual info, data counts, pagination navigation, and runtime status.
 */
export function WorkspaceStatusBar({ context }: WorkspaceStatusBarProps) {
  const { connector, entity, mode, dataInfo, pagination, runtimeStatus, errorMessage, connectionStatus, elapsedMs } = context

  const isPaginationEnabled = pagination !== undefined
  const isSqlPagination = isPaginationEnabled && 'totalPages' in pagination!
  const isEsPagination = isPaginationEnabled && 'hasNext' in pagination!

  return (
    <footer className="shrink-0 border-t border-outline-variant bg-surface px-3 py-1.5 text-caption text-on-surface">
      <div className="flex items-center justify-between gap-3">
        {/* Left: connector badge + entity */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-label text-on-surface whitespace-nowrap">
            {connector}
          </span>
          {entity && (
            <>
              <span className="text-on-surface">·</span>
              <span className="truncate text-on-surface-variant">{entity}</span>
            </>
          )}
          {mode && (
            <>
              <span className="text-on-surface">·</span>
              <span className="text-on-surface-variant">{mode}</span>
            </>
          )}
        </div>

        {/* Center: data info + pagination */}
        <div className="flex items-center gap-2">
          {dataInfo && (
            <span className="whitespace-nowrap text-on-surface-variant">{dataInfo}</span>
          )}
          {isSqlPagination && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={context.onPrevPage}
                disabled={(pagination as SqlPagination).page <= 0}
                className="cursor-pointer rounded p-0.5 text-on-surface hover:text-on-surface-variant disabled:opacity-30 transition-colors"
                title="Previous page"
              >
                <ChevronLeft size={12} />
              </button>
              <span className="text-micro text-on-surface select-none">
                {(pagination as SqlPagination).page + 1} of {(pagination as SqlPagination).totalPages}
              </span>
              <button
                type="button"
                onClick={context.onNextPage}
                disabled={(pagination as SqlPagination).page + 1 >= (pagination as SqlPagination).totalPages}
                className="cursor-pointer rounded p-0.5 text-on-surface hover:text-on-surface-variant disabled:opacity-30 transition-colors"
                title="Next page"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          )}
          {isEsPagination && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={context.onPrevPage}
                disabled={!(pagination as EsPagination).hasPrev}
                className="rounded px-1.5 py-0.5 text-caption text-on-surface hover:text-on-surface-variant hover:bg-surface-variant disabled:opacity-30 transition-colors"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={context.onNextPage}
                disabled={!(pagination as EsPagination).hasNext}
                className="rounded px-1.5 py-0.5 text-caption text-on-surface hover:text-on-surface-variant hover:bg-surface-variant disabled:opacity-30 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Right: runtime status + connection status */}
        <div className="flex items-center gap-2 shrink-0">
          {runtimeStatus === 'loading' && (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              loading…
            </span>
          )}
          {runtimeStatus === 'error' && (
            <span className="inline-flex items-center gap-1 text-red-500" title={errorMessage}>
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              error
            </span>
          )}
          {runtimeStatus === 'idle' && elapsedMs !== undefined && (
            <span className="text-on-surface">done in {elapsedMs}ms</span>
          )}
          {runtimeStatus === 'idle' && elapsedMs === undefined && (
            <span className="text-on-surface">ready</span>
          )}
          {connectionStatus && (
            <span className="inline-flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${statusStyle[connectionStatus] ?? 'text-on-surface-variant'}`} />
              <span className="text-micro text-on-surface">{connectionStatus}</span>
            </span>
          )}
        </div>
      </div>
    </footer>
  )
}