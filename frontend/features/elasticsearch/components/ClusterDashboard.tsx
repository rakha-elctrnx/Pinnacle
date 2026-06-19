import { useMemo } from 'react'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import type { ElasticClusterHealth, ElasticIndex } from '../types/elasticsearch'
import {
  Server,
  Database,
  FileText,
  HardDrive,
  Cpu,
  MemoryStick,
  Activity,
  Layers,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'

interface Props {
  connection: ConnectionPayload
  health: ElasticClusterHealth | null
  indices: ElasticIndex[]
}

/* ── helpers ─────────────────────────────────────────────────────── */

function healthColor(status: string | undefined): string {
  if (status === 'green') return 'text-emerald-600'
  if (status === 'yellow') return 'text-amber-500'
  if (status === 'red') return 'text-red-500'
  return 'text-slate-500'
}

function healthBg(status: string | undefined): string {
  if (status === 'green') return 'bg-emerald-50 border-emerald-200'
  if (status === 'yellow') return 'bg-amber-50 border-amber-200'
  if (status === 'red') return 'bg-red-50 border-red-200'
  return 'bg-slate-50 border-slate-200'
}

function healthDot(status: string | undefined): string {
  if (status === 'green') return 'bg-emerald-500'
  if (status === 'yellow') return 'bg-amber-400'
  if (status === 'red') return 'bg-red-500'
  return 'bg-slate-400'
}

/** Parse a human-readable size string like "1.2mb" or "345kb" into bytes. */
function parseSize(size: string | undefined): number {
  if (!size) return 0
  const s = size.trim().toLowerCase()
  const match = s.match(/^([\d.]+)\s*(b|kb|mb|gb|tb|pb)$/i)
  if (!match) return 0
  const val = parseFloat(match[1])
  const unit = match[2]
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 ** 2,
    gb: 1024 ** 3,
    tb: 1024 ** 4,
    pb: 1024 ** 5,
  }
  return val * (multipliers[unit] ?? 1)
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const val = bytes / 1024 ** i
  return `${val.toFixed(val >= 100 ? 0 : 1)} ${units[i]}`
}

function formatDocs(count: number): string {
  if (count >= 1e12) return `${(count / 1e12).toFixed(1)}T`
  if (count >= 1e9) return `${(count / 1e9).toFixed(1)}B`
  if (count >= 1e6) return `${(count / 1e6).toFixed(1)}M`
  if (count >= 1e3) return `${(count / 1e3).toFixed(1)}K`
  return count.toLocaleString()
}

/* ── component ───────────────────────────────────────────────────── */

