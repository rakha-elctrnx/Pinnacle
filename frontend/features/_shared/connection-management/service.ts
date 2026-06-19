/**
 * Connection Management — domain service
 *
 * Pure logic for managing connection profiles: filtering, grouping,
 * recent connections, CRUD helpers, and status management.
 *
 * Phase 1: Extraction of connection-related logic from DataExplorerPage.
 */

import type { ConnectionProfile } from '../types/domain'
import type { ConnectionStatus } from '../types/shared'

/**
 * Filter connections by search query (name, host, type, tags).
 */
export function filterConnections(
  items: ConnectionProfile[],
  search: string,
): ConnectionProfile[] {
  const q = search.toLowerCase()
  return items.filter((item) =>
    `${item.name} ${item.host} ${item.type} ${item.tags.join(' ')}`
      .toLowerCase()
      .includes(q),
  )
}

/**
 * Group connections by their first tag.
 */
export function groupConnectionsByTag(
  items: ConnectionProfile[],
): Record<string, ConnectionProfile[]> {
  return items.reduce<Record<string, ConnectionProfile[]>>((acc, item) => {
    const group = item.tags[0] || 'Ungrouped'
    acc[group] = acc[group] ? [...acc[group], item] : [item]
    return acc
  }, {})
}

/**
 * Get the most recently updated N connections.
 */
export function getRecentConnections(
  items: ConnectionProfile[],
  count = 5,
): ConnectionProfile[] {
  return [...items]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, count)
}

/**
 * Create a duplicate of a connection profile.
 */
export function duplicateProfile(
  item: ConnectionProfile,
): ConnectionProfile {
  const now = new Date().toISOString()
  return {
    ...item,
    id: crypto.randomUUID(),
    name: `${item.name} Copy`,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Build an export-safe copy of a connection profile (with redacted secrets).
 */
export function exportProfileSafe(
  item: ConnectionProfile,
): Record<string, unknown> {
  return {
    ...item,
    password: 'redacted',
    encryptedPasswordRef: 'redacted',
  }
}

/**
 * Get the status of a connection, defaulting to 'disconnected'.
 */
export function getConnectionStatus(
  statuses: Record<string, ConnectionStatus>,
  connectionId: string,
): ConnectionStatus {
  return statuses[connectionId] ?? 'disconnected'
}