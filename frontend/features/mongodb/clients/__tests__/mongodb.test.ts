import { describe, it, expect, vi } from 'vitest'
import {
  mongoTestConnection,
  mongoListDatabases,
  mongoFindDocuments,
} from '../mongodb'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command: string) => {
    if (command === 'mongo_test_connection') {
      return { ok: true, message: 'Connected', version: '7.0.5' }
    }
    if (command === 'mongo_list_databases') {
      return [
        { name: 'admin', sizeOnDiskBytes: 1000, empty: false },
        { name: 'test_db', sizeOnDiskBytes: 5000, empty: false },
      ]
    }
    if (command === 'mongo_find_documents') {
      return {
        documents: [{ _id: { $oid: '123' }, name: 'Test Doc' }],
        canonicalDocuments: [{ _id: { $oid: '123' }, name: 'Test Doc' }],
        offset: 0,
        hasPrevious: false,
        hasNext: false,
        elapsedMs: 12,
      }
    }
    throw new Error(`Unhandled command ${command}`)
  }),
}))

describe('MongoDB Frontend Client Wrappers', () => {
  const dummyPayload = {
    type: 'mongodb',
    host: 'localhost',
    port: 27017,
    username: '',
    database: 'test_db',
    ssl: false,
  }

  it('invokes mongo_test_connection cleanly', async () => {
    const res = await mongoTestConnection(dummyPayload)
    expect(res.ok).toBe(true)
    expect(res.version).toBe('7.0.5')
  })

  it('invokes mongo_list_databases cleanly', async () => {
    const dbs = await mongoListDatabases(dummyPayload)
    expect(dbs.length).toBe(2)
    expect(dbs[0].name).toBe('admin')
  })

  it('invokes mongo_find_documents cleanly', async () => {
    const res = await mongoFindDocuments({
      connection: dummyPayload,
      database: 'test_db',
      collection: 'users',
      offset: 0,
      pageSize: 50,
    })
    expect(res.documents.length).toBe(1)
    expect(res.documents[0].name).toBe('Test Doc')
  })
})
