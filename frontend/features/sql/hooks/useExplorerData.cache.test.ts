import { describe, it, expect } from 'vitest'
import { fetchTableDataCore, type FetchTableDataDeps } from './useExplorerData'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import type { ConnectionProfile } from '../../_shared/types/domain'
import type { TableQueryResultCache } from '../store/tableDetailCacheStore'

const CONN: ConnectionProfile = {
  id: 'conn-1',
  name: 'c',
  type: 'postgresql',
  host: 'localhost',
  port: 5432,
  username: 'u',
  database: 'db',
  ssl: false,
  schema: 'public',
  passwordRef: '',
  tags: [],
  favorite: false,
}

describe('fetchTableDataCore result cache behavior', () => {
  it('serves cached result and restores index metadata on tab remount when query parameters are identical without executing SQL', async () => {
    let executeCalls = 0
    const rowsWritten: Record<string, string>[][] = []
    let indexesWritten: unknown[] = []

    const cacheMap = new Map<
      string,
      { resultCache: TableQueryResultCache | null }
    >()
    const tabId = 'conn-1:table:users'
    const queryKey = 'conn-1::db::public::users::1::50::::'
    const pkIndexes = [
      {
        schemaName: 'public',
        tableName: 'users',
        columnName: ['id'],
        indexName: 'primary',
        indexDefinition: null,
        isUnique: true,
        isPrimary: true,
        indexType: null,
      },
    ]
    cacheMap.set(tabId, {
      resultCache: {
        queryKey,
        rows: [{ id: '1', name: 'Alice' }],
        columns: ['id', 'name'],
        totalRowCount: 1,
        structure: [],
        indexes: pkIndexes,
      },
    })

    const deps: FetchTableDataDeps = {
      seqRef: { current: 0 },
      metaCache: new Map(),
      execute: async () => {
        executeCalls++
        return { rowsAffected: 0, elapsedMs: 1, columns: [], rows: [] }
      },
      resolvePayload: async () =>
        ({ password: 'x' }) as unknown as ConnectionPayload,
      setTableDataLoading: () => {},
      setRealTableIndexes: (idxs) => {
        indexesWritten = idxs
      },
      setRealTableColumns: () => {},
      setRealTableRows: (r) => rowsWritten.push(r),
      setTotalRowCount: () => {},
      setRealTableStructure: () => {},
      setRealTableStats: () => {},
      getTabCache: (id) => cacheMap.get(id),
      setTabCache: (id, snapshot) => cacheMap.set(id, snapshot),
    }

    await fetchTableDataCore(
      CONN,
      'public',
      'users',
      'db',
      1,
      50,
      '',
      '',
      undefined,
      deps,
    )
    expect(executeCalls).toBe(0)
    expect(rowsWritten).toEqual([[{ id: '1', name: 'Alice' }]])
    expect(indexesWritten).toEqual(pkIndexes)
  })

  it('bypasses cache and executes queries when bypassCache option is true', async () => {
    let executeCalls = 0
    const cacheMap = new Map<
      string,
      { resultCache: TableQueryResultCache | null }
    >()
    const tabId = 'conn-1:table:users'
    const queryKey = 'conn-1::db::public::users::1::50::::'
    cacheMap.set(tabId, {
      resultCache: {
        queryKey,
        rows: [{ id: '1', name: 'Alice' }],
        columns: ['id', 'name'],
        totalRowCount: 1,
        indexes: [],
      },
    })

    const deps: FetchTableDataDeps = {
      seqRef: { current: 0 },
      metaCache: new Map(),
      execute: async (payload) => {
        executeCalls++
        if (/COUNT/i.test(payload.sql)) {
          return {
            rowsAffected: 0,
            elapsedMs: 1,
            columns: ['count'],
            rows: [{ count: '2' }],
          }
        }
        if (/information_schema\.columns/i.test(payload.sql)) {
          return {
            rowsAffected: 0,
            elapsedMs: 1,
            columns: ['column_name'],
            rows: [],
          }
        }
        if (/pg_indexes/i.test(payload.sql)) {
          return { rowsAffected: 0, elapsedMs: 1, columns: [], rows: [] }
        }
        return {
          rowsAffected: 0,
          elapsedMs: 1,
          columns: ['id', 'name'],
          rows: [{ id: '2', name: 'Bob' }],
        }
      },
      resolvePayload: async () =>
        ({ password: 'x' }) as unknown as ConnectionPayload,
      setTableDataLoading: () => {},
      setRealTableIndexes: () => {},
      setRealTableColumns: () => {},
      setRealTableRows: () => {},
      setTotalRowCount: () => {},
      setRealTableStructure: () => {},
      setRealTableStats: () => {},
      getTabCache: (id) => cacheMap.get(id),
      setTabCache: (id, snapshot) => cacheMap.set(id, snapshot),
    }

    await fetchTableDataCore(
      CONN,
      'public',
      'users',
      'db',
      1,
      50,
      '',
      '',
      { bypassCache: true },
      deps,
    )

    expect(executeCalls).toBeGreaterThan(0)
    expect(cacheMap.get(tabId)?.resultCache?.rows).toEqual([
      { id: '2', name: 'Bob' },
    ])
  })
})
