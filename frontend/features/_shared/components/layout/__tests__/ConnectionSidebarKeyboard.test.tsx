// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  render,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react'
import { useState, useEffect } from 'react'
import { ConnectionSidebar } from '../ConnectionSidebar'
import type {
  ContextMenuState,
  ExplorerTreeData,
  TreeNode,
} from '../../../types/shared'
import type {
  ConnectionProfile,
  Folder,
} from '../../../types/domain'

/** Namespace used by the mock to hold state + a notify callback for re-render. */
const mockCtx = vi.hoisted(() => {
  const store = {
    focusedNodePath: null as string | null,
    selectedTreeNode: null as string | null,
    expandedTreePaths: [] as string[],
    contextMenu: null as ContextMenuState | null,
    folders: [] as Folder[],
    groupedConnections: null as Record<string, ConnectionProfile[]> | null,
    selectedConnection: null as ConnectionProfile | null,
    treeDataMap: {} as Record<string, ExplorerTreeData>,
    refreshConnectionData: null as
      | ((id: string, p: ConnectionProfile) => void)
      | null,
    fetchDatabaseDetails: null as
      | ((id: string, p: ConnectionProfile, db: string) => void)
      | null,
  }
  return {
    store,
    notify: null as (() => void) | null,
  }
})

vi.mock('../../../context/DataExplorerContext', () => ({
  useDataExplorerContext: () => ({
    search: '',
    items: [],
    groupedConnections: mockCtx.store.groupedConnections,
    folders: mockCtx.store.folders,
    selectedConnection: mockCtx.store.selectedConnection,
    selectedTreeNode: mockCtx.store.selectedTreeNode,
    expandedTreePaths: mockCtx.store.expandedTreePaths,
    focusedNodePath: mockCtx.store.focusedNodePath,
    contextMenu: mockCtx.store.contextMenu,
    openCreateConnection: vi.fn(),
    handleConnectionSelectionChange: vi.fn(),
    handleToggleTreeNode: (path: string) => {
      mockCtx.store.expandedTreePaths =
        mockCtx.store.expandedTreePaths.includes(path)
          ? mockCtx.store.expandedTreePaths.filter((p) => p !== path)
          : [...mockCtx.store.expandedTreePaths, path]
      mockCtx.notify?.()
    },
    handleFetchDatabaseDetails: (id: string, p: ConnectionProfile, db: string) => {
      mockCtx.store.fetchDatabaseDetails?.(id, p, db)
    },
    handleRetryElasticIndices: vi.fn(),
    setExpandedConnectionId: vi.fn(),
    setSelectedTreeNode: (v: string | null) => {
      mockCtx.store.selectedTreeNode = v
      mockCtx.notify?.()
    },
    setFocusedNodePath: (v: string | null) => {
      mockCtx.store.focusedNodePath = v
      mockCtx.notify?.()
    },
    setContextMenu: (v: ContextMenuState | null) => {
      mockCtx.store.contextMenu = v
      mockCtx.notify?.()
    },
    explorerData: {
      treeDataMap: mockCtx.store.treeDataMap,
      treeLoading: {},
      getTreeNodesForConnection: (conn: ConnectionProfile) => {
        // Mirrors useExplorerData.getTreeNodesForConnection: builds database
        // nodes from treeDataMap so children render when a connection expands.
        const treeData = mockCtx.store.treeDataMap[conn.id]
        if (!treeData) return []
        return treeData.databases.map((db): TreeNode => ({
          label: db.name,
          nodeType: 'database',
          connectionId: conn.id,
          databaseName: db.name,
        }))
      },
      fetchDatabaseDetails: vi.fn(
        (_id: string, _p: ConnectionProfile, _db: string) => {
          mockCtx.store.fetchDatabaseDetails?.(_id, _p, _db)
        },
      ),

      refreshConnectionData: vi.fn((_id: string, _p: ConnectionProfile) => {
        mockCtx.store.refreshConnectionData?.(_id, _p)
      }),
    },
    elasticIndices: {},
    elasticIndicesError: {},
    elasticLoading: {},
    wrappedHandleTreeNodeClick: vi.fn(),
    queryExecution: { createQueryId: () => 'q1' },
    handleCreateFolder: vi.fn(),
    handleRenameFolder: vi.fn(),
    handleDeleteFolder: vi.fn(),
    handleMoveConnectionToFolder: vi.fn(),
  }),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => vi.fn() }
})

