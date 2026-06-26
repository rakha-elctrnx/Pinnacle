import { createElement, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Code, Database, Table2, X } from 'lucide-react'
import { useTabStore } from '../store/tabStore'
import type { Tab } from '../store/tabStore'
import { getDatabaseIcon } from './DatasourceLogo'

/** Resolve the icon for a tab based on its page type. */
function TabIcon({ tab }: { tab: Tab }) {
  switch (tab.pageType) {
    case 'table':
      return <Table2 size={14} className="shrink-0" />
    case 'query':
      return <Code size={14} className="shrink-0" />
    case 'elastic-index':
      return <Database size={14} className="shrink-0" />
    default:
      return createElement(getDatabaseIcon(tab.type), { size: 14, className: 'shrink-0' })
  }
}

export function TabBar() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const activateTab = useTabStore((s) => s.activateTab)
  const closeTab = useTabStore((s) => s.closeTab)
  const navigate = useNavigate()

  // Overflow detection for gradient fade indicator.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [isScrolledToEnd, setIsScrolledToEnd] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const check = () => {
      setIsOverflowing(el.scrollWidth > el.clientWidth + 1)
      setIsScrolledToEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2)
    }

    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    el.addEventListener('scroll', check, { passive: true })

    return () => {
      observer.disconnect()
      el.removeEventListener('scroll', check)
    }
  }, [tabs.length])

  if (tabs.length === 0) return null

  function handleTabClick(tabId: string, route: string) {
    activateTab(tabId)
    navigate(route)
  }

  function handleClose(e: React.MouseEvent, tab: Tab) {
    e.stopPropagation()
    closeTab(tab.id)

    // Navigate to the new active tab's route, or '/' if no tabs remain.
    const state = useTabStore.getState()
    if (state.activeTabId) {
      const nextTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (nextTab) navigate(nextTab.route)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex h-9 items-center gap-0.5 overflow-x-auto px-2 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab.id, tab.route)}
              className={`group/tab flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-label transition-colors ${
                isActive
                  ? 'bg-primary-subtle text-primary'
                  : 'text-text-muted hover:bg-bg-subtle'
              }`}
            >
              <TabIcon tab={tab} />
              <span className="max-w-[120px] truncate">{tab.label}</span>
              <X
                size={12}
                className={`shrink-0 cursor-pointer transition-opacity ${
                  isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover/tab:opacity-60 hover:!opacity-100'
                }`}
                onClick={(e) => handleClose(e, tab)}
              />
            </button>
          )
        })}
      </div>

      {/* Gradient fade overlay — visible when tabs overflow and user hasn't scrolled to the end. */}
      {isOverflowing && !isScrolledToEnd && (
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-bg-base to-transparent"
        />
      )}
    </div>
  )
}
