/**
 * Connection Management — domain service
 *
 * Pure logic for managing connection profiles: filtering, grouping,
 * recent connections, CRUD helpers, and status management.
 *
 * Phase 1: Extraction of connection-related logic from DataExplorerPage.
 */

import type { ConnectionProfile, Folder } from '../types/domain'
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
 * Legacy: Group connections by their first tag.
 * Use groupConnectionsByFolder instead for new folder-based grouping.
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
 * Group connections by folder. Returns a record keyed by folder name
 * for the unified tree builder. Connections without a folderId appear
 * under a special "UNGROUPED" key for top-level rendering.
 * Empty folders are included so they appear in the tree.
 */
export function groupConnectionsByFolder(
  connections: ConnectionProfile[],
  folders: Folder[],
): Record<string, ConnectionProfile[]> {
  const folderMap = new Map<string, string>()
  for (const f of folders) {
    folderMap.set(f.id, f.name)
  }

  const result: Record<string, ConnectionProfile[]> = {}

  // Pre-populate with all folders so empty folders are visible
  for (const f of folders) {
    result[f.name] = []
  }

  for (const conn of connections) {
    if (conn.folderId) {
      const folderName = folderMap.get(conn.folderId)
      if (folderName) {
        if (!result[folderName]) result[folderName] = []
        result[folderName].push(conn)
      } else {
        // Folder was deleted — treat as ungrouped
        if (!result['__ungrouped__']) result['__ungrouped__'] = []
        result['__ungrouped__'].push(conn)
      }
    } else {
      // Ungrouped — will be rendered as top-level connection nodes
      if (!result['__ungrouped__']) result['__ungrouped__'] = []
      result['__ungrouped__'].push(conn)
    }
  }

  return result
}

/**
 * One-time migration: for connections with no folderId but with a
 * tags[0] value, create a folder and assign the connection to it.
 * Returns the updated connections array (caller must persist).
 */
export function migrateGroupByTag(
  connections: ConnectionProfile[],
  existingFolders: Folder[],
): { connections: ConnectionProfile[]; folders: Folder[] } {
  const folders = [...existingFolders]
  const folderNameToId = new Map<string, string>()
  for (const f of folders) {
    folderNameToId.set(f.name, f.id)
  }

  const updated = connections.map((conn) => {
    if (conn.folderId) return conn // already migrated
    const groupName = conn.tags[0]
    if (!groupName) return conn // no tag, stays ungrouped

    // Find or create a folder matching this tag
    let folderId = folderNameToId.get(groupName)
    if (!folderId) {
      folderId = crypto.randomUUID()
      folders.push({ id: folderId, name: groupName })
      folderNameToId.set(groupName, folderId)
    }

    return { ...conn, folderId }
  })

  return { connections: updated, folders }
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
export function duplicateProfile(item: ConnectionProfile): ConnectionProfile {
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
