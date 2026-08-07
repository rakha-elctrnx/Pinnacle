// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { TreeNodeItem } from '../TreeNodeItem'
import type { TreeNode } from '../../types/shared'
import type { TreeNodeContextMenuMeta } from '../../types/shared'

type HandlerMock = Mock<(event: React.MouseEvent, meta: TreeNodeContextMenuMeta) => void>

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
          nodeType: 'item',
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
      case 'database':
        return { parentPath: nonActiveConnectionId, depth: 1 }
      case 'tablesCategory':
        return {
          parentPath: `${nonActiveConnectionId}/mydb/public`,
          depth: 3,
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
      'tablesCategory',
      'conn-2/mydb/public/Tables',
      'onTablesCategoryContextMenu',
      { categoryName: 'Tables', databaseName: 'mydb', schemaName: 'public' },
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