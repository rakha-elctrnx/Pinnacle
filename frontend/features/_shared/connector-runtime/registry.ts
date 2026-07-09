/**
 * Connector Registry — default implementation
 *
 * Maps connection type strings to their capability descriptors.
 * This is the SINGLE extension point for adding new connector types.
 *
 * To add a new connector:
 *   1. Add an entry in this registry with its capabilities.
 *   2. Implement the capability contract in a domain module.
 *   3. Import and register at app bootstrap (future phase).
 *
 * Phase 1: Static registry with known connector types.
 */

import type { ConnectorRegistry, ConnectorCapabilityInterface } from './types'

/** Built-in capabilities for SQL connectors (PostgreSQL, MySQL). */
const SQL_CAPABILITIES: ConnectorCapabilityInterface = {
  label: 'SQL Database',
  capabilities: [
    'connect',
    'test-connection',
    'load-navigation-tree',
    'open-entity',
    'run-query',
    'map-error',
    'get-default-context',
    'observability',
  ],
}

/** Built-in capabilities for Elasticsearch. */
const ELASTICSEARCH_CAPABILITIES: ConnectorCapabilityInterface = {
  label: 'Elasticsearch',
  capabilities: [
    'connect',
    'test-connection',
    'load-navigation-tree',
    'open-entity',
    'run-query',
    'map-error',
    'get-default-context',
    'observability',
  ],
}

/** Redis — minimal capabilities for Phase 3. */
const REDIS_CAPABILITIES: ConnectorCapabilityInterface = {
  label: 'Redis',
  capabilities: ['connect', 'test-connection'],
}

/** RabbitMQ — minimal capabilities for Phase 3. */
const RABBITMQ_CAPABILITIES: ConnectorCapabilityInterface = {
  label: 'RabbitMQ',
  capabilities: ['connect', 'test-connection'],
}

/** MongoDB — progressive capabilities for Phase 3. */
const MONGODB_CAPABILITIES: ConnectorCapabilityInterface = {
  label: 'MongoDB',
  capabilities: [
    'connect',
    'test-connection',
    'load-navigation-tree',
    'open-entity',
    'run-query',
    'get-default-context',
  ],
}

/**
 * Default connector registry.
 *
 * All connector type lookups should go through this registry
 * rather than raw string matching on `connection.type`.
 */
export const defaultConnectorRegistry: ConnectorRegistry = {
  postgresql: SQL_CAPABILITIES,
  mysql: SQL_CAPABILITIES,
  elasticsearch: ELASTICSEARCH_CAPABILITIES,
  redis: REDIS_CAPABILITIES,
  rabbitmq: RABBITMQ_CAPABILITIES,
  mongodb: MONGODB_CAPABILITIES,
}

/**
 * Look up the capability interface for a given connection type.
 * Returns a minimal fallback for unknown types so consumers
 * don't need to null-check everywhere.
 */
export function getConnectorCapabilities(
  registry: ConnectorRegistry,
  type: string,
): ConnectorCapabilityInterface {
  return (
    registry[type] ?? {
      label: type,
      capabilities: [],
    }
  )
}

/**
 * Check whether a connector type supports a given capability.
 * Replaces ad-hoc `if (conn.type === 'postgresql' || conn.type === 'mysql')` patterns.
 */
export function hasCapability(
  registry: ConnectorRegistry,
  type: string,
  capability: import('./types').ConnectorCapability,
): boolean {
  return getConnectorCapabilities(registry, type).capabilities.includes(
    capability,
  )
}
