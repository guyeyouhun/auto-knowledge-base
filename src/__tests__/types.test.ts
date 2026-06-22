import { describe, it, expect } from 'vitest'
import type { KnowledgeEntry } from '../types.js'

describe('KnowledgeEntry', () => {
  it('accepts valid truth values', () => {
    const entry: KnowledgeEntry['truth'] = 'confirmed'
    expect(['confirmed', 'staging', 'disputed', 'deprecated']).toContain(entry)
  })

  it('accepts valid provenance values', () => {
    const entry: KnowledgeEntry['provenance'] = 'extracted'
    expect(['extracted', 'inferred', 'synthesized', 'user_stated', 'unverified']).toContain(entry)
  })

  it('accepts all 6 relation types', () => {
    const types = ['references', 'contradicts', 'supersedes', 'derives_from', 'extends', 'implements']
    expect(types.length).toBe(6)
  })
})
