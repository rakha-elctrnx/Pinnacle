import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight, ChevronRight, Database } from 'lucide-react'

interface ListItem {
  name: string
  subtitle?: string
  icon: LucideIcon
}

const connectionPreview: ListItem[] = [
  { name: 'PostgreSQL', icon: Database },
  { name: 'MySQL', icon: Database },
  { name: 'Elasticsearch', icon: Database },
  { name: 'Redis', icon: Database },
  { name: 'RabbitMQ', icon: Database },
]

export function HomePage() {

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <p className="mb-3 text-2xl font-semibold text-blue-600">{'>'}_</p>
        <h2 className="text-4xl font-semibold tracking-tight text-slate-900">
          Welcome to <span className="text-blue-600">Pinnacle</span>
        </h2>
        <p className="mt-3 text-xl text-slate-500">Data explorer for developers — fast, local, and private.</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-1 max-w-xl">
        <article className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-blue-600">
              <Database size={20} />
            </div>
            <div>
              <h3 className="text-3xl font-semibold text-slate-900">Data Explorer</h3>
              <p className="text-sm text-slate-500">Explore and manage your data</p>
            </div>
            <ChevronRight className="ml-auto text-slate-400" size={18} />
          </div>
          <ul>
            {connectionPreview.map((item) => (
              <li key={item.name} className="flex items-center gap-3 border-b border-slate-200 px-5 py-3.5 last:border-none">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-500">
                  <item.icon size={16} />
                </span>
                <span className="text-sm font-medium text-slate-700">{item.name}</span>
                <ChevronRight className="ml-auto text-slate-300" size={16} />
              </li>
            ))}
          </ul>
          <Link to="/data-explorer" className="inline-flex items-center gap-2 px-5 py-4 text-sm font-semibold text-blue-600">
            View all connections
            <ArrowRight size={16} />
          </Link>
        </article>
      </section>

    </div>
  )
}