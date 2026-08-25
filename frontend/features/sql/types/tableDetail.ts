export type TableRow = Record<string, unknown>

export interface ColumnMetadata {
  columnName: string
  dataType?: string
  isPrimaryKey?: boolean
  primaryKey?: boolean
  columnKey?: string
  /** True when the column accepts SQL NULL. */
  isNullable?: boolean
  /** Maximum length for character columns; null when unbounded/NA. */
  maxLength?: number | null
}

export type FilterOperator =
  | '='
  | '!='
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | '>'
  | '>='
  | '<'
  | '<='
  | 'is_null'
  | 'is_not_null'
  | 'in'

export interface FilterCondition {
  column: string
  operator: FilterOperator
  value: string
}
