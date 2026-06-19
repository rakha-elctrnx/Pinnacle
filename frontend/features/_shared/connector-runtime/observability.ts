/**
 * Observability — telemetry hooks for connector runtime metrics.
 *
 * Phase 3: Menyediakan kategori error, latency operasi utama, dan retry signal
 * untuk monitoring kualitas runtime per connector.
 *
 * Telemetry dikumpulkan di memory; bisa diekstensi ke external pipeline di fase lanjutan.
 */

import type { ErrorCategory } from './error-norm'
import { normalizeError } from './error-norm'

/** Standard operation names tracked by observability. */
export type ConnectorOperation =
  | 'test-connection'
  | 'load-navigation-tree'
  | 'open-entity'
  | 'run-query'
  | 'get-default-context'

/** A single telemetry record for an operation. */
export interface OperationTelemetry {
  operation: ConnectorOperation
  connectorType: string
  /** Duration in milliseconds. */
  latencyMs: number
  /** Whether the operation succeeded. */
  success: boolean
  /** Error category if failed, undefined if success. */
  errorCategory?: ErrorCategory
  /** Whether this was a retry attempt. */
  isRetry: boolean
  /** Timestamp when the operation completed. */
  timestamp: number
}

/**
 * Aggregated metrics for a connector type over a window.
 */
export interface ConnectorMetricsSummary {
  connectorType: string
  totalOperations: number
  successCount: number
  failureCount: number
  /** Average latency in ms across all operations. */
  avgLatencyMs: number
  /** P99 latency in ms (approximate by top sample). */
  p99LatencyMs: number
  /** Retry count. */
  retryCount: number
  /** Breakdown of error categories. */
  errorBreakdown: Partial<Record<ErrorCategory, number>>
  /** Breakdown by operation type. */
  operationBreakdown: Partial<Record<ConnectorOperation, number>>
}

/**
 * In-memory telemetry store.
 * Collects per-operation records for runtime analysis.
 */
class TelemetryStore {
  private records: OperationTelemetry[] = []
  private maxRecords = 10_000

  /** Record a telemetry entry. */
  record(entry: OperationTelemetry): void {
    this.records.push(entry)
    // Trim oldest when exceeding max
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords)
    }
  }

  /** Get all records for a connector type. */
  getForConnector(connectorType: string): OperationTelemetry[] {
    return this.records.filter((r) => r.connectorType === connectorType)
  }

  /** Compute summary metrics for a connector type. */
  getSummary(connectorType: string): ConnectorMetricsSummary {
    const ops = this.getForConnector(connectorType)
    if (ops.length === 0) {
      return {
        connectorType,
        totalOperations: 0,
        successCount: 0,
        failureCount: 0,
        avgLatencyMs: 0,
        p99LatencyMs: 0,
        retryCount: 0,
        errorBreakdown: {},
        operationBreakdown: {},
      }
    }

    const latencies = ops.map((o) => o.latencyMs).sort((a, b) => a - b)
    const successCount = ops.filter((o) => o.success).length
    const failureCount = ops.filter((o) => !o.success).length
    const retryCount = ops.filter((o) => o.isRetry).length
    const avgLatencyMs = latencies.reduce((a, b) => a + b, 0) / latencies.length
    const p99Index = Math.ceil(latencies.length * 0.99) - 1
    const p99LatencyMs = latencies[Math.max(0, p99Index)]

    // Error breakdown
    const errorBreakdown: Partial<Record<ErrorCategory, number>> = {}
    for (const op of ops) {
      if (!op.success && op.errorCategory) {
        errorBreakdown[op.errorCategory] = (errorBreakdown[op.errorCategory] ?? 0) + 1
      }
    }

    // Operation breakdown
    const operationBreakdown: Partial<Record<ConnectorOperation, number>> = {}
    for (const op of ops) {
      operationBreakdown[op.operation] = (operationBreakdown[op.operation] ?? 0) + 1
    }

    return {
      connectorType,
      totalOperations: ops.length,
      successCount,
      failureCount,
      avgLatencyMs: Math.round(avgLatencyMs * 100) / 100,
      p99LatencyMs,
      retryCount,
      errorBreakdown,
      operationBreakdown,
    }
  }

  /** Get all stored records (for debugging / export). */
  getAllRecords(): OperationTelemetry[] {
    return [...this.records]
  }

  /** Clear all records. */
  clear(): void {
    this.records = []
  }
}

/** Singleton telemetry store. */
export const telemetryStore = new TelemetryStore()

/**
 * Wrap an async operation with telemetry recording.
 *
 * Records latency, success/failure, error category, and retry flag.
 * Returns the result of the operation.
 */
export async function trackOperation<T>(
  connectorType: string,
  operation: ConnectorOperation,
  fn: () => Promise<T>,
  options?: { isRetry?: boolean },
): Promise<T> {
  const start = performance.now()
  let success = false
  let errorCategory: ErrorCategory | undefined

  try {
    const result = await fn()
    success = true
    return result
  } catch (err) {
    const normalized = normalizeError(err)
    errorCategory = normalized.category
    throw err
  } finally {
    const latencyMs = Math.round((performance.now() - start) * 100) / 100
    telemetryStore.record({
      operation,
      connectorType,
      latencyMs,
      success,
      errorCategory,
      isRetry: options?.isRetry ?? false,
      timestamp: Date.now(),
    })
  }
}

/**
 * Get metrics summary for a connector type (convenience).
 */
export function getConnectorMetrics(connectorType: string): ConnectorMetricsSummary {
  return telemetryStore.getSummary(connectorType)
}

/**
 * Get all telemetry records (for debugging / test assertions).
 */
export function getAllTelemetryRecords(): OperationTelemetry[] {
  return telemetryStore.getAllRecords()
}

/**
 * Clear telemetry store (for test cleanup).
 */
export function clearTelemetry(): void {
  telemetryStore.clear()
}