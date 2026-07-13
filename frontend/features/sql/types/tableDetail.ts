export type TableRow = Record<string, unknown>

export interface ColumnMetadata {
  columnName: string
  dataType?: string
  isPrimaryKey?: boolean
  primaryKey?: boolean
  columnKey?: string
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
