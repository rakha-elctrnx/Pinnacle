export type ConnectionType = 'postgresql' | 'mysql' | 'mongodb' | 'redis' | 'rabbitmq' | 'elasticsearch'

export interface ConnectionProfile {
  id: string
  name: string
  type: ConnectionType
  host: string
  port: number
  username: string
  password: string
  database: string
  ssl: boolean
  encryptedPasswordRef: string
  tags: string[]
  favorite: boolean
  createdAt: string
  updatedAt: string
}