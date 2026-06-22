import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { SqliteStore } from '../storage/sqlite-store.js'
import { createTempDir, cleanupTempDir } from './setup.js'
import { handleExport, handleImport } from '../tools/ops.js'
import type { KnowledgeEntry } from '../types.js'

function makeEntry(overrides?: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: overrides?.id || crypto.randomUUID(),
    type: overrides?.type || 'concept',
    title: overrides?.title || 'Test Entry',
    summary: overrides?.summary || 'A test entry',
    content: overrides?.content || 'Test content here',
    tags: overrides?.tags || ['test'],
    roles: overrides?.roles || ['developer'],
    tasks: overrides?.tasks || [],
    truth: overrides?.truth || 'staging',
    provenance: overrides?.provenance || 'extracted',
    strength: 0.8,
    stability: 0.8,
    difficulty: 0.3,
    temperature: overrides?.temperature || 'warm',
    practice_count: 0,
    practice_success: 0,
    relations: overrides?.relations || [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

describe('handleExport', () => {
  let tempDir: string
  let store: SqliteStore

  beforeEach(() => {
    tempDir = createTempDir()
    store = new SqliteStore(join(tempDir, 'test.db'))
  })

  afterEach(() => {
    store.close()
    cleanupTempDir(tempDir)
  })

  it('exports entries with correct count and fields', async () => {
    const entry1 = makeEntry({ title: 'Entry 1', truth: 'confirmed' })
    const entry2 = makeEntry({ title: 'Entry 2', truth: 'staging' })
    await store.save(entry1)
    await store.save(entry2)

    const result = await handleExport(store)

    expect(result.count).toBe(2)
    expect(result.entries.length).toBe(2)
    expect(result.exportedAt).toBeTruthy()
    expect(result.entries.find((e) => e.id === entry1.id)).toBeTruthy()
    expect(result.entries.find((e) => e.id === entry2.id)).toBeTruthy()
  })

  it('returns count 0 for empty knowledge base', async () => {
    const result = await handleExport(store)
    expect(result.count).toBe(0)
    expect(result.entries).toEqual([])
    expect(result.exportedAt).toBeTruthy()
  })

  it('exported entries include all expected fields', async () => {
    const entry = makeEntry({
      title: 'Full Entry',
      summary: 'Full summary',
      content: 'Full content',
      tags: ['tag1', 'tag2'],
      truth: 'confirmed',
      temperature: 'hot',
    })
    await store.save(entry)

    const result = await handleExport(store)
    const exported = result.entries[0]

    expect(exported.id).toBe(entry.id)
    expect(exported.title).toBe('Full Entry')
    expect(exported.summary).toBe('Full summary')
    expect(exported.content).toBe('Full content')
    expect(exported.tags).toEqual(['tag1', 'tag2'])
    expect(exported.truth).toBe('confirmed')
    expect(exported.temperature).toBe('hot')
  })
})

describe('handleImport', () => {
  let tempDir: string
  let store: SqliteStore

  beforeEach(() => {
    tempDir = createTempDir()
    store = new SqliteStore(join(tempDir, 'test.db'))
  })

  afterEach(() => {
    store.close()
    cleanupTempDir(tempDir)
  })

  it('imports entries and verifies they exist', async () => {
    const entries = [
      makeEntry({ id: 'entry-1', title: 'Imported 1', truth: 'confirmed' }),
      makeEntry({ id: 'entry-2', title: 'Imported 2', truth: 'staging' }),
    ]

    const result = await handleImport(store, entries)

    expect(result.imported).toBe(2)
    expect(result.skipped).toBe(0)

    const e1 = await store.get('entry-1')
    expect(e1).not.toBeNull()
    expect(e1!.title).toBe('Imported 1')

    const e2 = await store.get('entry-2')
    expect(e2).not.toBeNull()
    expect(e2!.title).toBe('Imported 2')
  })

  it('skips duplicate entries by ID', async () => {
    const first = makeEntry({ id: 'dup-id', title: 'Original', truth: 'confirmed' })
    const second = makeEntry({ id: 'dup-id', title: 'Duplicate', truth: 'staging' })

    // Import first entry
    const result1 = await handleImport(store, [first])
    expect(result1.imported).toBe(1)
    expect(result1.skipped).toBe(0)

    // Import second with same ID — should be skipped
    const result2 = await handleImport(store, [second])
    expect(result2.imported).toBe(0)
    expect(result2.skipped).toBe(1)

    // Original should remain unchanged
    const retrieved = await store.get('dup-id')
    expect(retrieved).not.toBeNull()
    expect(retrieved!.title).toBe('Original')
  })

  it('mixed import with some duplicates', async () => {
    const existing = makeEntry({ id: 'existing-id', title: 'Existing', truth: 'confirmed' })
    await store.save(existing)

    const entries = [
      makeEntry({ id: 'existing-id', title: 'Should Be Skipped', truth: 'staging' }),
      makeEntry({ id: 'new-id-1', title: 'New Entry 1', truth: 'confirmed' }),
      makeEntry({ id: 'new-id-2', title: 'New Entry 2', truth: 'staging' }),
    ]

    const result = await handleImport(store, entries)

    expect(result.imported).toBe(2)
    expect(result.skipped).toBe(1)

    expect(await store.get('new-id-1')).not.toBeNull()
    expect(await store.get('new-id-2')).not.toBeNull()
  })
})

describe('getStats (enhanced health)', () => {
  let tempDir: string
  let store: SqliteStore

  beforeEach(() => {
    tempDir = createTempDir()
    store = new SqliteStore(join(tempDir, 'test.db'))
  })

  afterEach(() => {
    store.close()
    cleanupTempDir(tempDir)
  })

  it('returns all stats fields with correct counts', async () => {
    const confirmed = makeEntry({
      id: 'confirmed-1',
      title: 'Confirmed',
      truth: 'confirmed',
      temperature: 'hot',
    })
    const staging = makeEntry({
      id: 'staging-1',
      title: 'Staging',
      truth: 'staging',
      temperature: 'warm',
    })
    const disputed = makeEntry({
      id: 'disputed-1',
      title: 'Disputed',
      truth: 'disputed',
      temperature: 'cool',
    })
    const deprecated = makeEntry({
      id: 'deprecated-1',
      title: 'Deprecated',
      truth: 'deprecated',
      temperature: 'frozen',
    })

    // Save target entries for FK constraints on relations
    const target = makeEntry({ id: 'target-1', title: 'Target', truth: 'confirmed', temperature: 'cool' })
    const target2 = makeEntry({ id: 'target-2', title: 'Target 2', truth: 'confirmed', temperature: 'cool' })
    await store.save(target)
    await store.save(target2)

    confirmed.relations = [{ target: 'target-1', type: 'references' }]
    staging.relations = [{ target: 'target-2', type: 'references' }]

    await store.save(confirmed)
    await store.save(staging)
    await store.save(disputed)
    await store.save(deprecated)

    const stats = await store.getStats()

    expect(stats.byTruth).toEqual({
      confirmed: 3, // confirmed + 2 targets
      staging: 1,
      disputed: 1,
      deprecated: 1,
    })
    expect(stats.byTemperature).toEqual({
      hot: 1,
      warm: 1,
      cool: 3, // disputed + 2 target entries
      frozen: 1,
    })
    expect(stats.relationCount).toBe(2)
    expect(stats.embeddingCount).toBe(0)
    expect(stats.dbSizeBytes).toBeGreaterThan(0)
  })

  it('returns zero counts for empty database', async () => {
    const stats = await store.getStats()

    expect(stats.byTruth).toEqual({})
    expect(stats.byTemperature).toEqual({})
    expect(stats.relationCount).toBe(0)
    expect(stats.embeddingCount).toBe(0)
    expect(stats.dbSizeBytes).toBeGreaterThan(0)
  })
})
