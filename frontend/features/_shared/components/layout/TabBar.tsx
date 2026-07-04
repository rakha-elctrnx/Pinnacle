import { createElement, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Code, Database, Table2, X } from 'lucide-react'
import { useTabStore } from '../../store/tabStore'
import { useDataExplorerContext } from '../../context/DataExplorerContext'
import type { Tab } from '../../store/tabStore'
import { getDatabaseIcon } from '../branding/DatasourceLogo'

/** Resolve the icon for a tab based on its page type. */
function TabIcon({ tab }: { tab: Tab }) {
  switch (tab.pageType) {
    case 'table':
      return <Table2 size={12} className="shrink-0" />
    case 'query':
      return <Code size={12} className="shrink-0" />
    case 'elastic-index':
      return <Database size={12} className="shrink-0" />
    default:
      return createElement(getDatabaseIcon(tab.type), { size: 12, className: 'shrink-0' })
  }
}

export function TabBar() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const activateTab = useTabStore((s) => s.activateTab)
  const closeTab = useTabStore((s) => s.closeTab)
  const navigate = useNavigate()
  const { setSelectedTreeNode } = useDataExplorerContext()

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

  function handleTabClick(tabId: string, route: string, treePath?: string) {
    activateTab(tabId)
    navigate(route)
    if (treePath) setSelectedTreeNode(treePath)
  }

  function handleClose(e: React.MouseEvent, tab: Tab) {
    e.stopPropagation()
    closeTab(tab.id)

    // Navigate to the new active tab's route, or '/' if no tabs remain.
    const state = useTabStore.getState()
    if (state.activeTabId) {
      const nextTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (nextTab) {
        navigate(nextTab.route)
        if (nextTab.treePath) setSelectedTreeNode(nextTab.treePath)
      }
    } else {
      setSelectedTreeNode(null)
      navigate('/')
    }
  }

  return (
    <div className="relative border-b border-border-default">
      <div
        ref={scrollRef}
        className="flex items-center overflow-x-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab.id, tab.route, tab.treePath)}
              className={`group/tab relative flex h-8 shrink-0 cursor-pointer items-center gap-1 px-3 text-caption transition-colors ${
                isActive
                  ? 'bg-bg-base text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <TabIcon tab={tab} />
              <span className="max-w-30 truncate">{tab.label}</span>
              {tab.pendingCount != null && tab.pendingCount > 0 && (
                <span className="inline-block h-2 w-2 rounded-full bg-primary shrink-0" />
              )}
              <X
                size={11}
                className={`shrink-0 rounded-sm transition-opacity ${
                  isActive
                    ? 'opacity-40 hover:bg-bg-hover hover:opacity-80'
                    : 'opacity-0 group-hover/tab:opacity-40 hover:opacity-80!'
                }`}
                onClick={(e) => handleClose(e, tab)}
              />
              {/* Active indicator — thin bottom border with slide-in transition. */}
              <span
                className={`absolute bottom-0 left-0 right-0 h-0.5 bg-primary transition-all duration-200 ease-out ${
                  isActive ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
                }`}
              />
            </button>
          )
        })}
      </div>

      {/* Gradient fade overlay — visible when tabs overflow and user hasn't scrolled to the end. */}
      {isOverflowing && !isScrolledToEnd && (
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-linear-to-l from-bg-base to-transparent"
        />
      )}
    </div>
  )
}
