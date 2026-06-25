import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

interface CustomTitlebarProps {
  title: string
}

/**
 * Reusable macOS-style custom titlebar for Tauri overlay windows.
 *
 * Renders a draggable region with traffic light placeholders that
 * reflect the window's focus state (colored when focused, grayed
 * out when inactive).
 *
 * Usage:
 * ```tsx
 * <section className="flex flex-col h-full">
 *   <CustomTitlebar title="My Window" />
 *   <div className="flex-1 overflow-y-auto">…</div>
 * </section>
 * ```
 */
export function CustomTitlebar({ title }: CustomTitlebarProps) {
  const [isFocused, setIsFocused] = useState(true)

  useEffect(() => {
    const win = getCurrentWindow()
    const onFocus = win.onFocusChanged((e) => setIsFocused(e.payload))
    win.isFocused().then(setIsFocused)
    return () => { onFocus.then((u) => u()) }
  }, [])

  return (
    <div
      data-tauri-drag-region
      className="relative flex h-8 shrink-0 items-center border-b border-border-default px-3"
    >
      {/* macOS traffic light placeholder */}
      <div className="pointer-events-none flex w-17 shrink-0 items-center gap-2 pl-0.75">
        {isFocused ? (
          <>
            <span className="h-3 w-3 rounded-full bg-[#FF5F57] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.12)]" />
            <span className="h-3 w-3 rounded-full bg-outline-variant shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-border-strong)_35%,transparent)]" />
            <span className="h-3 w-3 rounded-full bg-[#28C840] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.12)]" />
          </>
        ) : (
          <>
            <span className="h-3 w-3 rounded-full bg-border-default shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-border-strong)_35%,transparent)]" />
            <span className="h-3 w-3 rounded-full bg-border-default shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-border-strong)_35%,transparent)]" />
            <span className="h-3 w-3 rounded-full bg-border-default shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-border-strong)_35%,transparent)]" />
          </>
        )}
      </div>
      <span className="pointer-events-none select-none text-xs font-medium text-text-primary/80 absolute inset-0 flex items-center justify-center">
        {title}
      </span>
    </div>
  )
}
