/**
 * Adapter layer — exports for all connector adapters.
 *
 * Phase 2: Exports the SQL and Elasticsearch adapter implementations
 * along with the adapter registry that maps connection types to
 * their runtime adapters.
 */

import type { ConnectorAdapter } from './adapter-types'
import { sqlAdapter } from './sql-adapter'
import { elasticAdapter } from './elastic-adapter'
import { mongodbAdapter } from './mongodb-adapter'
import { redisAdapter } from './redis-adapter'
import { rabbitmqAdapter } from './rabbitmq-adapter'
import { hasCapability, defaultConnectorRegistry } from '../registry'

export type { ConnectorAdapter } from './adapter-types'
export type {
  TestConnectionResult,
  NavigationTreeResult,
  EntityDetailResult,
  QueryExecutionResult,
} from './adapter-types'
export { sqlAdapter } from './sql-adapter'
export { elasticAdapter } from './elastic-adapter'
export { elasticAdapterHelpers } from './elastic-adapter'
export { mongodbAdapter } from './mongodb-adapter'
export { redisAdapter } from './redis-adapter'
export { rabbitmqAdapter } from './rabbitmq-adapter'

/**
 * Adapter registry — maps connection type strings to their runtime adapter.
 *
 * This is the extension point: add an entry here when a new connector type
 * gets a full adapter implementation.
 *
 * Phase 3: Added mongodb adapter.
 */
export const adapterRegistry: Record<string, ConnectorAdapter> = {
  postgresql: sqlAdapter,
  mysql: sqlAdapter,
  elasticsearch: elasticAdapter,
  mongodb: mongodbAdapter,
  redis: redisAdapter,
  rabbitmq: rabbitmqAdapter,
}

/**
 * Get the adapter for a given connection type.
 * Returns undefined if no adapter is registered for the type.
 */
export function getAdapter(type: string): ConnectorAdapter | undefined {
  return adapterRegistry[type]
}

/**
 * Check if a capability is supported AND an adapter is registered for the type.
 */
export function hasCapabilityWithAdapter(
  type: string,
  capability: import('../types').ConnectorCapability,
): boolean {
  return (
    hasCapability(defaultConnectorRegistry, type, capability) &&
    getAdapter(type) !== undefined
  )
}
