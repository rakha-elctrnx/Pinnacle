import { createElement, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Code, Database, Table2, X } from 'lucide-react'
import { useTabStore } from '../../store/tabStore'
import { useDataExplorerContext } from '../../context/DataExplorerContext'
import { useTableDetailCacheStore } from '../../../sql/store/tableDetailCacheStore'
import type { Tab } from '../../store/tabStore'
import { getDatabaseIcon } from '../branding/DatasourceLogo'

function TabIcon({ tab }: { tab: Tab }) {
  switch (tab.pageType) {
    case 'table':
      return <Table2 size={12} className="shrink-0" />
    case 'query':
      return <Code size={12} className="shrink-0" />
    case 'elastic-index':
      return <Database size={12} className="shrink-0" />
    default:
      return createElement(getDatabaseIcon(tab.type), {
        size: 12,
        className: 'shrink-0',
      })
  }
}

export function TabBar() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const activateTab = useTabStore((s) => s.activateTab)
  const closeTab = useTabStore((s) => s.closeTab)
  const navigate = useNavigate()
  const { setSelectedTreeNode } = useDataExplorerContext()

  // Overflow detection.
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
    const ro = new ResizeObserver(check)
    ro.observe(el)
    el.addEventListener('scroll', check, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', check)
    }
  }, [tabs.length])

  const reorderTabsRef = useRef(useTabStore.getState().reorderTabs)
  useEffect(() => {
    const unsub = useTabStore.subscribe((s) => {
      reorderTabsRef.current = s.reorderTabs
    })
    return unsub
  }, [])

  const suppressClickRef = useRef(false)
  const ghostRef = useRef<HTMLElement | null>(null)

  if (tabs.length === 0) return null

  function handleClose(e: React.MouseEvent, tab: Tab) {
    e.stopPropagation()
    useTableDetailCacheStore.getState().clear(tab.id)
    closeTab(tab.id)

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

  /** ── Pointer-capture drag with floating clone ──────────────────────
   *
   *  When drag begins, we clone the tab element and attach it to
   *  document.body as a position:fixed overlay. The clone moves with the
   *  pointer, giving the feel of "grabbing" the tab. The original stays
   *  in the tab bar as a dim placeholder.
   */

  function hitTest(x: number): number {
    const parent = scrollRef.current
    if (!parent) return -1
    for (let i = 0; i < parent.children.length; i++) {
      const r = parent.children[i].getBoundingClientRect()
      if (x >= r.left - 4 && x <= r.right + 4) return i
    }
    return -1
  }

  function clearDropIndicators() {
    const parent = scrollRef.current
    if (!parent) return
    for (let i = 0; i < parent.children.length; i++) {
      const el = parent.children[i] as HTMLElement
      el.style.outline = ''
      el.style.outlineOffset = ''
    }
  }

  function createGhost(el: HTMLElement): HTMLElement {
    const ghost = el.cloneNode(true) as HTMLElement
    const cs = getComputedStyle(el)
    ghost.style.position = 'fixed'
    ghost.style.zIndex = '9999'
    ghost.style.pointerEvents = 'none'
    ghost.style.transform = 'scale(1.05) rotate(2deg)'
    ghost.style.boxShadow = '0 8px 28px rgba(0,0,0,0.4)'
    ghost.style.borderRadius = '8px'
    ghost.style.transition = 'none'
    ghost.style.opacity = '0.95'
    ghost.style.width = `${el.offsetWidth}px`
    ghost.style.height = `${el.offsetHeight}px`
    // Copy computed background so the ghost looks identical regardless of DOM position.
    ghost.style.background = cs.background
    ghost.style.border = cs.border
    return ghost
  }

  function handlePointerDown(e: React.PointerEvent, fromIndex: number) {
    if ((e.target as HTMLElement).closest('[data-close-btn]')) return
    if (e.button !== 0) return

    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)

    const rect = el.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top
    const startX = e.clientX
    const startY = e.clientY
    let isDrag = false

    function onMove(ev: PointerEvent) {
      if (!isDrag) {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
        isDrag = true

        // Create and show the floating ghost.
        const ghost = createGhost(el)
        ghost.style.left = `${ev.clientX - offsetX}px`
        ghost.style.top = `${ev.clientY - offsetY}px`
        document.body.appendChild(ghost)
        ghostRef.current = ghost

        // Dim the original placeholder.
        el.style.opacity = '0.2'
      }

      // Move the ghost to follow the pointer.
      if (ghostRef.current) {
        ghostRef.current.style.left = `${ev.clientX - offsetX}px`
        ghostRef.current.style.top = `${ev.clientY - offsetY}px`
      }

      // Highlight the tab under the pointer.
      const idx = hitTest(ev.clientX)
      clearDropIndicators()
      if (idx >= 0 && idx !== fromIndex) {
        const target = scrollRef.current?.children[idx] as HTMLElement
        if (target) {
          target.style.outline = '2px solid var(--color-primary, #009ddc)'
          target.style.outlineOffset = '-2px'
        }
      }
    }

    function onUp(ev: PointerEvent) {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      document.body.style.userSelect = ''
      document.body.style.webkitUserSelect = ''
      clearDropIndicators()
      el.style.opacity = ''

      // Remove the ghost.
      if (ghostRef.current) {
        ghostRef.current.remove()
        ghostRef.current = null
      }

      if (isDrag) {
        suppressClickRef.current = true

        const toIdx = hitTest(ev.clientX)
        if (toIdx >= 0 && toIdx !== fromIndex) {
          requestAnimationFrame(() => {
            reorderTabsRef.current(fromIndex, toIdx)
          })
        }
      }
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
  }

  function handleTabClick(tab: Tab) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    activateTab(tab.id)
    navigate(tab.route)
    if (tab.treePath) setSelectedTreeNode(tab.treePath)
  }

  return (
    <div className="relative border-b border-border-default select-none">
      <div
        ref={scrollRef}
        className="flex items-center overflow-x-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId

          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              onPointerDown={(e) => handlePointerDown(e, index)}
              onClick={() => handleTabClick(tab)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleTabClick(tab)
                }
              }}
              className={`group/tab relative flex h-8 shrink-0 cursor-pointer active:cursor-grabbing items-center gap-2 px-3 text-caption transition-colors ${
                isActive
                  ? 'bg-bg-base text-text-primary bg-primary/10 dark:bg-white/5'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <TabIcon tab={tab} />
              <span className="max-w-30 truncate">{tab.label}</span>
              {tab.pendingCount != null && tab.pendingCount > 0 && (
                <span className="z-10 inline-block h-[8px] w-[8px] rounded-full absolute right-3.5 group-hover/tab:invisible bg-primary shrink-0" />
              )}
              <X
                size={11}
                data-close-btn
                className={`shrink-0 rounded-sm ${
                  isActive
                    ? 'opacity-40 hover:bg-bg-hover hover:opacity-100'
                    : 'opacity-0 group-hover/tab:opacity-80 hover:opacity-100!'
                }`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => handleClose(e, tab)}
              />
              {/* <span
                className={`absolute bottom-0 left-0 right-0 h-0.5 bg-primary transition-all duration-200 ease-out ${
                  isActive ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
                }`}
              /> */}
            </div>
          )
        })}
      </div>

      {isOverflowing && !isScrolledToEnd && (
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-linear-to-l from-bg-base to-transparent"
        />
      )}
    </div>
  )
}
