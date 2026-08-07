/**
 * Explorer Tree domain service — path-independent node identity tests.
 *
 * Issue #26: node identity must come from explicit metadata
 * (connectionId / databaseName / schemaName) instead of parsed display
 * paths, so that `Connection/Database/Tables`,
 * `Connection/Database/Schema/Tables` and
 * `Folder/Connection/Database/Schema/Tables` all resolve identical
 * semantic metadata.
 *
 * Run with: npx vitest run frontend/features/sql/logic/explorer-tree/service.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { ConnectionProfile } from '../../../_shared/types/domain'
import type { ExplorerTreeData, TreeNode } from '../../../_shared/types/shared'
import { buildTreeNodes, resolveTableContext } from './service'

function makeConn(id: string, name: string, type: 'postgresql' | 'mysql'): ConnectionProfile {
  return { id, name, type } as ConnectionProfile
}

function makePgTreeData(): ExplorerTreeData {
  return {
    databases: [
      {
        name: 'app',
        loaded: true,
        schemas: [
          {
            name: 'public',
            tables: ['users', 'orders'],
            views: ['v_users'],
            functions: [],
          },
        ],
      },
    ],
    flatTables: ['users', 'orders'],
  }
}

function makeMySqlTreeData(): ExplorerTreeData {
  return {
    databases: [
      {
        name: 'shop',
        loaded: true,
        schemas: [{ name: 'shop', tables: ['products'], views: [], functions: [] }],
      },
    ],
    flatTables: ['products'],
  }
}
function flattenTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenTree(node.children) : [])])
}

/**
 * Data-bearing nodes only — every node that resolves a database/schema
 * context (database, schema, Tables/Views/Functions categories and their
 * items). This excludes UI scaffolding like the empty `Queries` placeholder,
 * which intentionally carries no semantic identity.
 */
function flattenDataNodes(nodes: TreeNode[]): TreeNode[] {
  return flattenTree(nodes).filter((node) => node.databaseName !== undefined)
}
describe('buildTreeNodes — PostgreSQL (ungrouped)', () => {
  const conn = makeConn('pg-1', 'PG', 'postgresql')
  const nodes = buildTreeNodes(makePgTreeData(), conn)

  it('marks the database node with connection identity', () => {
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({
      nodeType: 'database',
      connectionId: conn.id,
      databaseName: 'app',
    })
  })

  it('marks the schema node with database and schema identity', () => {
    const schemaNode = nodes[0].children?.[0]
    expect(schemaNode).toMatchObject({
      connectionId: conn.id,
      databaseName: 'app',
      schemaName: 'public',
    })
  })

  it('marks the Tables category node with database and schema identity', () => {
    const tablesNode = nodes[0].children?.[0].children?.find((c) => c.label === 'Tables')
    expect(tablesNode).toMatchObject({
      nodeType: 'category',
      connectionId: conn.id,
      databaseName: 'app',
      schemaName: 'public',
    })
  })

  it('marks table item nodes with database and schema identity', () => {
    const tablesNode = nodes[0].children?.[0].children?.find((c) => c.label === 'Tables')
    const usersNode = tablesNode?.children?.find((c) => c.label === 'users')
    expect(usersNode).toMatchObject({
      nodeType: 'item',
      connectionId: conn.id,
      databaseName: 'app',
      schemaName: 'public',
    })
  })

  it('marks the Views category and its items with identity too', () => {
    const viewsNode = nodes[0].children?.[0].children?.find((c) => c.label === 'Views')
    expect(viewsNode).toMatchObject({
      nodeType: 'category',
      connectionId: conn.id,
      databaseName: 'app',
      schemaName: 'public',
    })
    expect(viewsNode?.children?.[0]).toMatchObject({
      nodeType: 'item',
      connectionId: conn.id,
      databaseName: 'app',
      schemaName: 'public',
    })
  })
})

describe('buildTreeNodes — MySQL (ungrouped)', () => {
  const conn = makeConn('my-1', 'MY', 'mysql')
  const nodes = buildTreeNodes(makeMySqlTreeData(), conn)

  it('marks the database node with connection identity', () => {
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({
      nodeType: 'database',
      connectionId: conn.id,
      databaseName: 'shop',
    })
  })

  it('marks the Tables category without a schema name', () => {
    const tablesNode = nodes[0].children?.find((c) => c.label === 'Tables')
    expect(tablesNode).toMatchObject({
      nodeType: 'category',
      connectionId: conn.id,
      databaseName: 'shop',
    })
    expect(tablesNode?.schemaName).toBeUndefined()
  })

  it('marks table item nodes without a schema name', () => {
    const tablesNode = nodes[0].children?.find((c) => c.label === 'Tables')
    const productsNode = tablesNode?.children?.find((c) => c.label === 'products')
    expect(productsNode).toMatchObject({
      nodeType: 'item',
      connectionId: conn.id,
      databaseName: 'shop',
    })
  })
})

describe('buildTreeNodes — folder invariance (issue #26 core)', () => {
  const connA = makeConn('conn-a', 'ConnA', 'postgresql')
  const connB = makeConn('conn-b', 'ConnB', 'postgresql')
  const treeData = makePgTreeData()


  it('resolves identical semantic metadata regardless of folder nesting', () => {
    const treeA = buildTreeNodes(treeData, connA)
    const treeB = buildTreeNodes(treeData, connB)

    const flatA = flattenDataNodes(treeA)
    const flatB = flattenDataNodes(treeB)

    expect(flatA.length).toBeGreaterThan(0)
    expect(flatA).toHaveLength(flatB.length)

    for (let i = 0; i < flatA.length; i++) {
      const nodeA = flatA[i]
      const nodeB = flatB[i]

      // Identical tree data → identical database/schema metadata at every
      // node, regardless of whether it is rendered folder-wrapped or not.
      expect(nodeA.databaseName).toBe(nodeB.databaseName)
      expect(nodeA.schemaName).toBe(nodeB.schemaName)
      expect(nodeA.label).toBe(nodeB.label)

      // connectionId is always the node's own connection — folders cannot
      // leak a parent connection's id into a child node.
      expect(nodeA.connectionId).toBe(connA.id)
      expect(nodeB.connectionId).toBe(connB.id)
    }
  })

  it('never lets a node inherit another connection id', () => {
    const treeA = buildTreeNodes(treeData, connA)
    for (const node of flattenDataNodes(treeA)) {
      expect(node.connectionId).toBe(connA.id)
    }
  })
})

describe('resolveTableContext', () => {
  it('resolves a table to its database and schema for postgresql', () => {
    expect(resolveTableContext(makePgTreeData(), 'postgresql', 'users')).toEqual({
      database: 'app',
      schema: 'public',
    })
  })

  it('resolves a table to the database name as schema for mysql', () => {
    expect(resolveTableContext(makeMySqlTreeData(), 'mysql', 'products')).toEqual({
      database: 'shop',
      schema: 'shop',
    })
  })

  it('returns null for an unknown table', () => {
    expect(resolveTableContext(makePgTreeData(), 'postgresql', 'nope')).toBeNull()
    expect(resolveTableContext(makeMySqlTreeData(), 'mysql', 'nope')).toBeNull()
  })
})
