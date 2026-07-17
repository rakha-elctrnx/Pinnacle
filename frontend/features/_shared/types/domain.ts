// CONNECTION TYPES
export type ConnectionType =
  | 'postgresql'
  | 'mysql'
  | 'mongodb'
  | 'redis'
  | 'rabbitmq'
  | 'elasticsearch'
  | 'sqlite'

export type SshAuthMethod = 'password' | 'privateKey' | 'agent'
export interface SshConfig {
  host: string
  port: number
  username: string
  authMethod: SshAuthMethod
  privateKeyPath?: string
}

export type SslMode =
  | 'disable'
  | 'prefer'
  | 'require'
  | 'verify-ca'
  | 'verify-full'

export interface SslConfig {
  mode: SslMode
  caCertPath?: string
  clientCertPath?: string
  clientKeyPath?: string
}

// Connection profile stored in frontend (NO password - that's in OS keyring)
export interface ConnectionProfile {
  id: string
  name: string
  type: ConnectionType
  host: string
  port: number
  username: string
  // Password is NOT stored here - it's in OS keyring
  // password field removed for security
  database: string
  ssl: boolean
  sslConfig?: SslConfig
  schema?: string
  // SSH tunnel config (no secrets here — sshPassword/keyPassphrase live in keyring)
  ssh?: SshConfig
  // Pool config (optional; backend defaults: poolSize=10, idleTimeoutSecs=300)
  poolSize?: number
  idleTimeoutSecs?: number
  // Reference to password in keyring (format: keyring://{connectionId})
  passwordRef: string
  tags: string[]
  favorite: boolean
  createdAt: string
  updatedAt: string
}

// Request to save a connection (includes password temporarily)
export interface SaveConnectionRequest {
  profile: Omit<
    ConnectionProfile,
    'passwordRef' | 'createdAt' | 'updatedAt'
  > & {
    password?: string
    sshPassword?: string
    keyPassphrase?: string
  }
  // For new connections, omit id to generate one
  id?: string
}

// Response from backend with connection data
export interface ConnectionResponse {
  metadata: ConnectionProfile
  passwordRef: string
}

// List response
export interface ConnectionListResponse {
  connections: ConnectionResponse[]
}
