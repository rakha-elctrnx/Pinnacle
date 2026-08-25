import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

interface LoadingModalDialogProps {
  open: boolean
  label?: string
}

export function LoadingModalDialog({
  open,
  label = 'Loading table data...',
}: LoadingModalDialogProps) {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (!open) return
    const start = performance.now()
    const timer = setInterval(() => {
      setElapsedMs(Math.floor(performance.now() - start))
    }, 50)
    return () => {
      clearInterval(timer)
      setElapsedMs(0)
    }
  }, [open])
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/15 backdrop-blur-[1px] transition-opacity"
    >
      <div className="flex items-center justify-center gap-2.5 rounded-lg border border-border-default/60 bg-bg-base/80 px-4 py-2.5 shadow-lg backdrop-blur-md ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-150 select-none">
        <RefreshCw size={14} className="animate-spin text-primary shrink-0" />
        <span className="text-caption font-medium text-text-primary">{label}</span>
        <span className="text-micro font-mono text-text-muted tabular-nums">
          ({elapsedMs}ms)
        </span>
      </div>
    </div>
  )
}
