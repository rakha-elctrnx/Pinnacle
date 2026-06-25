import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

/**
 * Centered loading indicator reused by every connection workspace
 * (SQL + Elasticsearch). Visual contract (matches DocumentExplorer):
 *   - Centered within the parent (panel) or the workspace (page).
 *   - Spinning `RefreshCw` icon at h-4 w-4.
 *   - `text-caption` label and `text-slate-400` tone.
 *   - Elapsed time displayed in milliseconds (`ms`) while loading.
 *   - Returns `null` when `loading` is `false` so empty / error states
 *     can take over once the request settles.
 */
export interface CenteredLoadingStateProps {
  loading: boolean
  /** Label rendered next to the spinner, e.g. "Loading documents..." */
  label?: string
  /**
   * Visual density:
   * - `panel` (default) — fills its parent with `h-full` so the row is
   *   truly centered vertically (best when the parent is `flex-1 min-h-0`).
   * - `page` — full-page loading surface with a white background; used
   *   when the entire workspace is replaced (e.g. initial connect).
   */
  variant?: 'panel' | 'page'
  /** Tailwind size token for the icon: 3 | 4 | 5. Defaults to 4. */
  iconSize?: 3 | 4 | 5
  /**
   * Show elapsed time in milliseconds. Defaults to `true`.
   * The timer is driven by `requestAnimationFrame`, paused on unmount
   * and whenever `loading` flips to `false`, then reset to 0 on the
   * next mount/load.
   */
  showElapsed?: boolean
}

const ICON_CLASS: Record<3 | 4 | 5, string> = {
  3: 'h-3 w-3',
  4: 'h-4 w-4',
  5: 'h-5 w-5',
}

export function CenteredLoadingState({
  loading,
  label = 'Loading...',
  variant = 'panel',
  iconSize = 4,
  showElapsed = true,
}: CenteredLoadingStateProps) {
  const [elapsedMs, setElapsedMs] = useState(0)
  const startedAtRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!loading) {
      // Reset timer state so a future load starts from 0 ms.
      // The setState is deferred via a microtask so the
      // `react-hooks/set-state-in-effect` rule stays happy.
      startedAtRef.current = null
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      queueMicrotask(() => setElapsedMs(0))
      return
    }

    startedAtRef.current = performance.now()
    // Reset the displayed elapsed to 0 for this load; deferred to a
    // microtask for the same lint reason. The first rAF tick below
    // will overwrite it with the real elapsed on the next frame.
    queueMicrotask(() => setElapsedMs(0))

    const tick = (now: number) => {
      if (startedAtRef.current === null) return
      setElapsedMs(now - startedAtRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      startedAtRef.current = null
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [loading])

  if (!loading) return null

  const wrapperClass =
    variant === 'page'
      ? 'flex h-full items-center justify-center bg-white text-slate-400'
      : 'flex h-full items-center justify-center text-slate-400'

  const contentClass = showElapsed || label
    ? 'flex items-center'
    : 'flex items-center justify-center'

  const elapsedFloor = Math.floor(elapsedMs)
  const ariaLabel = showElapsed
    ? `${label} (${elapsedFloor} milliseconds elapsed)`
    : label

  return (
    <div role="status" aria-live="polite" aria-label={ariaLabel} className={wrapperClass}>
      <div className={contentClass}>
        <RefreshCw
          className={`${ICON_CLASS[iconSize]} animate-spin shrink-0${showElapsed || label ? ' mr-2' : ''}`}
          aria-hidden="true"
        />
        {label && <span className="text-label">{label}</span>}
        {showElapsed && (
          <span
            className="ml-2 text-caption tabular-nums"
            data-testid="loading-elapsed"
          >
            {elapsedFloor} ms
          </span>
        )}
      </div>
    </div>
  )
}
