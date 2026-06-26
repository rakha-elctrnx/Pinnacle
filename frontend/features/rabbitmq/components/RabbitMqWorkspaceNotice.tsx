interface RabbitMqWorkspaceNoticeProps {
  host: string
  port: number
}

export function RabbitMqWorkspaceNotice({ host, port }: RabbitMqWorkspaceNoticeProps) {
  return (
    <section className="rounded-xl border border-dashed border-border-strong bg-bg-subtle p-4 text-body-secondary text-text-secondary">
      RabbitMQ connector requires the AMQP management API. Connection to {host}:{port}.
    </section>
  )
}
