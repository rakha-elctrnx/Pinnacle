import type { ConnectionType } from './types/domain'
import type { DatabaseTypeOption, ConnectionStatus } from './types/shared'

export const databaseTypeOptions: DatabaseTypeOption[] = [
  {
    label: 'PostgreSQL',
    value: 'postgresql',
    logoSrc: 'https://cdn.simpleicons.org/postgresql/336791',
    hint: 'Relational database',
  },
  {
    label: 'MySQL',
    value: 'mysql',
    logoSrc: 'https://cdn.simpleicons.org/mysql/4479A1',
    hint: 'Relational database',
  },
  {
    label: 'Redis',
    value: 'redis',
    logoSrc: 'https://cdn.simpleicons.org/redis/DC382D',
    hint: 'In-memory data store',
  },
  {
    label: 'RabbitMQ',
    value: 'rabbitmq',
    logoSrc: 'https://cdn.simpleicons.org/rabbitmq/FF6600',
    hint: 'Message broker',
  },
  {
    label: 'Elasticsearch',
    value: 'elasticsearch',
    logoSrc: 'https://cdn.simpleicons.org/elasticsearch/005571',
    hint: 'Search and analytics',
  },
  {
    label: 'MongoDB',
    value: 'mongodb',
    logoSrc: 'https://cdn.simpleicons.org/mongodb/47A248',
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