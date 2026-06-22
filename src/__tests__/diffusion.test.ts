import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { SqliteStore } from '../storage/sqlite-store.js'
import { createTempDir, cleanupTempDir } from './setup.js'
import { spreadActivation } from '../diffusion.js'
import type { KnowledgeEntry, RoleConfig } from '../types.js'

describe('spreadActivation', () => {
  let tempDir: string
  let store: SqliteStore

  function makeEntry(id: string, overrides?: Partial<KnowledgeEntry>): KnowledgeEntry {
    return {
      id,
      type: 'concept',
      title: `Entry ${id}`,
      summary: '',
      content: '',
      tags: [],
      roles: [],
      tasks: [],
      truth: 'confirmed',
      provenance: 'synthesized',
      strength: 1,
      stability: 1,
      difficulty: 1,
      temperature: 'cool',
      practice_count: 0,
      practice_success: 0,
      relations: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    }
  }

  function makeRoleConfig(overrides?: Partial<RoleConfig>): RoleConfig {
    return {
      role: 'developer',
      entry_kn_ids: [],
      spread_depth: 2,
      context_budget: 4000,
      priority_tasks: [],
      ...overrides,
    }
  }

  async function insertEntry(entry: KnowledgeEntry): Promise<void> {
    await store.save(entry)
    // Update the db to set truth directly if needed (save inserts as-stated)
  }

  beforeEach(() => {
    tempDir = createTempDir()
    store = new SqliteStore(join(tempDir, 'test.db'))
  })

  afterEach(() => {
    store.close()
    cleanupTempDir(tempDir)
  })

  it('returns empty array when role config does not exist', async () => {
    const result = await spreadActivation(store, 'nonexistent')
    expect(result).toEqual([])
  })

  it('returns empty array when role has no entry_kn_ids', async () => {
    await store.setRoleConfig(makeRoleConfig({ entry_kn_ids: [] }))
    const result = await spreadActivation(store, 'developer')
    expect(result).toEqual([])
  })

  it('entry node gets activation 1.0 and hops 0', async () => {
    const entry = makeEntry('kn-1')
    await store.save(entry)
    await store.setRoleConfig(makeRoleConfig({ entry_kn_ids: ['kn-1'] }))

    const result = await spreadActivation(store, 'developer')
    expect(result).toHaveLength(1)
    expect(result[0].entry.id).toBe('kn-1')
    expect(result[0].activation).toBe(1.0)
    expect(result[0].hops).toBe(0)
  })

  it('one-hop neighbor gets activation 0.5 and hops 1', async () => {
    const entryA = makeEntry('kn-1', { relations: [{ target: 'kn-2', type: 'references' }] })
    const entryB = makeEntry('kn-2')
    // Save targets before sources to satisfy FK constraint
    await store.save(entryB)
    await store.save(entryA)
    await store.setRoleConfig(makeRoleConfig({ entry_kn_ids: ['kn-1'] }))

    const result = await spreadActivation(store, 'developer')
    expect(result).toHaveLength(2)

    const entry1 = result.find((r) => r.entry.id === 'kn-1')!
    const entry2 = result.find((r) => r.entry.id === 'kn-2')!
    expect(entry1.activation).toBe(1.0)
    expect(entry1.hops).toBe(0)
    expect(entry2.activation).toBe(0.5)
    expect(entry2.hops).toBe(1)
  })

  it('two-hop neighbor gets activation 0.25 and hops 2', async () => {
    const entryA = makeEntry('kn-1', { relations: [{ target: 'kn-2', type: 'references' }] })
    const entryB = makeEntry('kn-2', { relations: [{ target: 'kn-3', type: 'references' }] })
    const entryC = makeEntry('kn-3')
    // Save targets before sources: kn-3, then kn-2, then kn-1
    await store.save(entryC)
    await store.save(entryB)
    await store.save(entryA)
    await store.setRoleConfig(makeRoleConfig({ entry_kn_ids: ['kn-1'], spread_depth: 3 }))

    const result = await spreadActivation(store, 'developer')
    expect(result).toHaveLength(3)

    const entry3 = result.find((r) => r.entry.id === 'kn-3')!
    expect(entry3.activation).toBe(0.25)
    expect(entry3.hops).toBe(2)
  })

  it('nodes with activation below THRESHOLD are excluded', async () => {
    // Chain: kn-1 -> kn-2 -> kn-3 -> kn-4 -> kn-5 (4 hops = 0.0625, still above 0.05)
    // kn-6 would be 5 hops = 0.03125, below threshold
    const entry1 = makeEntry('kn-1', { relations: [{ target: 'kn-2', type: 'references' }] })
    const entry2 = makeEntry('kn-2', { relations: [{ target: 'kn-3', type: 'references' }] })
    const entry3 = makeEntry('kn-3', { relations: [{ target: 'kn-4', type: 'references' }] })
    const entry4 = makeEntry('kn-4', { relations: [{ target: 'kn-5', type: 'references' }] })
    const entry5 = makeEntry('kn-5', { relations: [{ target: 'kn-6', type: 'references' }] })
    const entry6 = makeEntry('kn-6')
    // Save in reverse order to satisfy FK constraints
    await store.save(entry6)
    await store.save(entry5)
    await store.save(entry4)
    await store.save(entry3)
    await store.save(entry2)
    await store.save(entry1)
    await store.setRoleConfig(makeRoleConfig({ entry_kn_ids: ['kn-1'], spread_depth: 10 }))

    const result = await spreadActivation(store, 'developer')
    const ids = result.map((r) => r.entry.id)
    // kn-5 (4 hops = 0.0625) should be included
    expect(ids).toContain('kn-5')
    // kn-6 (5 hops = 0.03125) should be excluded
    expect(ids).not.toContain('kn-6')
  })

  it('filters out entries that are not confirmed', async () => {
    const entryA = makeEntry('kn-1', { relations: [{ target: 'kn-2', type: 'references' }] })
    const entryB = makeEntry('kn-2', { truth: 'staging' })
    await store.save(entryB)
    await store.save(entryA)
    await store.setRoleConfig(makeRoleConfig({ entry_kn_ids: ['kn-1'] }))

    const result = await spreadActivation(store, 'developer')
    expect(result).toHaveLength(1)
    expect(result[0].entry.id).toBe('kn-1')
  })

  it('filters out frozen entries', async () => {
    const entryA = makeEntry('kn-1', { relations: [{ target: 'kn-2', type: 'references' }] })
    const entryB = makeEntry('kn-2', { temperature: 'frozen' })
    await store.save(entryB)
    await store.save(entryA)
    await store.setRoleConfig(makeRoleConfig({ entry_kn_ids: ['kn-1'] }))

    const result = await spreadActivation(store, 'developer')
    expect(result).toHaveLength(1)
    expect(result[0].entry.id).toBe('kn-1')
  })

  it('sorts results by activation descending', async () => {
    const entryA = makeEntry('kn-1', { relations: [{ target: 'kn-2', type: 'references' }] })
    const entryB = makeEntry('kn-2', { relations: [{ target: 'kn-3', type: 'references' }] })
    const entryC = makeEntry('kn-3')
    await store.save(entryC)
    await store.save(entryB)
    await store.save(entryA)
    await store.setRoleConfig(makeRoleConfig({ entry_kn_ids: ['kn-1'], spread_depth: 3 }))

    const result = await spreadActivation(store, 'developer')
    expect(result).toHaveLength(3)
    expect(result[0].activation).toBe(1.0)
    expect(result[1].activation).toBe(0.5)
    expect(result[2].activation).toBe(0.25)
  })

  it('follows relations bidirectionally', async () => {
    // kn-2 references kn-1 (reverse direction)
    const entryA = makeEntry('kn-1')
    const entryB = makeEntry('kn-2', { relations: [{ target: 'kn-1', type: 'references' }] })
    await store.save(entryA)
    await store.save(entryB)
    await store.setRoleConfig(makeRoleConfig({ entry_kn_ids: ['kn-2'] }))

    const result = await spreadActivation(store, 'developer')
    expect(result).toHaveLength(2)
    const entry1 = result.find((r) => r.entry.id === 'kn-1')!
    expect(entry1.activation).toBe(0.5)
    expect(entry1.hops).toBe(1)
  })
})
