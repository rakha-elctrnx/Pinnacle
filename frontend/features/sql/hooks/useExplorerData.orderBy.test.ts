// Deterministic pagination ordering tests.
// Run with: pnpm vitest run frontend/features/sql/hooks/useExplorerData.orderBy.test.ts
import { describe, it, expect } from 'vitest'
import { buildEffectiveOrderBy } from './useExplorerData'

describe('buildEffectiveOrderBy', () => {
  it('orders by all PK columns ascending when there is no user sort', () => {
    expect(
      buildEffectiveOrderBy(undefined, ['tenant_id', 'item_id'], 'postgresql'),
    ).toBe('"tenant_id" ASC, "item_id" ASC')
  })

  it('returns empty string for a no-PK table with no user sort (no invented order)', () => {
    expect(buildEffectiveOrderBy(undefined, [], 'postgresql')).toBe('')
  })

  it('appends missing PK columns after the user sort as tiebreakers', () => {
    expect(
      buildEffectiveOrderBy(
        '"name" DESC',
        ['tenant_id', 'item_id'],
        'postgresql',
      ),
    ).toBe('"name" DESC, "tenant_id" ASC, "item_id" ASC')
  })

  it('does not duplicate PK columns already present in the user sort', () => {
    expect(
      buildEffectiveOrderBy(
        '"tenant_id" DESC',
        ['tenant_id', 'item_id'],
        'postgresql',
      ),
    ).toBe('"tenant_id" DESC, "item_id" ASC')
  })

  it('detects already-present columns case-insensitively and without quotes', () => {
    expect(
      buildEffectiveOrderBy('TENANT_ID DESC', ['tenant_id'], 'postgresql'),
    ).toBe('TENANT_ID DESC')
  })

  it('uses backtick quoting for MySQL', () => {
    expect(buildEffectiveOrderBy(undefined, ['tenant id'], 'mysql')).toBe(
      '`tenant id` ASC',
    )
  })

  it('escapes embedded quote characters in identifiers for both dialects', () => {
    expect(buildEffectiveOrderBy(undefined, ['we"ird'], 'postgresql')).toBe(
      '"we""ird" ASC',
    )
    expect(buildEffectiveOrderBy(undefined, ['we`ird'], 'mysql')).toBe(
      '`we``ird` ASC',
    )
  })
})
