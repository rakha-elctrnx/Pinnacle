// Race-safety tests for fetchTableDataCore: a slow stale request must never
// overwrite newer data or end the newest request's loading window.
// Run with: pnpm vitest run frontend/features/sql/hooks/useExplorerData.race.test.ts
import { describe, it, expect, vi } from 'vitest'
import { fetchTableDataCore, type FetchTableDataDeps } from './useExplorerData'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import type { ConnectionProfile } from '../../_shared/types/domain'

/** Deferred promise — resolve/reject controlled per test. */
interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

interface QueryResult {
  rowsAffected: number
  elapsedMs: number
  columns: string[]
  rows: Record<string, string>[]
}

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

const INDEX_SQL = /pg_indexes|information_schema\.statistics/i
const DATA_SQL = /SELECT \* FROM/i
const COUNT_SQL = /COUNT\(\*\)/i
const STRUCT_SQL = /information_schema\.columns|SHOW COLUMNS/i

function pageResult(tag: string): QueryResult {
  return {
    rowsAffected: 0,
    elapsedMs: 1,
    columns: ['id'],
    rows: [{ id: tag }],
  }
}

function countResult(n: number): QueryResult {
  return {
    rowsAffected: 0,
    elapsedMs: 1,
    columns: ['count'],
    rows: [{ count: String(n) }],
  }
}

function emptyResult(): QueryResult {
  return { rowsAffected: 0, elapsedMs: 1, columns: [], rows: [] }
}

interface Harness {
  deps: FetchTableDataDeps
  loadingWrites: boolean[]
  rowsWritten: Record<string, string>[][]
  counts: number[]
  /** Resolve the first still-pending query whose SQL matches `match`. */
  settle: (match: RegExp, result?: QueryResult) => void
}

/**
 * Harness keyed by SQL predicate — request interleaving order at await
 * points must not matter for test correctness.
 */
function makeHarness(): Harness {
  const pending = new Map<number, { sql: string; d: Deferred<QueryResult> }>()
  let nextId = 0

  const h: Harness = {
    loadingWrites: [],
    rowsWritten: [],
    counts: [],
    settle(match, result?) {
      // Newest-first: when two concurrent requests have the same SQL shape
      // pending, the newer request must win the race, matching how a real
      // server would answer the most recent page fetch first.
      const entries = [...pending.entries()].reverse()
      for (const [id, entry] of entries) {
        if (!match.test(entry.sql)) continue
        pending.delete(id)
        entry.d.resolve(result ?? emptyResult())
        return
      }
      throw new Error(`no pending query matched ${match}`)
    },
    deps: {} as FetchTableDataDeps,
  }

  h.deps = {
    seqRef: { current: 0 },
    metaCache: new Map(),
    execute: (payload) => {
      const id = nextId++
      const d = createDeferred<QueryResult>()
      pending.set(id, { sql: payload.sql, d })
      return d.promise
    },
    resolvePayload: async () =>
      ({ password: 'x' }) as unknown as ConnectionPayload,
    setTableDataLoading: (v) => h.loadingWrites.push(v),
    setRealTableIndexes: () => {},
    setRealTableColumns: () => {},
    setRealTableRows: (r) => h.rowsWritten.push(r),
    setTotalRowCount: (n) => h.counts.push(n),
    setRealTableStructure: () => {},
    setRealTableStats: () => {},
  }
  return h
}

describe('fetchTableDataCore stale-request suppression', () => {
  it('keeps page-2 data when a superseded page-1 request settles last', async () => {
    const h = makeHarness()

    const p1 = fetchTableDataCore(
      CONN,
      'public',
      'orders',
      'db',
      1,
      50,
      '',
      '',
      undefined,
      h.deps,
    )
    // Request 2 starts before request 1's payload resolves → request 1 is
    // stale-gated after its payload await and never issues queries.
    const p2 = fetchTableDataCore(
      CONN,
      'public',
      'orders',
      'db',
      2,
      50,
      '',
      '',
      undefined,
      h.deps,
    )

    // Drain: payload awaits resolve → stale gate → request 2 issues wave 1.
    await Promise.resolve()
    await Promise.resolve()

    // Settle request 2's index query, then drain so its wave-2 queries fire.
    h.settle(INDEX_SQL)
    await Promise.resolve()
    await Promise.resolve()
    h.settle(DATA_SQL, pageResult('page-2'))
    h.settle(COUNT_SQL, countResult(200))
    h.settle(STRUCT_SQL)
    await p2

    // The latest request won and ended its own loading window.
    expect(h.rowsWritten.at(-1)).toEqual([{ id: 'page-2' }])
    expect(h.loadingWrites.at(-1)).toBe(false)
    const rowsAfterSecond = h.rowsWritten.at(-1)
    const countsAfterSecond = h.counts.length
    const loadingWritesAfterSecond = h.loadingWrites.length

    // The superseded request settles last and must touch nothing.
    await expect(p1).resolves.toBeUndefined()
    expect(h.rowsWritten.at(-1)).toBe(rowsAfterSecond)
    expect(h.counts.length).toBe(countsAfterSecond)
    expect(h.loadingWrites.length).toBe(loadingWritesAfterSecond)
    expect(h.loadingWrites.at(-1)).toBe(false)
  })

  it('ends loading only for the latest request even when the stale one fails', async () => {
    // Request 1's index query hangs until the test fails it; every other
    // query resolves immediately.
    const staleFail = createDeferred<QueryResult>()
    let staleCaptured = false
    const h = makeHarness()
    const baseExecute = h.deps.execute
    h.deps.execute = (payload) => {
      if (!staleCaptured && INDEX_SQL.test(payload.sql)) {
        staleCaptured = true
        return staleFail.promise
      }
      void baseExecute
      return Promise.resolve(emptyResult())
    }

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // Request 1 issues its hanging index query…
      const p1 = fetchTableDataCore(
        CONN,
        'public',
        'orders',
        'db',
        1,
        50,
        '',
        '',
        undefined,
        h.deps,
      )
      await Promise.resolve()
      // …then request 2 supersedes it and completes fully.
      const p2 = fetchTableDataCore(
        CONN,
        'public',
        'orders',
        'db',
        2,
        50,
        '',
        '',
        undefined,
        h.deps,
      )
      await p2
      expect(h.loadingWrites.at(-1)).toBe(false)
      const loadingWriteCount = h.loadingWrites.length

      // The stale request then FAILS — must not clear/flip loading state.
      staleFail.reject(new Error('stale network blip'))
      await expect(p1).rejects.toThrow('stale network blip')

      expect(h.loadingWrites.length).toBe(loadingWriteCount)
      // Exactly one false write: the latest request ending its own window.
      expect(h.loadingWrites.filter((w) => w === false)).toHaveLength(1)
    } finally {
      errSpy.mockRestore()
    }
  })
})
