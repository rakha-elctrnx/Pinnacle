interface RedisWorkspaceNoticeProps {
  host: string
  port: number
}

export function RedisWorkspaceNotice({ host, port }: RedisWorkspaceNoticeProps) {
  return (
    <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
      Redis connector requires a dedicated Redis client. Connection to {host}:{port}.
    </section>
  )
}
