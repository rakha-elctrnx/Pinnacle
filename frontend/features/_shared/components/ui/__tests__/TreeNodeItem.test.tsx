// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { act } from 'react'
import type { ComponentProps } from 'react'
import type { Mock } from 'vitest'
import { TreeNodeItem } from '../TreeNodeItem'
import type { TreeNode } from '../../types/shared'

/**
 * Behavioral interaction-contract tests for TreeNodeItem.
 *
 * Interaction surfaces:
 *   - Chevron `<button>`  -> expand/collapse toggle only (stopPropagation).
 *   - Row `onClick`       -> single click (select/focus), debounced ~200ms so a
 *                            following double click can override it.
 *   - Row `onDoubleClick` -> primary action (toggle expand / open detail tab).
 *   - Row `onKeyDown`     -> Enter === primary action, Space === select action.
 *
 * Contract per node class:
 *   Folder      : select=dbl/chev/Enter: primary=ent / Space=select
 *   Connection  : single=select(active) / dbl/chev/Enter=connect+toggle / Space=select
 *   DB/Schema   : single=select / dbl/chev/Enter=toggle / Space=select
 *   Category    : single=show list / dbl/chev/Enter=toggle / Space=show list
 *   Leaf item   : single=select ONLY / dbl/Enter=open detail once / Space=select ONLY
 */

const SELECT_DEBOUNCE_MS = 200

/** A child needs to exist for container nodes so the primary action routes to
 *  the toggle handler (a zero-child node is treated as a leaf item). */
const CHILD: TreeNode = { label: 'child', nodeType: 'item', children: [] }

function row(): HTMLElement {
  const treeItem = screen.getByRole('treeitem')
  return treeItem.firstElementChild as HTMLElement
}

function chevron(): HTMLButtonElement {
  // The chevron is the only <button> rendered for non-renaming nodes.
  return screen
    .getByRole('treeitem')
    .querySelector('button') as HTMLButtonElement
}

/** Mount a single-root tree and return typed mocks for every interaction
 *  callback. `overrides` may carry extra TreeNodeItem props (parentPath, depth,
 *  expandedTreePaths, nodes…). */
function mount(
  node: TreeNode,
  overrides: Partial<Record<string, unknown>> = {},
) {
  const handlers: Record<string, Mock> = {
    onTreeNodeClick: vi.fn(),
    onSelectedTreeNode: vi.fn(),
    onToggleTreeNode: vi.fn(),
    onFetchDatabaseDetails: vi.fn(),
    onGroupToggle: vi.fn(),
    onConnectionSelect: vi.fn(),
    onConnectionToggle: vi.fn(),
    onTablesCategoryClick: vi.fn(),
    onQueryNavigate: vi.fn(),
    setFocusedNodePath: vi.fn(),
  }
  const props = {
    node,
    depth: 0,
    parentPath: '',
    selectedTreeNode: null,
    expandedTreePaths: [],
    focusedNodePath: null,
    folders: [],
    groupedConnections: {},
    explorerData: {},
    elasticIndicesError: {},
    elasticLoading: {},
    onTreeNodeClick: handlers.onTreeNodeClick,
    onSelectedTreeNode: handlers.onSelectedTreeNode,
    onToggleTreeNode: handlers.onToggleTreeNode,
    onFetchDatabaseDetails: handlers.onFetchDatabaseDetails,
    onGroupToggle: handlers.onGroupToggle,
    onConnectionSelect: handlers.onConnectionSelect,
    onConnectionToggle: handlers.onConnectionToggle,
    onTablesCategoryClick: handlers.onTablesCategoryClick,
    onQueryNavigate: handlers.onQueryNavigate,
    setFocusedNodePath: handlers.setFocusedNodePath,
    ...overrides,
    // TreeNodeItem declares its props as an inline (unexported) object literal,
    // so it cannot be imported by name; this structurally-identical object is
    // passed across the component boundary via its own ComponentProps type.
  } as unknown as ComponentProps<typeof TreeNodeItem>

  render(<TreeNodeItem {...props} />)
  return handlers
}

