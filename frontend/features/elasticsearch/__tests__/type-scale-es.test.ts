/**
 * Self-check: ES type scale migration spot-checks.
 * Run with: npx vitest run frontend/features/elasticsearch/__tests__/type-scale-es.test.ts
 *
 * Verifies that no ad-hoc typography classes remain in ES feature files,
 * and that semantic type scale classes are used instead.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const ES_DIR = join(__dirname, '..')
const AD_HOC_PATTERN = /\b(text-xs|text-sm|text-\[\d+px\]|font-medium|font-semibold|font-bold|font-mono|text-2xl|text-xl|text-lg)\b/
const SEMANTIC_PATTERN = /\b(text-display|text-heading|text-subheading|text-body|text-body-secondary|text-label|text-caption|text-micro|text-mono)\b/

function walkTsx(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== '__tests__' && entry.name !== 'node_modules') {
      results.push(...walkTsx(full))
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      results.push(full)
    }
  }
  return results
}

describe('ES feature type scale migration', () => {
  const files = walkTsx(ES_DIR).filter(f => !f.includes('__tests__'))

  it('no ad-hoc typography classes remain', () => {
    const violations: string[] = []
    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (AD_HOC_PATTERN.test(lines[i])) {
          violations.push(`${file}:${i + 1}: ${lines[i].trim()}`)
        }
      }
    }
    expect(violations, `Found ad-hoc typography:\n${violations.join('\n')}`).toEqual([])
  })

  it('semantic type classes are used in components', () => {
    let semanticCount = 0
    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      if (SEMANTIC_PATTERN.test(content)) semanticCount++
    }
    expect(semanticCount).toBeGreaterThan(0)
  })
})
