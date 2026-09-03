// Self-check for engine-aware SQL identifier quoting.
// Run with: pnpm vitest run frontend/features/sql/logic/sqlIdentifier.test.ts
import { describe, it, expect } from 'vitest'
import {
  quoteIdentifierForEngine,
  qualifyIdentifierForEngine,
} from './sqlIdentifier'

describe('quoteIdentifierForEngine', () => {
  describe('postgresql', () => {
    it('quotes an ordinary lowercase name with double quotes', () => {
      expect(quoteIdentifierForEngine('postgresql', 'users')).toBe('"users"')
    })

    it('quotes an uppercase name with double quotes', () => {
      expect(quoteIdentifierForEngine('postgresql', 'MyTable')).toBe(
        '"MyTable"',
      )
    })

    it('quotes a reserved word with double quotes', () => {
      expect(quoteIdentifierForEngine('postgresql', 'select')).toBe('"select"')
    })

    it('quotes names with spaces and punctuation', () => {
      expect(quoteIdentifierForEngine('postgresql', 'Order Items')).toBe(
        '"Order Items"',
      )
      expect(quoteIdentifierForEngine('postgresql', 'a-b.c')).toBe('"a-b.c"')
    })

    it('doubles embedded double quotes', () => {
      expect(quoteIdentifierForEngine('postgresql', 'a"b')).toBe('"a""b"')
    })
  })

  describe('mysql', () => {
    it('quotes an ordinary lowercase name with backticks', () => {
      expect(quoteIdentifierForEngine('mysql', 'users')).toBe('`users`')
    })

    it('quotes uppercase and reserved names with backticks', () => {
      expect(quoteIdentifierForEngine('mysql', 'MyTable')).toBe('`MyTable`')
      expect(quoteIdentifierForEngine('mysql', 'select')).toBe('`select`')
    })

    it('quotes names with spaces with backticks', () => {
      expect(quoteIdentifierForEngine('mysql', 'Order Items')).toBe(
        '`Order Items`',
      )
    })

    it('doubles embedded backticks', () => {
      expect(quoteIdentifierForEngine('mysql', 'a`b')).toBe('`a``b`')
    })
  })

  describe('sqlite', () => {
    it('behaves like postgresql and uses double quotes', () => {
      expect(quoteIdentifierForEngine('sqlite', 'users')).toBe('"users"')
      expect(quoteIdentifierForEngine('sqlite', 'MyTable')).toBe('"MyTable"')
    })

    it('doubles embedded double quotes', () => {
      expect(quoteIdentifierForEngine('sqlite', 'a"b')).toBe('"a""b"')
    })
  })
})

describe('qualifyIdentifierForEngine', () => {
  describe('postgresql', () => {
    it('qualifies with database/schema as two quoted segments', () => {
      expect(qualifyIdentifierForEngine('postgresql', 'public', 'users')).toBe(
        '"public"."users"',
      )
    })

    it('falls back to a single segment without a qualifier', () => {
      expect(qualifyIdentifierForEngine('postgresql', undefined, 'users')).toBe(
        '"users"',
      )
      expect(qualifyIdentifierForEngine('postgresql', '', 'users')).toBe(
        '"users"',
      )
    })
  })

  describe('mysql', () => {
    it('qualifies with the database name in backticks', () => {
      expect(qualifyIdentifierForEngine('mysql', 'mydb', 'users')).toBe(
        '`mydb`.`users`',
      )
    })

    it('falls back to a single segment without a qualifier', () => {
      expect(qualifyIdentifierForEngine('mysql', undefined, 'users')).toBe(
        '`users`',
      )
      expect(qualifyIdentifierForEngine('mysql', '', 'users')).toBe('`users`')
    })
  })

  describe('sqlite', () => {
    it('behaves like postgresql and uses double quotes', () => {
      expect(qualifyIdentifierForEngine('sqlite', 'public', 'users')).toBe(
        '"public"."users"',
      )
      expect(qualifyIdentifierForEngine('sqlite', undefined, 'users')).toBe(
        '"users"',
      )
      expect(qualifyIdentifierForEngine('sqlite', '', 'users')).toBe('"users"')
    })
  })
})
