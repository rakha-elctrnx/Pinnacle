// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { TreeNodeItem } from '../TreeNodeItem'
import type { TreeNode } from '../../../types/shared'

describe('TreeNodeItem connection drag & threshold interaction tests', () => {
  const connectionNode: TreeNode = {
    label: 'Test Postgres DB',
    nodeType: 'connection',
    connectionId: 'conn-1',
    children: [],
  }

  const mockProps = {
    node: connectionNode,
    depth: 0,
    parentPath: '',
    selectedTreeNode: null,
    expandedTreePaths: [],
    onTreeNodeClick: vi.fn(),
    onSelectedTreeNode: vi.fn(),
    onToggleTreeNode: vi.fn(),
    onConnectionSelect: vi.fn(),
    onConnectionToggle: vi.fn(),
    setFocusedNodePath: vi.fn(),
    onMoveConnectionToFolder: vi.fn(),
    folders: [{ id: 'folder-1', name: 'Production' }],
  }
  beforeEach(() => {
    vi.clearAllMocks()
    document.elementFromPoint = vi.fn().mockReturnValue(null)
    delete document.body.dataset.dragging
    delete document.body.dataset.draggedConnectionId
  })

  afterEach(() => {
    cleanup()
    delete document.body.dataset.dragging
    delete document.body.dataset.draggedConnectionId
  })

  it('does not create drag ghost or start dragging on press/release without movement', async () => {
    const { getByRole } = render(<TreeNodeItem {...mockProps} />)
    const treeItem = getByRole('treeitem').firstElementChild!

    fireEvent.pointerDown(treeItem, { clientX: 100, clientY: 100, button: 0 })

    expect(document.body.dataset.dragging).toBeFalsy()
    expect(document.body.querySelector('div[style*="z-index: 9999"]')).toBeNull()

    fireEvent.pointerUp(treeItem, { clientX: 100, clientY: 100 })

    expect(document.body.dataset.dragging).toBeFalsy()

    // Trigger click since pointer up alone doesn't fire click in synthetic test.
    // A connection click selects the tree node but does not activate/open it.
    fireEvent.click(treeItem)
    await waitFor(() => {
      // Tree node paths are URI-encoded per segment: spaces become %20.
      expect(mockProps.onSelectedTreeNode).toHaveBeenCalledWith(
        'Test%20Postgres%20DB',
      )
    })
    expect(mockProps.onConnectionSelect).not.toHaveBeenCalled()
    expect(mockProps.onConnectionToggle).not.toHaveBeenCalled()
  })

  it('does not start drag when movement is below 5px threshold', () => {
    const { getByRole } = render(<TreeNodeItem {...mockProps} />)
    const treeItem = getByRole('treeitem').firstElementChild!

    fireEvent.pointerDown(treeItem, { clientX: 100, clientY: 100, button: 0 })
    fireEvent.pointerMove(document, { clientX: 103, clientY: 103 }) // distance = sqrt(18) ~ 4.24px

    expect(document.body.dataset.dragging).toBeFalsy()
    expect(document.body.querySelector('div[style*="z-index: 9999"]')).toBeNull()
  })

  it('starts dragging once movement crosses threshold and creates ghost node', () => {
    const { getByRole } = render(<TreeNodeItem {...mockProps} />)
    const treeItem = getByRole('treeitem').firstElementChild!

    fireEvent.pointerDown(treeItem, { clientX: 100, clientY: 100, button: 0 })
    fireEvent.pointerMove(document, { clientX: 110, clientY: 100 }) // distance = 10px

    expect(document.body.dataset.dragging).toBe('connection')
    expect(document.body.dataset.draggedConnectionId).toBe('conn-1')

    const ghost = document.body.querySelector('div[style*="z-index: 9999"]')
    expect(ghost).not.toBeNull()
    expect(ghost?.textContent).toBe('Test Postgres DB')
  })

  it('suppresses click after completed drag', () => {
    const { getByRole } = render(<TreeNodeItem {...mockProps} />)
    const treeItem = getByRole('treeitem').firstElementChild!

    fireEvent.pointerDown(treeItem, { clientX: 100, clientY: 100, button: 0 })
    fireEvent.pointerMove(document, { clientX: 110, clientY: 100 })
    fireEvent.pointerUp(document, { clientX: 110, clientY: 100 })

    // Simulate click event firing immediately after drop
    fireEvent.click(treeItem)

    expect(mockProps.onConnectionSelect).not.toHaveBeenCalled()
    expect(mockProps.onSelectedTreeNode).not.toHaveBeenCalled()
  })

  it('cleans up body dataset, ghost node, and listeners on Escape key', () => {
    const { getByRole } = render(<TreeNodeItem {...mockProps} />)
    const treeItem = getByRole('treeitem').firstElementChild!

    fireEvent.pointerDown(treeItem, { clientX: 100, clientY: 100, button: 0 })
    fireEvent.pointerMove(document, { clientX: 110, clientY: 100 })

    expect(document.body.dataset.dragging).toBe('connection')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.body.dataset.dragging).toBeFalsy()
    expect(document.body.dataset.draggedConnectionId).toBeFalsy()
    expect(document.body.querySelector('div[style*="z-index: 9999"]')).toBeNull()
  })
})
