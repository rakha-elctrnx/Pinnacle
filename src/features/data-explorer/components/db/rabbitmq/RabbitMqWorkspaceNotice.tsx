interface RabbitMqWorkspaceNoticeProps {
  host: string
  port: number
}

export function RabbitMqWorkspaceNotice({ host, port }: RabbitMqWorkspaceNoticeProps) {
  return (
    <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
      RabbitMQ connector requires the AMQP management API. Connection to {host}:{port}.
    </section>
  )
}
