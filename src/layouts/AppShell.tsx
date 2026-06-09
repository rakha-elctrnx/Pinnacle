import type { LucideIcon } from 'lucide-react'
import {
  Database,
  Ellipsis,
  Info,
  Settings,
  Sun,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

const navItems: NavItem[] = [
  { to: '/data-explorer', label: 'Data Explorer', icon: Database },
]

const dropdownItems = [
  { to: '/settings', label: 'Settings', icon: Settings },
  { label: 'About', icon: Info },
]

function NavItemButton({ item }: { item: NavItem }) {
  const Icon = item.icon

  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        [
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition',
          isActive ? 'bg-blue-100 text-blue-600 font-medium' : 'text-slate-600 hover:bg-slate-100',
        ].join(' ')
      }
    >
      <Icon size={17} />
      <span>{item.label}</span>
    </NavLink>
  )
}

export function AppShell() {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const handleDropdownClick = () => {
    setIsDropdownOpen(!isDropdownOpen)
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex h-screen w-full flex-col border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.06)]">
        <header className="flex h-16 items-center border-b border-slate-200 px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white shadow-sm">
              <span className="text-lg font-semibold">{'>'}_</span>
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900">Pinnacle</p>
              <p className="text-xs text-slate-500">Data Explorer</p>
            </div>
          </div>

          <nav className="ml-8 flex items-center gap-1">
            {navItems.map((item) => (
              <NavItemButton key={item.to} item={item} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 text-slate-500">
            <button type="button" className="rounded-lg p-1.5 hover:bg-slate-100" aria-label="Theme">
              <Sun size={17} />
            </button>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={handleDropdownClick}
                className="rounded-lg p-1.5 hover:bg-slate-100"
                aria-label="More options"
              >
                <Ellipsis size={17} />
              </button>
              {isDropdownOpen && (
                <div className="absolute right-0 mt-1 w-40 rounded-lg border border-slate-200 bg-white shadow-lg">
                  {dropdownItems.map((item, idx) => {
                    const Icon = item.icon
                    if (item.to) {
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          onClick={() => setIsDropdownOpen(false)}
                          className={({ isActive }) =>
                            [
                              'flex items-center gap-3 px-4 py-2.5 text-sm transition',
                              idx !== dropdownItems.length - 1 ? 'border-b border-slate-100' : '',
                              isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50',
                            ].join(' ')
                          }
                        >
                          <Icon size={16} />
                          <span>{item.label}</span>
                        </NavLink>
                      )
                    }
                    return (
                      <button
                        key={item.label}
                        type="button"
                        className={[
                          'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition',
                          idx !== dropdownItems.length - 1 ? 'border-b border-slate-100' : '',
                          'text-slate-600 hover:bg-slate-50',
                        ].join(' ')}
                      >
                        <Icon size={16} />
                        <span>{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}