export function ClusterDashboard({ health, indices }: Props) {
  /* computed values */
  const totalDocs = useMemo(
    () =>
      indices.reduce((sum, idx) => {
        const count = parseInt(idx['docs.count'] ?? '0', 10)
        return sum + (isNaN(count) ? 0 : count)
      }, 0),
    [indices],
  )

  const totalStorage = useMemo(
    () =>
      indices.reduce((sum, idx) => sum + parseSize(idx['store.size']), 0),
    [indices],
  )

  const topIndices = useMemo(
    () =>
      [...indices]
        .sort((a, b) => {
          const da = parseInt(a['docs.count'] ?? '0', 10) || 0
          const db = parseInt(b['docs.count'] ?? '0', 10) || 0
          return db - da
        })
        .slice(0, 5),
    [indices],
  )

  const maxDocs = useMemo(() => {
    const max = Math.max(
      ...topIndices.map((i) => parseInt(i['docs.count'] ?? '0', 10) || 0),
      1,
    )
    return max
  }, [topIndices])

  /* mock recent events derived from data */
  const recentEvents = useMemo(() => {
    const events: { icon: typeof CheckCircle2; color: string; text: string }[] = []
    if (health?.status === 'green') {
      events.push({
        icon: ShieldCheck,
        color: 'text-emerald-500',
        text: `Cluster health is ${health.status}`,
      })
    }
    if (health?.relocating_shards && health.relocating_shards > 0) {
      events.push({
        icon: RotateCcw,
        color: 'text-amber-500',
        text: `${health.relocating_shards} shard(s) relocating`,
      })
    }
    if (health?.initializing_shards && health.initializing_shards > 0) {
      events.push({
        icon: AlertCircle,
        color: 'text-sky-500',
        text: `${health.initializing_shards} shard(s) initializing`,
      })
    }
    if (health?.unassigned_shards && health.unassigned_shards > 0) {
      events.push({
        icon: AlertCircle,
        color: 'text-red-500',
        text: `${health.unassigned_shards} unassigned shard(s)`,
      })
    }
    indices.slice(0, 5).forEach((idx) => {
      events.push({
        icon: Database,
        color: 'text-slate-500',
        text: `Index "${idx.index}" – ${formatDocs(parseInt(idx['docs.count'] ?? '0', 10) || 0)} docs`,
      })
    })
    return events
  }, [health, indices])

  /* node distribution mock (equal distribution since we don't have per-node data) */
  const nodeCount = health?.number_of_data_nodes ?? health?.number_of_nodes ?? 0
  const nodeDistribution = useMemo(() => {
    if (nodeCount === 0) return []
    const perNode = Math.round(100 / nodeCount)
    return Array.from({ length: Math.min(nodeCount, 8) }, (_, i) => ({
      name: `node-${i + 1}`,
      pct: i === Math.min(nodeCount, 8) - 1 ? 100 - perNode * (Math.min(nodeCount, 8) - 1) : perNode,
    }))
  }, [nodeCount])

  /* stat cards */
  const row1Cards = [
    {
      label: 'Nodes',
      value: health?.number_of_nodes?.toString() ?? '-',
      icon: Server,
      accent: 'bg-sky-50 text-sky-600',
    },
    {
      label: 'Indices',
      value: indices.length.toString(),
      icon: Database,
      accent: 'bg-violet-50 text-violet-600',
    },
    {
      label: 'Documents',
      value: formatDocs(totalDocs),
      icon: FileText,
      accent: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'Storage',
      value: formatBytes(totalStorage),
      icon: HardDrive,
      accent: 'bg-rose-50 text-rose-600',
    },
  ]

  const row2Cards = [
    {
      label: 'CPU',
      value: '-',
      icon: Cpu,
      accent: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Memory',
      value: '-',
      icon: MemoryStick,
      accent: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'JVM Heap',
      value: '-',
      icon: Layers,
      accent: 'bg-orange-50 text-orange-600',
    },
    {
      label: 'Shards',
      value: health?.active_shards?.toLocaleString() ?? '-',
      icon: Activity,
      accent: 'bg-pink-50 text-pink-600',
    },
  ]

  /* ── render ──────────────────────────────────────────────────── */
  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full">
      {/* header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Cluster Dashboard</h2>
        {health && (
          <div
            className={`flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-medium ${healthBg(health.status)}`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${healthDot(health.status)}`} />
            <span className={healthColor(health.status)}>{health.cluster_name}</span>
          </div>
        )}
      </div>

      {/* ── Row 1: primary stats ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {row1Cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-4"
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.accent}`}>
              <card.icon className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {card.label}
              </span>
              <span className="text-xl font-bold text-slate-800">{card.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Row 2: secondary stats ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {row2Cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-4"
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.accent}`}>
              <card.icon className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {card.label}
              </span>
              <span className="text-xl font-bold text-slate-800">{card.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Row 3: Cluster Health + Storage Growth ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Cluster Health */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Cluster Health</h3>
          <div className="flex flex-col items-center justify-center gap-3 py-6">
            <div
              className={`flex h-20 w-20 items-center justify-center rounded-full ${healthBg(health?.status)}`}
            >
              <span className={`text-2xl font-bold ${healthColor(health?.status)}`}>
                {health?.status?.toUpperCase() ?? '-'}
              </span>
            </div>
            <span className="text-sm text-slate-500">
              {health?.status === 'green'
                ? '100% Healthy'
                : health?.status === 'yellow'
                  ? 'Partially Available'
                  : health?.status === 'red'
                    ? 'Degraded'
                    : 'Unknown'}
            </span>
          </div>
          {/* mini health details */}
          {health && (
            <div className="grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
              <div className="text-center">
                <span className="block text-lg font-bold text-slate-800">{health.active_primary_shards}</span>
                <span className="text-xs text-slate-500">Primary</span>
              </div>
              <div className="text-center">
                <span className="block text-lg font-bold text-slate-800">{health.active_shards}</span>
                <span className="text-xs text-slate-500">Active</span>
              </div>
              <div className="text-center">
                <span className="block text-lg font-bold text-slate-800">{health.unassigned_shards}</span>
                <span className="text-xs text-slate-500">Unassigned</span>
              </div>
            </div>
          )}
        </div>

        {/* Storage Growth (simple CSS line chart placeholder) */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">Storage Growth</h3>
          </div>
          <div className="flex items-end justify-between gap-1 h-40 px-2">
            {indices.slice(0, 10).map((idx) => {
              const size = parseSize(idx['store.size'])
              const maxSize = Math.max(...indices.map((x) => parseSize(x['store.size'])), 1)
              const pct = Math.max((size / maxSize) * 100, 4)
              return (
                <div key={idx.uuid} className="flex flex-col items-center gap-1 flex-1">
                  <div className="w-full flex items-end" style={{ height: '120px' }}>
                    <div
                      className="w-full rounded-t-sm bg-sky-400/70 transition-all"
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 truncate max-w-full text-center">
                    {idx.index.length > 8 ? idx.index.slice(0, 8) + '…' : idx.index}
                  </span>
                </div>
              )
            })}
            {indices.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                No index data
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 4: Top Indices + Node Distribution ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Top Indices */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Top Indices</h3>
          <div className="space-y-3">
            {topIndices.map((idx) => {
              const docs = parseInt(idx['docs.count'] ?? '0', 10) || 0
              const pct = (docs / maxDocs) * 100
              return (
                <div key={idx.uuid} className="flex items-center gap-3">
                  <span className="w-32 truncate text-sm text-slate-700 font-medium">{idx.index}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-xs text-slate-500 tabular-nums">
                    {formatDocs(docs)}
                  </span>
                </div>
              )
            })}
            {topIndices.length === 0 && (
              <p className="text-sm text-slate-400">No indices available</p>
            )}
          </div>
        </div>

        {/* Node Distribution */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Node Distribution</h3>
          <div className="space-y-3">
            {nodeDistribution.map((node) => (
              <div key={node.name} className="flex items-center gap-3">
                <span className="w-20 text-sm text-slate-700 font-medium">{node.name}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-all"
                    style={{ width: `${node.pct}%` }}
                  />
                </div>
                <span className="w-10 text-right text-xs text-slate-500 tabular-nums">
                  {node.pct}%
                </span>
              </div>
            ))}
            {nodeDistribution.length === 0 && (
              <p className="text-sm text-slate-400">No node data available</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 5: Recent Events ── */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <Clock className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Recent Events</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {recentEvents.map((event, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <event.icon className={`h-4 w-4 shrink-0 ${event.color}`} />
              <span className="text-sm text-slate-700">{event.text}</span>
            </div>
          ))}
          {recentEvents.length === 0 && (
            <div className="px-5 py-6 text-center text-sm text-slate-400">
              No recent events
            </div>
          )}
        </div>
      </div>
    </div>
  )
}