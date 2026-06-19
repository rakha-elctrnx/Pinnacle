/**
 * Connector Runtime — capability contract & registry types
 *
 * Defines the extension point for all database/connector modules.
 * Each connector type implements this contract to provide a uniform
 * interface for the page orchestrator and domain services.
 *
 * Phase 1: Minimal contract — only what's needed to decouple page-level
 * branching logic from the runtime.
 *
 * Phase 3: Added observability capability for telemetry hooks.
 */

/** The list of capabilities a connector MAY support. Progressive capability is allowed. */
export type ConnectorCapability =
  | 'connect'
  | 'test-connection'
  | 'load-navigation-tree'
  | 'open-entity'
  | 'run-query'
  | 'map-error'
  | 'get-default-context'
  /** Phase 3: observability telemetry hooks. */
  | 'observability'

/** Runtime descriptor returned by the registry for a given connection type. */
export interface ConnectorDescriptor {
  type: string
  label: string
  capabilities: ConnectorCapability[]
}

/**
 * Minimal capability interface.
 *
 * In Phase 1 we only define the shape; concrete implementations
 * will be migrated in later phases. For now the registry maps
 * connection types to static descriptors.
 */
export interface ConnectorCapabilityInterface {
  /** Human-readable label for UI display. */
  label: string
  /** The set of capabilities this connector supports. */
  capabilities: ConnectorCapability[]
}

/**
 * Registry maps connection type strings → descriptor.
 * Consumer code asks the registry "what capabilities does type X have?"
 * instead of branching on type strings directly.
 */
export type ConnectorRegistry = Record<string, ConnectorCapabilityInterface>