/**
 * Connector Runtime — barrel export
 *
 * Re-exports types, registry helpers, adapter layer, and observability
 * for a single import point.
 *
 * Phase 3: Added observability exports.
 */
export * from './types'
export * from './registry'
export * from './error-norm'
export * from './observability'
export * from './contract-test'
export {
  adapterRegistry,
  getAdapter,
  hasCapabilityWithAdapter,
  sqlAdapter,
  elasticAdapter,
  elasticAdapterHelpers,
  mongodbAdapter,
} from './adapters'
export type { ConnectorAdapter } from './adapters'
