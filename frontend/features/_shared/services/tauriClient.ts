import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import type {
  ConnectionProfile,
  ConnectionResponse,
  ConnectionListResponse,
  SshConfig,
  SslConfig,
} from '../types/domain'
export interface ConnectionPayload {
  type: string
  host: string
  port: number
  username: string
  password?: string
  database: string
  ssl: boolean
  sslConfig?: SslConfig
  schema?: string
  ssh?: SshConfig
  poolSize?: number
  idleTimeoutSecs?: number
}

/**
 * Connection Service Client
 * Wraps Tauri invoke calls for connection management commands.
 */

export async function saveConnection(request: {
  id?: string
  name: string
  type: string
  host: string
  port: number
  username: string
  database: string
  ssl: boolean
  sslConfig?: SslConfig
  schema?: string
  tags?: string[]
  favorite?: boolean
  password?: string
  ssh?: SshConfig
  sshPassword?: string
  keyPassphrase?: string
}): Promise<ConnectionResponse> {
  return invoke<ConnectionResponse>('save_connection', {
    request: {
      metadata: {
        id: request.id || crypto.randomUUID(),
        name: request.name,
        type: request.type,
        host: request.host,
        port: request.port,
        username: request.username,
        database: request.database,
        ssl: request.ssl,
        sslConfig: request.sslConfig,
        schema: request.schema || '',
        tags: request.tags || [],
        favorite: request.favorite || false,
        ssh: request.ssh,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      password: request.password,
      sshPassword: request.sshPassword,
      keyPassphrase: request.keyPassphrase,
    },
  })
}

export async function listConnections(
  search?: string,
  connectionType?: string,
  tags?: string[],
  favoritesOnly?: boolean,
): Promise<ConnectionListResponse> {
  return invoke<ConnectionListResponse>('list_connections', {
    search,
    connection_type: connectionType,
    tags,
    favorites_only: favoritesOnly,
  })
}

export async function getConnection(
  connectionId: string,
): Promise<ConnectionResponse | null> {
  return invoke<ConnectionResponse | null>('get_connection', {
    connection_id: connectionId,
  })
}

export async function getConnectionPassword(
  connectionId: string,
): Promise<string> {
  const response = await invoke<{ connectionId: string; password: string }>(
    'get_connection_password',
    { request: { connectionId } },
  )
  return response.password
}

export async function getSshPassword(connectionId: string): Promise<string> {
  const response = await invoke<{ connectionId: string; password: string }>(
    'get_ssh_password',
    { request: { connectionId } },
  )
  return response.password
}

export async function getKeyPassphrase(connectionId: string): Promise<string> {
  const response = await invoke<{ connectionId: string; password: string }>(
    'get_key_passphrase',
    { request: { connectionId } },
  )
  return response.password
}

export async function deleteConnection(connectionId: string): Promise<void> {
  return invoke<void>('delete_connection', { request: { connectionId } })
}

export async function updateConnection(
  profile: ConnectionProfile,
): Promise<ConnectionResponse> {
  return invoke<ConnectionResponse>('update_connection', { metadata: profile })
}

export async function hasConnectionPassword(
  connectionId: string,
): Promise<boolean> {
  return invoke<boolean>('has_connection_password', {
    connection_id: connectionId,
  })
}

/**
 * Show a native save dialog and return the chosen path, or null if cancelled.
 */
export async function showExportSaveDialog(
  suggestedFilename: string,
): Promise<string | null> {
  // Extract the extension from the suggested filename for the file filter.
  // Using extensions: ['*'] causes macOS to append a literal ".*" to the name.
  const ext = suggestedFilename.includes('.')
    ? (suggestedFilename.split('.').pop() ?? '*')
    : '*'
  return save({
    defaultPath: suggestedFilename,
    filters: [{ name: 'All Files', extensions: [ext] }],
  })
}

export async function disconnectConnection(
  connectionId: string,
): Promise<void> {
  return invoke<void>('disconnect_connection', { connectionId })
}

export interface ConnectionHealth {
  state: string
  lastError: string | null
  lastCheckedAt: string
}

export async function getConnectionHealth(
  connectionId: string,
): Promise<ConnectionHealth> {
  return invoke<ConnectionHealth>('get_connection_health', { connectionId })
}