/** Fire a real single row click and flush the 200ms select debounce. */
function clickRowOnce(): void {
  act(() => {
    fireEvent.click(row())
    vi.advanceTimersByTime(SELECT_DEBOUNCE_MS)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('TreeNodeItem — Folder (group) node', () => {
  const folderNode: TreeNode = {
    label: 'Production',
    nodeType: 'group',
    children: [CHILD],
  }

  it('single click selects the folder without toggling expansion', () => {
    const h = mount(folderNode)
    clickRowOnce()
    expect(h.onSelectedTreeNode).toHaveBeenCalledWith('Production')
    expect(h.onGroupToggle).not.toHaveBeenCalled()
    expect(h.onToggleTreeNode).not.toHaveBeenCalled()
  })

  it('double click toggles expand (onGroupToggle)', () => {
    const h = mount(folderNode)
    act(() => fireEvent.doubleClick(row()))
    expect(h.onGroupToggle).toHaveBeenCalledWith('Production')
    // Double click replaces the pending select — must NOT select.
    expect(h.onSelectedTreeNode).not.toHaveBeenCalled()
  })

  it('chevron click toggles expand (onGroupToggle)', () => {
    const h = mount(folderNode)
    act(() => fireEvent.click(chevron()))
    expect(h.onGroupToggle).toHaveBeenCalledWith('Production')
    expect(h.onSelectedTreeNode).not.toHaveBeenCalled()
  })

  it('Enter toggles expand (onGroupToggle)', () => {
    const h = mount(folderNode)
    act(() => fireEvent.keyDown(row(), { key: 'Enter' }))
    expect(h.onGroupToggle).toHaveBeenCalledWith('Production')
    expect(h.onSelectedTreeNode).not.toHaveBeenCalled()
  })

  it('Space selects the folder (onSelectedTreeNode)', () => {
    const h = mount(folderNode)
    act(() => fireEvent.keyDown(row(), { key: ' ' }))
    expect(h.onSelectedTreeNode).toHaveBeenCalledWith('Production')
    expect(h.onGroupToggle).not.toHaveBeenCalled()
  })
})

describe('TreeNodeItem — connection node', () => {
  const connectionNode: TreeNode = {
    label: 'Test Postgres DB',
    nodeType: 'connection',
    connectionId: 'conn-1',
    children: [CHILD],
  }

  it('single click makes the connection active (select + connect) without expanding', () => {
    const h = mount(connectionNode)
    clickRowOnce()
    expect(h.onSelectedTreeNode).toHaveBeenCalledWith('Test Postgres DB')
    expect(h.onConnectionSelect).toHaveBeenCalledWith(
      'Test Postgres DB',
      'conn-1',
    )
    expect(h.onConnectionToggle).not.toHaveBeenCalled()
  })

  it('double click connects + expands (onConnectionToggle)', () => {
    const h = mount(connectionNode)
    act(() => fireEvent.doubleClick(row()))
    expect(h.onConnectionToggle).toHaveBeenCalledWith(
      'Test Postgres DB',
      'conn-1',
    )
  })

  it('chevron click toggles connect + expand (onConnectionToggle)', () => {
    const h = mount(connectionNode)
    act(() => fireEvent.click(chevron()))
    expect(h.onConnectionToggle).toHaveBeenCalledWith(
      'Test Postgres DB',
      'conn-1',
    )
    expect(h.onSelectedTreeNode).not.toHaveBeenCalled()
  })

  it('Enter opens + connects (onConnectionToggle)', () => {
    const h = mount(connectionNode)
    act(() => fireEvent.keyDown(row(), { key: 'Enter' }))
    expect(h.onConnectionToggle).toHaveBeenCalledWith(
      'Test Postgres DB',
      'conn-1',
    )
    expect(h.onSelectedTreeNode).not.toHaveBeenCalled()
  })

  it('Space makes the connection active (onConnectionSelect)', () => {
    const h = mount(connectionNode)
    act(() => fireEvent.keyDown(row(), { key: ' ' }))
    expect(h.onConnectionSelect).toHaveBeenCalledWith(
      'Test Postgres DB',
      'conn-1',
    )
    expect(h.onSelectedTreeNode).toHaveBeenCalledWith('Test Postgres DB')
    expect(h.onConnectionToggle).not.toHaveBeenCalled()
  })
})

describe('TreeNodeItem — database / schema node', () => {
  const dbNode: TreeNode = {
    label: 'appdb',
    nodeType: 'database',
    databaseName: 'appdb',
    children: [CHILD],
  }

  it('single click selects the node without toggling/fetching', () => {
    const h = mount(dbNode)
    clickRowOnce()
    expect(h.onSelectedTreeNode).toHaveBeenCalledWith('appdb')
    expect(h.onToggleTreeNode).not.toHaveBeenCalled()
    expect(h.onFetchDatabaseDetails).not.toHaveBeenCalled()
  })

  it('double click toggles expand + fetches details', () => {
    const h = mount(dbNode)
    act(() => fireEvent.doubleClick(row()))
    expect(h.onToggleTreeNode).toHaveBeenCalledWith('appdb')
    expect(h.onFetchDatabaseDetails).toHaveBeenCalledWith('appdb')
  })

  it('chevron click toggles expand + fetches details', () => {
    const h = mount(dbNode)
    act(() => fireEvent.click(chevron()))
    expect(h.onToggleTreeNode).toHaveBeenCalledWith('appdb')
    expect(h.onFetchDatabaseDetails).toHaveBeenCalledWith('appdb')
  })

  it('Enter toggles expand (onToggleTreeNode)', () => {
    const h = mount(dbNode)
    act(() => fireEvent.keyDown(row(), { key: 'Enter' }))
    expect(h.onToggleTreeNode).toHaveBeenCalledWith('appdb')
    expect(h.onSelectedTreeNode).not.toHaveBeenCalled()
  })

  it('Space selects the node (onSelectedTreeNode)', () => {
    const h = mount(dbNode)
    act(() => fireEvent.keyDown(row(), { key: ' ' }))
    expect(h.onSelectedTreeNode).toHaveBeenCalledWith('appdb')
    expect(h.onToggleTreeNode).not.toHaveBeenCalled()
  })

  it('double click on a schema node toggles expand without a detail fetch', () => {
    const schemaNode: TreeNode = {
      label: 'public',
      databaseName: 'appdb',
      children: [CHILD],
    }
    const h = mount(schemaNode, { depth: 2, parentPath: 'conn/appdb' })
    act(() => fireEvent.doubleClick(row()))
    expect(h.onToggleTreeNode).toHaveBeenCalledWith('conn/appdb/public')
    expect(h.onFetchDatabaseDetails).not.toHaveBeenCalled()
  })
})

describe('TreeNodeItem — Tables category node', () => {
  const categoryNode: TreeNode = {
    label: 'Tables',
    nodeType: 'category',
    databaseName: 'appdb',
    children: [CHILD],
  }

  it('single click shows the list view (onTablesCategoryClick + tab)', () => {
    const h = mount(categoryNode, { parentPath: 'conn/appdb' })
    clickRowOnce()
    expect(h.onSelectedTreeNode).toHaveBeenCalledWith('conn/appdb/Tables')
    expect(h.onTreeNodeClick).toHaveBeenCalled()
    expect(h.onTablesCategoryClick).toHaveBeenCalled()
    expect(h.onToggleTreeNode).not.toHaveBeenCalled()
  })

  it('double click toggles expand (onToggleTreeNode) without showing the list', () => {
    const h = mount(categoryNode, { parentPath: 'conn/appdb' })
    act(() => fireEvent.doubleClick(row()))
    expect(h.onToggleTreeNode).toHaveBeenCalledWith('conn/appdb/Tables')
    expect(h.onTreeNodeClick).not.toHaveBeenCalled()
    expect(h.onTablesCategoryClick).not.toHaveBeenCalled()
  })

  it('chevron click toggles expand (onToggleTreeNode)', () => {
    const h = mount(categoryNode, { parentPath: 'conn/appdb' })
    act(() => fireEvent.click(chevron()))
    expect(h.onToggleTreeNode).toHaveBeenCalledWith('conn/appdb/Tables')
    expect(h.onTreeNodeClick).not.toHaveBeenCalled()
  })

  it('Enter toggles expand (onToggleTreeNode)', () => {
    const h = mount(categoryNode, { parentPath: 'conn/appdb' })
    act(() => fireEvent.keyDown(row(), { key: 'Enter' }))
    expect(h.onToggleTreeNode).toHaveBeenCalledWith('conn/appdb/Tables')
    expect(h.onTreeNodeClick).not.toHaveBeenCalled()
  })

  it('Space shows the list view (onSelectedTreeNode + onTreeNodeClick)', () => {
    const h = mount(categoryNode, { parentPath: 'conn/appdb' })
    act(() => fireEvent.keyDown(row(), { key: ' ' }))
    expect(h.onSelectedTreeNode).toHaveBeenCalledWith('conn/appdb/Tables')
    expect(h.onTreeNodeClick).toHaveBeenCalled()
    expect(h.onTablesCategoryClick).toHaveBeenCalled()
    expect(h.onToggleTreeNode).not.toHaveBeenCalled()
  })
})

describe('TreeNodeItem — leaf table / view / index node', () => {
  const tableNode: TreeNode = {
    label: 'users',
    nodeType: 'item',
    databaseName: 'appdb',
    children: [],
  }
  const parentPath = 'conn/appdb/Tables'

  it('single click only selects — never opens a tab', () => {
    const h = mount(tableNode, { parentPath })
    clickRowOnce()
    expect(h.onSelectedTreeNode).toHaveBeenCalledWith(parentPath + '/users')
    expect(h.onTreeNodeClick).not.toHaveBeenCalled()
    expect(h.onToggleTreeNode).not.toHaveBeenCalled()
  })

  it('double click opens the detail tab exactly once (onTreeNodeClick)', () => {
    const h = mount(tableNode, { parentPath })
    act(() => fireEvent.doubleClick(row()))
    expect(h.onTreeNodeClick).toHaveBeenCalledTimes(1)
    expect(h.onToggleTreeNode).not.toHaveBeenCalled()
  })

  it('Enter opens the detail tab exactly once (onTreeNodeClick)', () => {
    const h = mount(tableNode, { parentPath })
    act(() => fireEvent.keyDown(row(), { key: 'Enter' }))
    expect(h.onTreeNodeClick).toHaveBeenCalledTimes(1)
    expect(h.onSelectedTreeNode).not.toHaveBeenCalled()
  })

  it('Space only selects the leaf — never opens a tab', () => {
    const h = mount(tableNode, { parentPath })
    act(() => fireEvent.keyDown(row(), { key: ' ' }))
    expect(h.onSelectedTreeNode).toHaveBeenCalledWith(parentPath + '/users')
    expect(h.onTreeNodeClick).not.toHaveBeenCalled()
    expect(h.onToggleTreeNode).not.toHaveBeenCalled()
  })
})