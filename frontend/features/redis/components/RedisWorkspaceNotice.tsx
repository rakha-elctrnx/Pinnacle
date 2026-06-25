interface RedisWorkspaceNoticeProps {
  host: string
  port: number
}

export function RedisWorkspaceNotice({ host, port }: RedisWorkspaceNoticeProps) {
  return (
    <section className="rounded-xl border border-dashed border-border-strong bg-bg-subtle p-4 text-body-secondary text-text-secondary">
      Redis connector requires a dedicated Redis client. Connection to {host}:{port}.
    </section>
  )
}
