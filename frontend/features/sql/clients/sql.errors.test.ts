// Tauri client error normalization for SQL table-detail calls (Step 6).
// Run with: pnpm vitest run frontend/features/sql/clients/sql.errors.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

import {
  executeSql,
  sqlBeginTransaction,
  sqlCommitTransaction,
  sqlRollbackTransaction,
} from './sql'

afterEach(() => {
  invokeMock.mockReset()
})

describe('SQL client error normalization', () => {
  it('converts a plain-string rejection into an Error', async () => {
    invokeMock.mockRejectedValue('error connecting to server: connection refused')

    await expect(executeSql({ connection: {} as never, sql: 'SELECT 1' })).rejects.toThrow(
      Error,
    )
    await expect(executeSql({ connection: {} as never, sql: 'SELECT 1' })).rejects.toThrow(
      'error connecting to server: connection refused',
    )
  })

  it('converts an object rejection with a message field into an Error', async () => {
    invokeMock.mockRejectedValue({ message: 'database error: query failed' })

    await expect(
      sqlBeginTransaction({ type: 'postgresql' } as never),
    ).rejects.toThrow('database error: query failed')
  })

  it('serializes exotic object rejections instead of emitting "[object Object]"', async () => {
    invokeMock.mockRejectedValue({ code: -1, detail: 'pool exhausted' })

    let caught: unknown
    try {
      await sqlCommitTransaction({} as never, 'tx-1')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain('pool exhausted')
    expect((caught as Error).message).not.toBe('[object Object]')
  })

  it('passes through already-Error rejections untouched', async () => {
    const original = new Error('unchanged')
    invokeMock.mockRejectedValue(original)

    await expect(sqlRollbackTransaction({} as never, 'tx-2')).rejects.toBe(original)
  })

  it('leaves successful result types unchanged', async () => {
    const result = { rowsAffected: 3, elapsedMs: 12, columns: ['id'], rows: [] }
    invokeMock.mockResolvedValue(result)

    await expect(executeSql({ connection: {} as never, sql: 'UPDATE t SET x=1' })).resolves.toEqual(
      result,
    )
    expect(invokeMock).toHaveBeenCalledWith('execute_sql', {
      payload: { connection: {}, sql: 'UPDATE t SET x=1' },
    })
  })
})
