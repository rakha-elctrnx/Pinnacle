/**
 * Explorer Tree — domain service
 *
 * Responsible for building tree node structures from raw tree data,
 * resolving database/schema context for table clicks, and providing
 * helpers that were previously inline in the page or hook.
 *
 * Phase 1: Extraction of tree-related logic from useExplorerData
 * and DataExplorerPage into a dedicated domain service.
 */

import type { ConnectionProfile } from '../../../../types/domain'
import type { ExplorerTreeData, TreeNode } from '../../types'

/** Resolve the database and schema containing a given table name. */
export function resolveTableContext(
  treeData: ExplorerTreeData,
  connectionType: string,
  tableName: string,
): { database: string; schema: string } | null {
  for (const db of treeData.databases) {
    if (connectionType === 'postgresql') {
      for (const schema of db.schemas) {
        if (schema.tables.includes(tableName)) {
          return { database: db.name, schema: schema.name }
        }
      }
    } else if (connectionType === 'mysql') {
      const allTables = db.schemas[0]?.tables ?? []
      if (allTables.includes(tableName)) {
        return { database: db.name, schema: db.name }
      }
    }
  }
  return null
}

/**
 * Build tree nodes for a connection.
 * Pure function — no side effects, no state dependencies.
 */
export function buildTreeNodes(
  treeData: ExplorerTreeData,
  conn: ConnectionProfile,
): TreeNode[] {
  return treeData.databases.map((db) => {
    if (!db.loaded) {
      return { label: db.name }
    }

    if (conn.type === 'postgresql') {
      return {
        label: db.name,
        children: db.schemas.map((schema) => ({
          label: schema.name,
          children: [
            ...(schema.tables.length > 0
              ? [{ label: 'Tables', children: schema.tables.map((t) => ({ label: t })) }]
              : []),
            ...(schema.views.length > 0
              ? [{ label: 'Views', children: schema.views.map((v) => ({ label: v })) }]
              : []),
            ...(schema.functions.length > 0
              ? [{ label: 'Functions', children: schema.functions.map((f) => ({ label: f })) }]
              : []),
            { label: 'Queries', children: [] },
          ],
        })),
      }
    }

    if (conn.type === 'mysql') {
      const allTables = db.schemas[0]?.tables ?? []
      return {
        label: db.name,
        children: [
          ...(allTables.length > 0
            ? [{ label: 'Tables', children: allTables.map((t) => ({ label: t })) }]
            : []),
          { label: 'Views', children: [] },
          { label: 'Functions', children: [] },
          { label: 'Queries', children: [] },
        ],
      }
    }

    return { label: db.name }
  })
}

/**
 * Get all flat table names from tree data (for quick lookup).
 */
export function getFlatTableList(treeData: ExplorerTreeData): string[] {
  return treeData.databases.flatMap((db) => db.schemas.flatMap((s) => s.tables))
}

/**
 * Check if a node label matches a known table in the tree.
 */
export function isTableNode(
  treeData: ExplorerTreeData,
  label: string,
): boolean {
  return getFlatTableList(treeData).includes(label)
}