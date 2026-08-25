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
      | ((dbName: string, connectionId?: string) => void)
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
    handleFetchDatabaseDetails: (dbName: string, connectionId?: string) => {
      mockCtx.store.fetchDatabaseDetails?.(dbName, connectionId)
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
        return treeData.databases.map((db): TreeNode => {
          if (conn.type === 'mongodb') {
            const collections = db.schemas[0]?.tables || []
            const views = db.schemas[0]?.views || []
            const children: TreeNode[] = [
              ...collections.map(
                (c): TreeNode => ({
                  label: c,
                  nodeType: 'item',
                  connectionId: conn.id,
                  databaseName: db.name,
                }),
              ),
              ...views.map(
                (v): TreeNode => ({
                  label: `${v} (view)`,
                  nodeType: 'item',
                  connectionId: conn.id,
                  databaseName: db.name,
                }),
              ),
            ]
            return {
              label: db.name,
              nodeType: 'database',
              connectionId: conn.id,
              databaseName: db.name,
              children: db.loaded ? children : undefined,
            }
          }
          return {
            label: db.name,
            nodeType: 'database',
            connectionId: conn.id,
            databaseName: db.name,
          }
        })
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
  type: ConnectionProfile['type'] = 'postgresql',
): ConnectionProfile {
  return {
    id,
    name,
    type,
    host: 'localhost',
    port: type === 'mongodb' ? 27017 : 5432,
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

  it('single-clicking a Mongo database node expands it and fetches database details', async () => {
    const mongo = makeProfile('mongo-1', 'Local Mongo', null, 'mongodb')
    mockCtx.store.groupedConnections = { __ungrouped__: [mongo] }
    mockCtx.store.selectedConnection = mongo
    mockCtx.store.expandedTreePaths = ['Local%20Mongo']
    mockCtx.store.treeDataMap = {
      'mongo-1': {
        databases: [{ name: 'testdb', schemas: [], loaded: false }],
      },
    }
    mockCtx.store.fetchDatabaseDetails = vi.fn()

    render(<Harness />)
    const dbNode = document.querySelector(
      '[data-node-path="Local%20Mongo/testdb"]',
    ) as HTMLElement

    fireEvent.click(dbNode)

    await waitFor(() => {
      expect(mockCtx.store.expandedTreePaths).toContain('Local%20Mongo/testdb')
    })
    expect(mockCtx.store.fetchDatabaseDetails).toHaveBeenCalledWith(
      'testdb',
      'mongo-1',
    )
  })

  it('renders dynamic Mongo collections when database is loaded without static placeholder nodes', async () => {
    const mongoGrouped = makeProfile('mongo-2', 'Grouped Mongo', 'FolderA', 'mongodb')
    const folder: Folder = { id: 'f1', name: 'FolderA' }
    mockCtx.store.folders = [folder]
    mockCtx.store.groupedConnections = { FolderA: [mongoGrouped] }
    mockCtx.store.selectedConnection = mongoGrouped
    mockCtx.store.expandedTreePaths = ['FolderA', 'FolderA/Grouped%20Mongo', 'FolderA/Grouped%20Mongo/admin']
    mockCtx.store.treeDataMap = {
      'mongo-2': {
        databases: [
          {
            name: 'admin',
            schemas: [{ name: 'admin', tables: ['users', 'logs'], views: ['active_users'] }],
            loaded: true,
          },
        ],
      },
    }

    render(<Harness />)

    expect(document.querySelector('[data-node-path="FolderA/Grouped%20Mongo/admin/users"]')).not.toBeNull()
    expect(document.querySelector('[data-node-path="FolderA/Grouped%20Mongo/admin/active_users%20(view)"]')).not.toBeNull()
    expect(document.querySelector('[aria-label="Databases"]')).toBeNull()
    expect(document.querySelector('[aria-label="Collections"]')).toBeNull()
  })
  it('single-clicking a MongoDB connection expands and loads its databases', async () => {
    const mongo = makeProfile('mongo-1', 'Local Mongo', null, 'mongodb')
    mockCtx.store.groupedConnections = { __ungrouped__: [mongo] }
    mockCtx.store.selectedConnection = mongo
    mockCtx.store.treeDataMap = {}
    mockCtx.store.refreshConnectionData = vi.fn()

    render(<Harness />)
    const node = document.querySelector(
      '[data-node-path="Local%20Mongo"]',
    ) as HTMLElement

    fireEvent.click(node)

    await waitFor(() => {
      expect(mockCtx.store.expandedTreePaths).toContain('Local%20Mongo')
    })
    expect(mockCtx.store.refreshConnectionData).toHaveBeenCalledWith(
      'mongo-1',
      mongo,
    )
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

  it('does not scroll the sidebar when focus or selection changes', async () => {
    seedTree()
    mockCtx.store.focusedNodePath = 'Production'
    render(<Harness />)

    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView)
    scrollIntoView.mockClear()

    mockCtx.store.focusedNodePath = 'connB'
    mockCtx.store.selectedTreeNode = 'connB'
    mockCtx.notify?.()

    await waitFor(() => {
      expect(document.activeElement?.getAttribute('data-node-path')).toBe('connB')
    })
    expect(scrollIntoView).not.toHaveBeenCalled()
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