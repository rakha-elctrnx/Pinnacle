/**
 * Error normalization — standard error categories for connector operations.
 *
 * Phase 2: Normalize errors from all connectors into a standard set of
 * categories so UI feedback is consistent across SQL and Elasticsearch flows.
 *
 * Standard categories (aligned with AC):
 *   auth_failed        — bad credentials, access denied by remote
 *   network_unreachable — host unreachable, DNS failure, connection refused
 *   timeout            — connection or request timed out
 *   permission_denied  — authenticated but not authorized for operation
 *   invalid_input      — bad request payload, malformed query, invalid params
 *   unknown            — fallback for unmapped errors
 */

export type ErrorCategory =
  | 'auth_failed'
  | 'network_unreachable'
  | 'timeout'
  | 'permission_denied'
  | 'invalid_input'
  | 'unknown'

export interface NormalizedError {
  category: ErrorCategory
  message: string
  original?: unknown
}

/**
 * Attempt to extract an error message string from an unknown thrown value.
 */
function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const maybe = (err as Record<string, unknown>).message
    if (typeof maybe === 'string') return maybe
    return JSON.stringify(err)
  }
  return String(err)
}

/**
 * Attempt to extract a string representation for pattern matching.
 */
function extractSearchable(err: unknown): string {
  const msg = extractMessage(err).toLowerCase()
  // Also include stringified form for deeper matching
  const stringified =
    err && typeof err === 'object' ? JSON.stringify(err).toLowerCase() : ''
  return `${msg} ${stringified}`
}

/**
 * Normalize any error into a standard category + message.
 *
 * Pattern matching is ordered; first match wins.
 */
export function normalizeError(err: unknown): NormalizedError {
  const text = extractSearchable(err)
  const message = extractMessage(err)

  // ── auth_failed ──────────────────────────────────────────────
  if (
    /authentication failed|auth failed|invalid credentials|login failed|unauthorized|401|403.*auth/i.test(
      text,
    )
  ) {
    return { category: 'auth_failed', message, original: err }
  }

  // ── network_unreachable ─────────────────────────────────────
  if (
    /econnrefused|econnreset|enetunreach|network.*unreachable|connection refused|dns.*not found|no route to host|getaddrinfo/i.test(
      text,
    )
  ) {
    return { category: 'network_unreachable', message, original: err }
  }

  // ── timeout ─────────────────────────────────────────────────
  if (/timeout|timed out|etimedout|time.*exceeded/i.test(text)) {
    return { category: 'timeout', message, original: err }
  }

  // ── permission_denied ───────────────────────────────────────
  if (
    /permission denied|access denied|not authorized|forbidden|403|insufficient privilege/i.test(
      text,
    )
  ) {
    return { category: 'permission_denied', message, original: err }
  }

  // ── invalid_input ───────────────────────────────────────────
  if (
    /invalid input|syntax error|malformed|bad request|invalid.*parameter|parse error|validation.*failed/i.test(
      text,
    )
  ) {
    return { category: 'invalid_input', message, original: err }
  }

  return { category: 'unknown', message, original: err }
}

/**
 * Get a user-facing label for an error category.
 */
export function errorCategoryLabel(category: ErrorCategory): string {
  const labels: Record<ErrorCategory, string> = {
    auth_failed: 'Authentication Failed',
    network_unreachable: 'Network Unreachable',
    timeout: 'Connection Timeout',
    permission_denied: 'Permission Denied',
    invalid_input: 'Invalid Input',
    unknown: 'Error',
  }
  return labels[category]
}

/**
 * Get a CSS color class for an error category (tailwind).
 */
export function errorCategoryColor(category: ErrorCategory): string {
  const colors: Record<ErrorCategory, string> = {
    auth_failed: 'text-red-600',
    network_unreachable: 'text-orange-600',
    timeout: 'text-amber-600',
    permission_denied: 'text-yellow-700',
    invalid_input: 'text-rose-600',
    unknown: 'text-slate-600',
  }
  return colors[category]
}