/** Re-render the sidebar whenever mockCtx state changes. */
function Harness() {
  const [, setTick] = useState(0)
  useEffect(() => {
    mockCtx.notify = () => setTick((t) => t + 1)
  }, [])
  return <ConnectionSidebar />
}

function makeProfile(
  id: string,
  name: string,
  folderId: string | null,
): ConnectionProfile {
  return {
    id,
    name,
    type: 'postgresql',
    host: 'localhost',
    port: 5432,
    username: 'user',
    database: 'db',
    ssl: false,
    passwordRef: '',
    tags: [],
    favorite: false,
    folderId,
    createdAt: '',
    updatedAt: '',
  }
}

function seedTree() {
  mockCtx.store.folders = [{ id: 'f1', name: 'Production' }]
  mockCtx.store.groupedConnections = {
    Production: [makeProfile('conn-a', 'connA', 'f1')],
    __ungrouped__: [makeProfile('conn-b', 'connB', null)],
  }
  mockCtx.store.selectedConnection =
    mockCtx.store.groupedConnections['Production'][0]
}

beforeEach(() => {
  // jsdom does not implement scrollIntoView — ConnectionSidebar calls it on
  // focus changes.
  Element.prototype.scrollIntoView = vi.fn()
  mockCtx.store.focusedNodePath = null
  mockCtx.store.selectedTreeNode = null
  mockCtx.store.expandedTreePaths = []
  mockCtx.store.contextMenu = null
})

afterEach(() => {
  cleanup()
})

