// Keyring rejection + Tauri client error normalization for Step 6.
// Run with: pnpm vitest run frontend/features/_shared/utils.keyring.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getConnectionPasswordMock } = vi.hoisted(() => ({
  getConnectionPasswordMock: vi.fn(),
}))

vi.mock('./services/tauriClient', () => ({
  getConnectionPassword: (...args: unknown[]) => getConnectionPasswordMock(...args),
}))

import {
  getConnPayloadWithPassword,
  KEYRING_RECOVERY_MESSAGE,
} from './utils'
import type { ConnectionProfile } from './types/domain'

function makeProfile(overrides: Partial<ConnectionProfile> = {}): ConnectionProfile {
  return {
    id: 'conn-abc-123',
    name: 'Local PG',
    type: 'postgresql',
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    database: 'appdb',
    ssl: false,
    passwordRef: 'keyring://conn-abc-123',
    tags: [],
    favorite: false,
    folderId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('getConnPayloadWithPassword keyring rejection', () => {
  beforeEach(() => {
    getConnectionPasswordMock.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('rejects with the exact user-safe recovery message on keyring failure', async () => {
    getConnectionPasswordMock.mockRejectedValue(new Error('keyring backend unavailable'))

    await expect(getConnPayloadWithPassword(makeProfile())).rejects.toThrow(
      KEYRING_RECOVERY_MESSAGE,
    )
    await expect(getConnPayloadWithPassword(makeProfile())).rejects.toThrow(
      'Failed to retrieve stored password. Re-save the connection credentials and retry.',
    )
  })

  it('rejects identically when the keyring returns an empty password', async () => {
    getConnectionPasswordMock.mockResolvedValue('')

    await expect(getConnPayloadWithPassword(makeProfile())).rejects.toThrow(
      KEYRING_RECOVERY_MESSAGE,
    )
  })

  it('never leaks the raw keyring error or connection id in the rejection', async () => {
    const rawKeyringError = new Error(
      'secret-service failure for entry pinnacle=conn-abc-123 (dbus timeout)',
    )
    getConnectionPasswordMock.mockRejectedValue(rawKeyringError)

    let caught: unknown
    try {
      await getConnPayloadWithPassword(makeProfile())
    } catch (err) {
      caught = err
    }
    const message = caught instanceof Error ? caught.message : String(caught)
    expect(message).toBe(KEYRING_RECOVERY_MESSAGE)
    expect(message).not.toContain('conn-abc-123')
    expect(message).not.toContain('dbus')
    expect(message).not.toContain('secret-service')
  })

  it('does not log the connection id or raw error to console', async () => {
    const warnSpy = vi.spyOn(console, 'warn')
    const errorSpy = vi.spyOn(console, 'error')
    const logSpy = vi.spyOn(console, 'log')
    getConnectionPasswordMock.mockRejectedValue(new Error('dbus exploded'))

    await expect(getConnPayloadWithPassword(makeProfile())).rejects.toThrow()

    for (const spy of [warnSpy, errorSpy, logSpy]) {
      const calls = spy.mock.calls.flat().join(' ')
      expect(calls).not.toContain('conn-abc-123')
      expect(calls).not.toContain('dbus exploded')
    }
  })

  it('resolves with the fetched password on success and keeps payload fields', async () => {
    getConnectionPasswordMock.mockResolvedValue('hunter2')

    const payload = await getConnPayloadWithPassword(makeProfile(), 'public')

    expect(payload.password).toBe('hunter2')
    expect(payload.type).toBe('postgresql')
    expect(payload.host).toBe('localhost')
    expect(payload.database).toBe('appdb')
    expect(payload.schema).toBe('public')
  })

  it('skips the keyring lookup entirely when no passwordRef exists', async () => {
    const profile = makeProfile({ passwordRef: '' })

    const payload = await getConnPayloadWithPassword(profile)

    expect(getConnectionPasswordMock).not.toHaveBeenCalled()
    expect(payload.password).toBe('')
  })
})
