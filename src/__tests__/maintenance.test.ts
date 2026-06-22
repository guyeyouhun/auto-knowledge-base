import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { SqliteStore } from '../storage/sqlite-store.js'
import { handleDecaySweep } from '../tools/maintenance.js'
import { handleLearn } from '../tools/learn.js'
import { createTempDir, cleanupTempDir } from './setup.js'
import type { KnowledgeEntry } from '../types.js'

function makeEntry(overrides?: Partial<KnowledgeEntry>): KnowledgeEntry {
  const past = new Date()
  past.setDate(past.getDate() - (overrides?.last_accessed ? 30 : 0))
  return {
    id: overrides?.id || crypto.randomUUID(),
    type: overrides?.type || 'concept',
    title: overrides?.title || 'Maintenance Test Entry',
    summary: 'Test entry for decay sweep',
    content: 'Test content here',
    tags: overrides?.tags || ['test'],
    roles: overrides?.roles || ['developer'],
    tasks: overrides?.tasks || [],
    truth: overrides?.truth || 'confirmed',
    provenance: overrides?.provenance || 'extracted',
    strength: overrides?.strength ?? 0.8,
    stability: overrides?.stability ?? 10,
    difficulty: overrides?.difficulty ?? 0.3,
    temperature: overrides?.temperature || 'warm',
    practice_count: overrides?.practice_count ?? 0,
    practice_success: overrides?.practice_success ?? 0,
    relations: overrides?.relations || [],
    source: 'test',
    created_at: overrides?.created_at || new Date(0).toISOString(),
    updated_at: overrides?.updated_at || new Date(0).toISOString(),
    last_accessed: overrides?.last_accessed,
  }
}

describe('handleDecaySweep', () => {
  let store: SqliteStore
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
    store = new SqliteStore(join(tempDir, 'test.db'))
  })

  afterEach(() => {
    store.close()
    cleanupTempDir(tempDir)
  })

  it('decays entries with old last_accessed', async () => {
    const past = new Date()
    past.setDate(past.getDate() - 30)

    const entry = makeEntry({
      strength: 0.8,
      stability: 10,
      difficulty: 0.3,
      temperature: 'warm',
      last_accessed: past.toISOString(),
    })
    await store.save(entry)

    const result = await handleDecaySweep(store)
    expect(result.decayed).toBe(1)

    const retrieved = await store.get(entry.id)
    // 30 days: excess = 23, strength = 0.8 - 0.02 * 23 = 0.34
    expect(retrieved!.strength).toBeCloseTo(0.34, 5)
    // stability = 10 - 0.05 * 23 = 8.85
    expect(retrieved!.stability).toBeCloseTo(8.85, 5)
    // 0.34 > 0.1 => 'cool'
    expect(retrieved!.temperature).toBe('cool')
  })

  it('does not touch entries accessed within 7 days', async () => {
    const recent = new Date()
    recent.setHours(recent.getHours() - 1)

    const entry = makeEntry({
      strength: 0.8,
      stability: 10,
      temperature: 'warm',
      last_accessed: recent.toISOString(),
    })
    await store.save(entry)

    const result = await handleDecaySweep(store)
    expect(result.decayed).toBe(0)

    const retrieved = await store.get(entry.id)
    expect(retrieved!.strength).toBe(0.8)
    expect(retrieved!.temperature).toBe('warm')
  })

  it('skips entries with no last_accessed', async () => {
    const entry = makeEntry({
      strength: 0.8,
      stability: 10,
      temperature: 'warm',
      last_accessed: undefined,
    })
    await store.save(entry)

    const result = await handleDecaySweep(store)
    expect(result.decayed).toBe(0)
  })

  it('freezes entries whose strength drops to 0 or below', async () => {
    const past = new Date()
    past.setDate(past.getDate() - 60)

    const entry = makeEntry({
      strength: 0.2,
      stability: 5,
      temperature: 'cool',
      last_accessed: past.toISOString(),
    })
    await store.save(entry)

    const result = await handleDecaySweep(store)
    expect(result.decayed).toBe(1)
    expect(result.frozen).toBe(1)

    const retrieved = await store.get(entry.id)
    // 60 days: excess = 53, strength = 0.2 - 0.02 * 53 = -0.86, floored at 0
    expect(retrieved!.strength).toBe(0)
    expect(retrieved!.temperature).toBe('frozen')
  })

  it('does not touch non-confirmed entries', async () => {
    const past = new Date()
    past.setDate(past.getDate() - 30)

    const entry = makeEntry({
      truth: 'staging',
      strength: 0.8,
      stability: 10,
      temperature: 'warm',
      last_accessed: past.toISOString(),
    })
    await store.save(entry)

    const result = await handleDecaySweep(store)
    // list('confirmed') should not include staging entries
    expect(result.decayed).toBe(0)
  })
})

describe('Conflict detection in handleLearn', () => {
  let store: SqliteStore
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
    store = new SqliteStore(join(tempDir, 'test.db'))
  })

  afterEach(() => {
    store.close()
    cleanupTempDir(tempDir)
  })

  it('marks both entries as disputed when contradicts is provided', async () => {
    // First, create a target entry
    const targetResult = await handleLearn(store, {
      content: 'Original knowledge content',
      title: 'Original Knowledge',
      tags: ['test'],
    })
    // Confirm the target so it exists as a confirmed entry
    await store.confirm(targetResult.id)

    // Now learn a contradicting entry
    const contradictResult = await handleLearn(store, {
      content: 'Contradicting knowledge content',
      title: 'Contradicting Knowledge',
      tags: ['test'],
      contradicts: [targetResult.id],
    })

    const newEntry = await store.get(contradictResult.id)
    expect(newEntry!.truth).toBe('disputed')

    const targetEntry = await store.get(targetResult.id)
    expect(targetEntry!.truth).toBe('disputed')

    // Verify the contradicts relation was added
    const relations = await store.getRelations(contradictResult.id)
    const contradictsRel = relations.find(
      (r) => r.target_kn === targetResult.id && r.rel_type === 'contradicts',
    )
    expect(contradictsRel).toBeDefined()
  })

  it('handles non-existent contradict target gracefully', async () => {
    const result = await handleLearn(store, {
      content: 'New knowledge',
      title: 'New Knowledge',
      tags: ['test'],
      contradicts: ['non-existent-id'],
    })

    // Entry should still be created as staging (not disputed)
    const entry = await store.get(result.id)
    expect(entry!.truth).toBe('staging')
  })

  it('handles empty contradicts array gracefully', async () => {
    const result = await handleLearn(store, {
      content: 'New knowledge',
      title: 'New Knowledge',
      tags: ['test'],
      contradicts: [],
    })

    const entry = await store.get(result.id)
    expect(entry!.truth).toBe('staging')
  })
})
