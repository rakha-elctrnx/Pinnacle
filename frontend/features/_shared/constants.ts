import type { ConnectionType } from './types/domain'
import type { DatabaseTypeOption, ConnectionStatus } from './types/shared'
import {
  PostgreSqlIcon,
  MySqlIcon,
  RedisIcon,
  RabbitMqIcon,
  ElasticSearchIcon,
  MongoDbIcon,
} from './components/branding/DatasourceLogo'

export const databaseTypeOptions: DatabaseTypeOption[] = [
  {
    label: 'PostgreSQL',
    value: 'postgresql',
    Icon: PostgreSqlIcon,
    hint: 'Relational database',
  },
  {
    label: 'MySQL',
    value: 'mysql',
    Icon: MySqlIcon,
    hint: 'Relational database',
  },
  {
    label: 'Redis',
    value: 'redis',
    Icon: RedisIcon,
    hint: 'In-memory data store',
  },
  {
    label: 'RabbitMQ',
    value: 'rabbitmq',
    Icon: RabbitMqIcon,
    hint: 'Message broker',
  },
  {
    label: 'Elasticsearch',
    value: 'elasticsearch',
    Icon: ElasticSearchIcon,
    hint: 'Search and analytics',
  },
  {
    label: 'MongoDB',
    value: 'mongodb',
    Icon: MongoDbIcon,
    hint: 'Future connector',
  },
]

export const defaultPortByType: Record<ConnectionType, number> = {
  postgresql: 5432,
  mysql: 3306,
  mongodb: 27017,
  elasticsearch: 9200,
  redis: 6379,
  rabbitmq: 5672,
}

export const defaultInitialDatabaseByType: Record<ConnectionType, string> = {
  postgresql: 'postgres',
  mysql: 'mysql',
  mongodb: 'admin',
  elasticsearch: 'default',
  redis: '0',
  rabbitmq: '/',
}

export const seedSql = 'SELECT *\nFROM users\nLIMIT 100;'

export const seedElastic = `{
  "query": {
    "match_all": {}
  }
}`

export const statusStyle: Record<ConnectionStatus, string> = {
  connected: 'bg-emerald-500',
  connecting: 'bg-sky-500',
  idle: 'bg-amber-400',
  disconnected: 'bg-red-500',
  error: 'bg-red-600',
}
