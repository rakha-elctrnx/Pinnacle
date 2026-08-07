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

import type { ConnectionProfile } from '../../../_shared/types/domain'
import type { ExplorerTreeData, TreeNode } from '../../../_shared/types/shared'

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
  return treeData.databases.map((db): TreeNode => {
    if (!db.loaded) {
      return {
        label: db.name,
        nodeType: 'database',
        connectionId: conn.id,
        databaseName: db.name,
      }
    }

    if (conn.type === 'postgresql') {
      const schemaChildren = db.schemas.map((schema): TreeNode => {
        const categoryChildren: TreeNode[] = []

        if (schema.tables.length > 0) {
          categoryChildren.push({
            label: 'Tables',
            nodeType: 'category',
            connectionId: conn.id,
            databaseName: db.name,
            schemaName: schema.name,
            children: schema.tables.map(
              (t): TreeNode => ({
                label: t,
                nodeType: 'item',
                connectionId: conn.id,
                databaseName: db.name,
                schemaName: schema.name,
              }),
            ),
          })
        }

        if (schema.views.length > 0) {
          categoryChildren.push({
            label: 'Views',
            nodeType: 'category',
            connectionId: conn.id,
            databaseName: db.name,
            schemaName: schema.name,
            children: schema.views.map(
              (v): TreeNode => ({
                label: v,
                nodeType: 'item',
                connectionId: conn.id,
                databaseName: db.name,
                schemaName: schema.name,
              }),
            ),
          })
        }

        if (schema.functions.length > 0) {
          categoryChildren.push({
            label: 'Functions',
            nodeType: 'category',
            connectionId: conn.id,
            databaseName: db.name,
            schemaName: schema.name,
            children: schema.functions.map(
              (f): TreeNode => ({
                label: f,
                nodeType: 'item',
                connectionId: conn.id,
                databaseName: db.name,
                schemaName: schema.name,
              }),
            ),
          })
        }

        categoryChildren.push({ label: 'Queries', children: [] })

        return {
          label: schema.name,
          connectionId: conn.id,
          databaseName: db.name,
          schemaName: schema.name,
          children: categoryChildren,
        }
      })

      return {
        label: db.name,
        nodeType: 'database',
        connectionId: conn.id,
        databaseName: db.name,
        children: schemaChildren,
      }
    }

    if (conn.type === 'mysql') {
      const allTables = db.schemas[0]?.tables ?? []
      const allViews = db.schemas[0]?.views ?? []

      const categoryChildren: TreeNode[] = []

      if (allTables.length > 0) {
        categoryChildren.push({
          label: 'Tables',
          nodeType: 'category',
          connectionId: conn.id,
          databaseName: db.name,
          children: allTables.map(
            (t): TreeNode => ({
              label: t,
              nodeType: 'item',
              connectionId: conn.id,
              databaseName: db.name,
            }),
          ),
        })
      }

      if (allViews.length > 0) {
        categoryChildren.push({
          label: 'Views',
          nodeType: 'category',
          connectionId: conn.id,
          databaseName: db.name,
          children: allViews.map(
            (v): TreeNode => ({
              label: v,
              nodeType: 'item',
              connectionId: conn.id,
              databaseName: db.name,
            }),
          ),
        })
      }

      categoryChildren.push({
        label: 'Functions',
        nodeType: 'category',
        connectionId: conn.id,
        databaseName: db.name,
        children: [],
      })
      categoryChildren.push({ label: 'Queries', children: [] })

      return {
        label: db.name,
        nodeType: 'database',
        connectionId: conn.id,
        databaseName: db.name,
        children: categoryChildren,
      }
    }

    return {
      label: db.name,
      nodeType: 'database',
      connectionId: conn.id,
      databaseName: db.name,
    }
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
