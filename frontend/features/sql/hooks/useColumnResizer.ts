import { useCallback, useRef, useState } from 'react'

// ── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_COL_WIDTH = 150
export const MIN_COL_WIDTH = 80
export const MAX_COL_WIDTH = 360
export const ESTIMATED_CHAR_WIDTH_PX = 8
export const COLUMN_HORIZONTAL_PADDING_PX = 32

// Data type categories for sizing
const BOOLEAN_TYPES = ['BOOLEAN', 'BOOL']
const DATE_TYPES = ['DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'DATETIME']
const NUMERIC_TYPES = [
  'INT',
  'INTEGER',
  'BIGINT',
  'SMALLINT',
  'DECIMAL',
  'NUMERIC',
  'FLOAT',
  'DOUBLE',
  'REAL',
  'MONEY',
]
const TEXT_TYPES = [
  'VARCHAR',
  'TEXT',
  'CHAR',
  'NVARCHAR',
  'NCHAR',
  'CLOB',
  'BLOB',
]
const JSON_TYPES = ['JSON', 'JSONB']
const UUID_TYPES = ['UUID']

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

  // Reset state when initialWidths changes (table switch, data load)
  const prevInitialRef = useRef<string>(initialWidths.join(','))
  const currentInitial = initialWidths.join(',')
  if (prevInitialRef.current !== currentInitial) {
    prevInitialRef.current = currentInitial
    setWidths([...initialWidths])
    setUserSetWidths(Array(initialWidths.length).fill(-1))
  }
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

      // Calculate header width (column name + data type below it)
      const dataTypeLength = dataType?.length ?? 0
      const headerWidth = Math.max(
        Math.max(columnName.length, dataTypeLength) * ESTIMATED_CHAR_WIDTH_PX +
          COLUMN_HORIZONTAL_PADDING_PX,
        MIN_COL_WIDTH,
      )

      // Calculate content width based on data type
      let maxWidth = headerWidth

      if (dataType) {
        const upperType = dataType.toUpperCase()

        // Boolean types: fixed width
        if (BOOLEAN_TYPES.some((t) => upperType.startsWith(t))) {
          maxWidth = 80
        }
        // Date/time types: fixed width
        else if (DATE_TYPES.some((t) => upperType.startsWith(t))) {
          maxWidth = 120
        }
        // Numeric types: medium width
        else if (NUMERIC_TYPES.some((t) => upperType.startsWith(t))) {
          maxWidth = 120
        }
        // JSON types: medium width
        else if (JSON_TYPES.some((t) => upperType.startsWith(t))) {
          maxWidth = 140
        }
        // UUID types: fixed width
        else if (UUID_TYPES.some((t) => upperType.startsWith(t))) {
          maxWidth = 160
        }
        // Text types: calculate based on content
        else if (TEXT_TYPES.some((t) => upperType.startsWith(t))) {
          const maxContentLength = Math.max(
            ...columnData.map((row) => {
              const value = row[columnName]
              return value == null ? 6 : String(value).length // '(null)' is 6 chars
            }),
          )
          maxWidth = Math.max(
            headerWidth,
            maxContentLength * ESTIMATED_CHAR_WIDTH_PX +
              COLUMN_HORIZONTAL_PADDING_PX,
          )
        }
        // Default: flexible width based on content
        else {
          const maxContentLength = Math.max(
            ...columnData.map((row) => {
              const value = row[columnName]
              return value == null ? 6 : String(value).length
            }),
          )
          maxWidth = Math.max(
            headerWidth,
            maxContentLength * ESTIMATED_CHAR_WIDTH_PX +
              COLUMN_HORIZONTAL_PADDING_PX,
          )
        }
      }

      // Set the width
      setWidths((prev) => {
        const next = [...prev]
        next[index] = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, maxWidth))
        return next
      })

      // Mark as user-set
      setUserSetWidths((prev) => {
        const next = [...prev]
        next[index] = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, maxWidth))
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

export function calculateAutoColumnWidths({
  columns,
  previewRows,
  columnsMetadata,
}: AutoWidthOptions): number[] {
  return columns.map((column) => {
    // Get data type from metadata if available
    const columnMetadata = columnsMetadata.find((c) => c.columnName === column)
    const dataType = columnMetadata?.dataType

    const maxValueLength = previewRows.reduce((longest, row) => {
      const valueText = row[column] == null ? '(null)' : String(row[column])
      return Math.max(longest, valueText.length)
    }, 0)

    const dataTypeLength = dataType?.length ?? 0
    const maxChars = Math.max(column.length, maxValueLength, dataTypeLength)

    let estimatedWidth =
      maxChars * ESTIMATED_CHAR_WIDTH_PX + COLUMN_HORIZONTAL_PADDING_PX

    // Apply data-type specific sizing, but never shrink below header width
    if (dataType) {
      const upperType = dataType.toUpperCase()
      const minWidthForHeader =
        Math.max(column.length, dataType.length) * ESTIMATED_CHAR_WIDTH_PX +
        COLUMN_HORIZONTAL_PADDING_PX

      // Boolean types: fixed width
      if (BOOLEAN_TYPES.some((t) => upperType.startsWith(t))) {
        estimatedWidth = Math.max(80, minWidthForHeader)
      }
      // Date/time types: fixed width
      else if (DATE_TYPES.some((t) => upperType.startsWith(t))) {
        estimatedWidth = Math.max(120, minWidthForHeader)
      }
      // Numeric types: medium width
      else if (NUMERIC_TYPES.some((t) => upperType.startsWith(t))) {
        estimatedWidth = Math.max(120, minWidthForHeader)
      }
      // JSON types: medium width
      else if (JSON_TYPES.some((t) => upperType.startsWith(t))) {
        estimatedWidth = Math.max(140, minWidthForHeader)
      }
      // UUID types: fixed width
      else if (UUID_TYPES.some((t) => upperType.startsWith(t))) {
        estimatedWidth = Math.max(160, minWidthForHeader)
      }
      // Text types: flexible width, also account for data type label
      else if (TEXT_TYPES.some((t) => upperType.startsWith(t))) {
        estimatedWidth = Math.max(
          minWidthForHeader,
          maxChars * ESTIMATED_CHAR_WIDTH_PX + COLUMN_HORIZONTAL_PADDING_PX,
        )
      }
    }

    return Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, estimatedWidth))
  })
}