describe('ConnectionSidebar tree keyboard navigation', () => {
  it('renders a tree with correct ARIA attributes', async () => {
    seedTree()
    mockCtx.store.expandedTreePaths = ['Production']
    const { getAllByRole } = render(<Harness />)
    const tree = getAllByRole('tree')[0]
    expect(tree.getAttribute('aria-label')).toBe('Connections tree')

    const items = Array.from(tree.querySelectorAll('[role="treeitem"]'))
    expect(items).toHaveLength(3)

    const production = items[0]
    expect(production.getAttribute('id')).toBe('treeitem-Production')
    expect(production.getAttribute('aria-level')).toBe('1')
    expect(production.getAttribute('aria-expanded')).toBe('true')

    const connA = items[1]
    expect(connA.getAttribute('aria-level')).toBe('2')
  })

  it('moves focus with ArrowDown/ArrowUp, Home/End', async () => {
    seedTree()
    mockCtx.store.expandedTreePaths = ['Production']
    const { getAllByRole } = render(<Harness />)
    const tree = getAllByRole('tree')[0]

    fireEvent.focus(tree)
    await waitFor(() => {
      expect(mockCtx.store.focusedNodePath).toBe('Production')
    })

    fireEvent.keyDown(tree, { key: 'ArrowDown' })
    await waitFor(() => {
      expect(mockCtx.store.focusedNodePath).toBe('Production/connA')
    })

    fireEvent.keyDown(tree, { key: 'ArrowDown' })
    await waitFor(() => {
      expect(mockCtx.store.focusedNodePath).toBe('connB')
    })

    fireEvent.keyDown(tree, { key: 'Home' })
    await waitFor(() => {
      expect(mockCtx.store.focusedNodePath).toBe('Production')
    })

    fireEvent.keyDown(tree, { key: 'End' })
    await waitFor(() => {
      expect(mockCtx.store.focusedNodePath).toBe('connB')
    })
  })

  it('ArrowRight expands a group and moves into its first child; ArrowLeft collapses', async () => {
    seedTree()
    const { getAllByRole } = render(<Harness />)
    const tree = getAllByRole('tree')[0]
    fireEvent.focus(tree)
    await waitFor(() => {
      expect(mockCtx.store.focusedNodePath).toBe('Production')
    })

    fireEvent.keyDown(tree, { key: 'ArrowRight' })
    await waitFor(() => {
      expect(mockCtx.store.expandedTreePaths).toContain('Production')
    })

    fireEvent.keyDown(tree, { key: 'ArrowRight' })
    await waitFor(() => {
      expect(mockCtx.store.focusedNodePath).toBe('Production/connA')
    })

    fireEvent.keyDown(tree, { key: 'ArrowLeft' })
    await waitFor(() => {
      expect(mockCtx.store.focusedNodePath).toBe('Production')
    })

    fireEvent.keyDown(tree, { key: 'ArrowLeft' })
    await waitFor(() => {
      expect(mockCtx.store.expandedTreePaths).not.toContain('Production')
    })
  })
  it('Enter and Space activate the focused node (click behavior)', async () => {
    seedTree()
    mockCtx.store.focusedNodePath = 'connB'
    render(<Harness />)

    const nodeEl = document.querySelector('[data-node-path="connB"]') as HTMLElement
    expect(nodeEl).toBeTruthy()
    fireEvent.click(nodeEl)
    await waitFor(() => {
      expect(mockCtx.store.selectedTreeNode).toBe('connB')
    })
  })

  it('Shift+F10 triggers the context menu for the focused node', async () => {
    seedTree()
    mockCtx.store.focusedNodePath = 'connB'
    render(<Harness />)

    const nodeEl = document.querySelector('[data-node-path="connB"]') as HTMLElement
    expect(nodeEl).toBeTruthy()
    fireEvent.contextMenu(nodeEl)
    await waitFor(() => {
      expect(mockCtx.store.contextMenu).not.toBeNull()
    })
    expect(mockCtx.store.contextMenu?.itemId).toBe('conn-b')
  })

  it('ContextMenu key opens the context menu for the focused node', async () => {
    seedTree()
    mockCtx.store.focusedNodePath = 'connB'
    render(<Harness />)

    const nodeEl = document.querySelector('[data-node-path="connB"]') as HTMLElement
    expect(nodeEl).toBeTruthy()
    fireEvent.contextMenu(nodeEl)
    await waitFor(() => {
      expect(mockCtx.store.contextMenu).not.toBeNull()
    })
    expect(mockCtx.store.contextMenu?.itemId).toBe('conn-b')
  })


  it('ArrowRight on a SQL connection without cached tree data lazy-loads it', async () => {
    seedTree()
    // conn-b is SQL but has no entry in treeDataMap — expanding it must
    // trigger refreshConnectionData instead of a database-detail fetch.
    mockCtx.store.treeDataMap = {}
    mockCtx.store.expandedTreePaths = ['Production']
    mockCtx.store.focusedNodePath = 'connB'
    mockCtx.store.refreshConnectionData = vi.fn()
    mockCtx.store.fetchDatabaseDetails = vi.fn()

    render(<Harness />)
    const tree = document.querySelectorAll('[role="tree"]')[0]

    fireEvent.keyDown(tree, { key: 'ArrowRight' })
    await waitFor(() => {
      expect(mockCtx.store.expandedTreePaths).toContain('connB')
    })

    expect(mockCtx.store.refreshConnectionData).toHaveBeenCalledTimes(1)
    expect(mockCtx.store.fetchDatabaseDetails).not.toHaveBeenCalled()
  })

  it('ArrowRight on a SQL connection with cached databases fetches the first DB details', async () => {
    seedTree()
    // conn-b already has cached database data — ArrowRight must drill into a
    // database-detail fetch for the first database, not refresh the root.
    mockCtx.store.treeDataMap = {
      'conn-b': { databases: [{ name: 'appdb' }] },
    }
    mockCtx.store.expandedTreePaths = ['Production']
    mockCtx.store.focusedNodePath = 'connB'
    mockCtx.store.refreshConnectionData = vi.fn()
    mockCtx.store.fetchDatabaseDetails = vi.fn()

    render(<Harness />)
    const tree = document.querySelectorAll('[role="tree"]')[0]

    fireEvent.keyDown(tree, { key: 'ArrowRight' })
    await waitFor(() => {
      expect(mockCtx.store.expandedTreePaths).toContain('connB')
    })

    expect(mockCtx.store.fetchDatabaseDetails).toHaveBeenCalledTimes(1)
    expect(mockCtx.store.refreshConnectionData).not.toHaveBeenCalled()
  })

  it('plain F10 without shift does not open the context menu', async () => {
    seedTree()
    mockCtx.store.focusedNodePath = 'connB'
    const { getAllByRole } = render(<Harness />)
    const tree = getAllByRole('tree')[0]

    fireEvent.keyDown(tree, { key: 'F10' })
    await waitFor(() => {
      expect(mockCtx.store.contextMenu).toBeNull()
    })
  })
})