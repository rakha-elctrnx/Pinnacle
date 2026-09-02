import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { formatTimestampValue } from '../store/tableEditStore'
// ── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_COL_WIDTH = 150
export const MIN_COL_WIDTH = 80
export const MAX_COL_WIDTH = 360
export const ESTIMATED_CHAR_WIDTH_PX = 8
export const COLUMN_HORIZONTAL_PADDING_PX = 32

// Data type categories for sizing
const DATE_TYPES = ['DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'DATETIME']

// ── Types ───────────────────────────────────────────────────────────────────

export interface ColumnResizerOptions {
  initialWidths: number[]
}

export interface ColumnResizerReturn {
  widths: number[]
  onMouseDown: (index: number, e: React.MouseEvent) => void
  syncWidths: (nextWidths: number[]) => void
  userSetWidths: number[]
  handleDoubleClick: (
    index: number,
    columnData: Record<string, unknown>[],
    columnName: string,
    dataType: string | undefined,
  ) => void
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useColumnResizer({
  initialWidths,
}: ColumnResizerOptions): ColumnResizerReturn {
  const [widths, setWidths] = useState<number[]>(() => [...initialWidths])
  const [userSetWidths, setUserSetWidths] = useState<number[]>(() =>
    Array(initialWidths.length).fill(-1),
  )

  // Reset state when initialWidths changes (table switch, data load).
  // Compared in a layout effect so refs are not read/written during render.
  const prevInitialRef = useRef<string>(initialWidths.join(','))
  const currentInitial = initialWidths.join(',')
  useLayoutEffect(() => {
    if (prevInitialRef.current !== currentInitial) {
      prevInitialRef.current = currentInitial
      setWidths([...initialWidths])
      setUserSetWidths(Array(initialWidths.length).fill(-1))
    }
  }, [currentInitial, initialWidths])
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const onMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      startXRef.current = e.clientX
      startWidthRef.current = widths[index] ?? DEFAULT_COL_WIDTH

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startXRef.current
        const newWidth = Math.min(
          MAX_COL_WIDTH,
          Math.max(MIN_COL_WIDTH, startWidthRef.current + delta),
        )
        setWidths((prev) => {
          const next = [...prev]
          next[index] = newWidth
          return next
        })
        // Mark as user-set
        setUserSetWidths((prev) => {
          const next = [...prev]
          next[index] = newWidth
          return next
        })
      }

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [widths],
  )

  /** Sync widths when auto-sized result changes. */
  const syncWidths = useCallback((nextWidths: number[]) => {
    setWidths((prev) => {
      if (prev.length !== nextWidths.length) return [...nextWidths]
      const hasDiff = prev.some((width, index) => width !== nextWidths[index])
      return hasDiff ? [...nextWidths] : prev
    })
  }, [])

  /** Auto-fit column to widest content */
  const autoFitColumn = useCallback(
    (
      index: number,
      columnData: Record<string, unknown>[],
      columnName: string,
      dataType: string | undefined,
    ) => {
      if (!columnData || columnData.length === 0) return

      const targetWidth = calculateColumnWidth(columnName, columnData, dataType)

      // Set the width
      setWidths((prev) => {
        const next = [...prev]
        next[index] = targetWidth
        return next
      })

      // Mark as user-set
      setUserSetWidths((prev) => {
        const next = [...prev]
        next[index] = targetWidth
        return next
      })
    },
    [],
  )

  /** Handle double-click on resize handle */
  const handleDoubleClick = useCallback(
    (
      index: number,
      columnData: Record<string, unknown>[],
      columnName: string,
      dataType: string | undefined,
    ) => {
      autoFitColumn(index, columnData, columnName, dataType)
    },
    [autoFitColumn],
  )

  return { widths, onMouseDown, syncWidths, userSetWidths, handleDoubleClick }
}

// ── Utility: Calculate auto column widths with data-type awareness ─────────

export interface AutoWidthOptions {
  columns: string[]
  previewRows: Record<string, unknown>[]
  columnsMetadata: Array<{ columnName: string; dataType: string }>
}

export function calculateColumnWidth(
  columnName: string,
  rows: Record<string, unknown>[],
  dataType?: string,
): number {
  const isTimestamp = dataType
    ? DATE_TYPES.some((t) => dataType.toUpperCase().startsWith(t))
    : false

  const maxValueLength = rows.reduce((longest, row) => {
    const val = row[columnName]
    if (val == null) return Math.max(longest, 6)
    const strVal = isTimestamp ? formatTimestampValue(String(val)) : String(val)
    return Math.max(longest, strVal.length)
  }, 0)

  const dataTypeLength = dataType?.length ?? 0
  const maxChars = Math.max(columnName.length, maxValueLength, dataTypeLength)

  const estimatedWidth =
    maxChars * ESTIMATED_CHAR_WIDTH_PX + COLUMN_HORIZONTAL_PADDING_PX

  return Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, estimatedWidth))
}

export function calculateAutoColumnWidths({
  columns,
  previewRows,
  columnsMetadata,
}: AutoWidthOptions): number[] {
  return columns.map((column) => {
    const columnMetadata = columnsMetadata.find((c) => c.columnName === column)
    return calculateColumnWidth(column, previewRows, columnMetadata?.dataType)
  })
}
