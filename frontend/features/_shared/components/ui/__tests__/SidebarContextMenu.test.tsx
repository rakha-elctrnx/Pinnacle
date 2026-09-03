// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { TreeNodeItem } from '../TreeNodeItem'
import type { TreeNode } from '../../types/shared'
import type { TreeNodeContextMenuMeta } from '../../types/shared'

type HandlerMock = Mock<
  (event: React.MouseEvent, meta: TreeNodeContextMenuMeta) => void
>

interface MountResult {
  container: HTMLElement
  handlers: Record<string, HandlerMock>
}

describe('Sidebar context menu — resolves the clicked node, not the active connection', () => {
  const nonActiveConnectionId = 'conn-2'
  const activeConnectionId = 'conn-1'

  function makeNode(type: string): TreeNode {
    const base = { connectionId: nonActiveConnectionId, databaseName: 'mydb' }
    switch (type) {
      case 'table':
        return {
          label: 'users',
          ...base,
          schemaName: 'public',
          nodeType: 'item',
        }
      case 'view':
        return {
          label: 'active_users',
          ...base,
          schemaName: 'public',
          nodeType: 'item',
        }
      case 'schema':
        return {
          label: 'public',
          ...base,
          schemaName: 'public',
          nodeType: 'schema',
          children: [],
        }
      case 'connection':
        return {
          label: 'conn-2',
          connectionId: nonActiveConnectionId,
          nodeType: 'connection',
          children: [],
        }
      case 'database':
        return {
          label: 'mydb',
          ...base,
          nodeType: 'database',
          children: [],
        }
      case 'tablesCategory':
        return {
          label: 'Tables',
          ...base,
          schemaName: 'public',
          nodeType: 'category',
          children: [],
        }
      case 'viewsCategory':
        return {
          label: 'Views',
          ...base,
          schemaName: 'public',
          nodeType: 'category',
          children: [],
        }
      case 'indicesCategory':
        return {
          label: 'Indices',
          connectionId: nonActiveConnectionId,
          nodeType: 'category',
          children: [],
        }
      case 'esIndex':
        return {
          label: 'products',
          connectionId: nonActiveConnectionId,
        }
      default:
        throw new Error(`unknown node fixture: ${type}`)
    }
  }

  function setupPath(type: string): { parentPath: string; depth: number } {
    switch (type) {
      case 'table':
        return {
          parentPath: `${nonActiveConnectionId}/mydb/public/Tables`,
          depth: 4,
        }
      case 'view':
        return {
          parentPath: `${nonActiveConnectionId}/mydb/public/Views`,
          depth: 4,
        }
      case 'schema':
        return { parentPath: `${nonActiveConnectionId}/mydb`, depth: 2 }
      case 'connection':
        return { parentPath: '', depth: 0 }
      case 'database':
        return { parentPath: nonActiveConnectionId, depth: 1 }
      case 'tablesCategory':
        return {
          parentPath: `${nonActiveConnectionId}/mydb/public`,
          depth: 3,
        }
      case 'viewsCategory':
        return {
          parentPath: `${nonActiveConnectionId}/mydb/public`,
          depth: 3,
        }
      case 'indicesCategory':
        return { parentPath: nonActiveConnectionId, depth: 1 }
      case 'esIndex':
        return {
          parentPath: `${nonActiveConnectionId}/Indices`,
          depth: 2,
        }
      default:
        return { parentPath: '', depth: 0 }
    }
  }

  const handlerNames = [
    'onTableNodeContextMenu',
    'onViewNodeContextMenu',
    'onDatabaseNodeContextMenu',
    'onSchemaNodeContextMenu',
    'onTablesCategoryContextMenu',
    'onIndexNodeContextMenu',
    'onConnectionContextMenu',
  ] as const

  function mount(type: string): MountResult {
    const node = makeNode(type)
    const { parentPath, depth } = setupPath(type)

    const handlers = Object.fromEntries(
      handlerNames.map((name) => [name, vi.fn()]),
    ) as Record<string, HandlerMock>

    const props = {
      node,
      depth,
      parentPath,
      selectedTreeNode: null,
      expandedTreePaths: [],
      onTreeNodeClick: vi.fn(),
      onSelectedTreeNode: vi.fn(),
      onToggleTreeNode: vi.fn(),
      onFetchDatabaseDetails: vi.fn(),
      onTableNavigate: vi.fn(),
      onQueryNavigate: vi.fn(),
      onTablesCategoryClick: vi.fn(),
      onConnectionSelect: vi.fn(),
      onGroupToggle: vi.fn(),
      onConnectionToggle: vi.fn(),
      focusedNodePath: null,
      setFocusedNodePath: vi.fn(),
      folders: [],
      onMoveConnectionToFolder: vi.fn(),
      ...handlers,
    }

    const { container } = render(<TreeNodeItem {...props} />)
    return { container, handlers }
  }

  function rightClick(container: HTMLElement, nodePath: string): void {
    const el = container.querySelector<HTMLElement>(
      `[data-node-path="${nodePath}"]`,
    )
    if (!el) throw new Error(`Expected node rendered at path "${nodePath}"`)
    fireEvent.contextMenu(el)
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it.each([
    [
      'table',
      'conn-2/mydb/public/Tables/users',
      'onTableNodeContextMenu',
      { tableName: 'users', schemaName: 'public' },
    ],
    [
      'view',
      'conn-2/mydb/public/Views/active_users',
      'onViewNodeContextMenu',
      { viewName: 'active_users', schemaName: 'public' },
    ],
    [
      'schema',
      'conn-2/mydb/public',
      'onSchemaNodeContextMenu',
      { schemaName: 'public', databaseName: 'mydb' },
    ],
    [
      'database',
      'conn-2/mydb',
      'onDatabaseNodeContextMenu',
      { databaseName: 'mydb' },
    ],
    [
      'connection',
      'conn-2',
      'onConnectionContextMenu',
      { connectionId: 'conn-2' },
    ],
    [
      'tablesCategory',
      'conn-2/mydb/public/Tables',
      'onTablesCategoryContextMenu',
      { categoryName: 'Tables', databaseName: 'mydb', schemaName: 'public' },
    ],
    [
      'viewsCategory',
      'conn-2/mydb/public/Views',
      'onTablesCategoryContextMenu',
      { categoryName: 'Views', databaseName: 'mydb', schemaName: 'public' },
    ],
    [
      'indicesCategory',
      'conn-2/Indices',
      'onTablesCategoryContextMenu',
      { categoryName: 'Indices' },
    ],
    [
      'esIndex',
      'conn-2/Indices/products',
      'onIndexNodeContextMenu',
      { indexName: 'products' },
    ],
  ] as const)(
    'right-clicking the %s node passes conn-2 (not conn-1) via meta',
    (type, path, handlerName, expected) => {
      const { container, handlers } = mount(type)
      rightClick(container, path)

      const handler = handlers[handlerName]
      expect(handler).toHaveBeenCalledTimes(1)
      const meta = handler.mock.calls[0][1] as TreeNodeContextMenuMeta

      expect(meta).toBeDefined()
      expect(meta.connectionId).toBe(nonActiveConnectionId)
      // The active/global connection must never leak into these callbacks.
      expect(meta.connectionId).not.toBe(activeConnectionId)
      // Deeper metadata for the clicked node is attached to the meta object.
      for (const [key, value] of Object.entries(expected)) {
        expect(meta[key as keyof TreeNodeContextMenuMeta]).toBe(value)
      }
    },
  )
})

describe('Sidebar context menu — foldered trees (Folder/Connection/Database/Schema/Tables)', () => {
  const folderPrefix = 'Production/conn-2'

  function folderedNode(type: string): TreeNode {
    switch (type) {
      case 'table':
        return {
          label: 'users',
          connectionId: 'conn-2',
          databaseName: 'mydb',
          schemaName: 'public',
          nodeType: 'item',
        }
      case 'schema':
        return {
          label: 'public',
          connectionId: 'conn-2',
          databaseName: 'mydb',
          schemaName: 'public',
          nodeType: 'schema',
          children: [],
        }
      case 'database':
        return {
          label: 'mydb',
          connectionId: 'conn-2',
          databaseName: 'mydb',
          nodeType: 'database',
          children: [],
        }
      case 'tablesCategory':
        return {
          label: 'Tables',
          connectionId: 'conn-2',
          databaseName: 'mydb',
          schemaName: 'public',
          nodeType: 'category',
          children: [],
        }
      default:
        throw new Error(`unknown foldered fixture: ${type}`)
    }
  }

  const cases: Array<{
    type: string
    parentPath: string
    depth: number
    path: string
    handler: string
    expected: Record<string, string>
  }> = [
    {
      type: 'database',
      parentPath: `${folderPrefix}`,
      depth: 1,
      path: `${folderPrefix}/mydb`,
      handler: 'onDatabaseNodeContextMenu',
      expected: { databaseName: 'mydb', connectionId: 'conn-2' },
    },
    {
      type: 'schema',
      parentPath: `${folderPrefix}/mydb`,
      depth: 2,
      path: `${folderPrefix}/mydb/public`,
      handler: 'onSchemaNodeContextMenu',
      expected: {
        databaseName: 'mydb',
        schemaName: 'public',
        connectionId: 'conn-2',
      },
    },
    {
      type: 'tablesCategory',
      parentPath: `${folderPrefix}/mydb/public`,
      depth: 3,
      path: `${folderPrefix}/mydb/public/Tables`,
      handler: 'onTablesCategoryContextMenu',
      expected: {
        databaseName: 'mydb',
        schemaName: 'public',
        categoryName: 'Tables',
        connectionId: 'conn-2',
      },
    },
    {
      type: 'table',
      parentPath: `${folderPrefix}/mydb/public/Tables`,
      depth: 4,
      path: `${folderPrefix}/mydb/public/Tables/users`,
      handler: 'onTableNodeContextMenu',
      expected: {
        databaseName: 'mydb',
        schemaName: 'public',
        tableName: 'users',
        connectionId: 'conn-2',
      },
    },
  ]

  it.each(cases)(
    'right-clicking the $type node inside a folder resolves Production/conn-2 metadata',
    ({ type, parentPath, depth, path, handler, expected }) => {
      const node = folderedNode(type)
      const handlers = {
        onTableNodeContextMenu: vi.fn(),
        onViewNodeContextMenu: vi.fn(),
        onDatabaseNodeContextMenu: vi.fn(),
        onSchemaNodeContextMenu: vi.fn(),
        onTablesCategoryContextMenu: vi.fn(),
        onIndexNodeContextMenu: vi.fn(),
        onConnectionContextMenu: vi.fn(),
      }
      const props = {
        node,
        depth,
        parentPath,
        selectedTreeNode: null,
        expandedTreePaths: [],
        onTreeNodeClick: vi.fn(),
        onSelectedTreeNode: vi.fn(),
        onToggleTreeNode: vi.fn(),
        onFetchDatabaseDetails: vi.fn(),
        onTableNavigate: vi.fn(),
        onQueryNavigate: vi.fn(),
        onTablesCategoryClick: vi.fn(),
        onConnectionSelect: vi.fn(),
        onGroupToggle: vi.fn(),
        onConnectionToggle: vi.fn(),
        focusedNodePath: null,
        setFocusedNodePath: vi.fn(),
        folders: [],
        onMoveConnectionToFolder: vi.fn(),
        ...handlers,
      }

      const { container } = render(<TreeNodeItem {...props} />)
      const el = container.querySelector<HTMLElement>(
        `[data-node-path="${path}"]`,
      )
      expect(el).toBeTruthy()
      fireEvent.contextMenu(el!)

      const handlerMock = handlers[handler as keyof typeof handlers] as Mock<
        (event: React.MouseEvent, meta: TreeNodeContextMenuMeta) => void
      >
      expect(handlerMock).toHaveBeenCalledTimes(1)
      const meta = handlerMock.mock.calls[0][1] as TreeNodeContextMenuMeta
      for (const [key, value] of Object.entries(expected)) {
        expect(meta[key as keyof TreeNodeContextMenuMeta]).toBe(value)
      }
    },
  )
})
