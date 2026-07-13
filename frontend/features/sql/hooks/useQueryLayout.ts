import { useCallback, useRef, useState } from 'react'

export function useQueryLayout(initialHeight = 240) {
  const [resultHeight, setResultHeight] = useState(initialHeight)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragRef.current = { startY: e.clientY, startH: resultHeight }
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return
        const delta = dragRef.current.startY - ev.clientY
        setResultHeight(
          Math.max(80, Math.min(600, dragRef.current.startH + delta)),
        )
      }
      const onUp = () => {
        dragRef.current = null
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [resultHeight],
  )

  return {
    resultHeight,
    handleResizeMouseDown,
  }
}
