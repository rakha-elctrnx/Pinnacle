import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import type { ConnectionProfile } from '../../_shared/types/domain'
import type { RedisDatabaseInfo, RedisServerInfo } from './redis'

export interface RedisLayoutOutletContext {
  payload: ConnectionPayload | null
  databases: RedisDatabaseInfo[]
  info: RedisServerInfo | null
  loading: boolean
  error: string | null
  refresh: () => void
  connection: ConnectionProfile
}
