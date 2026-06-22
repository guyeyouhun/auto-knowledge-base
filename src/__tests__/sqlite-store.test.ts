import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { SqliteStore } from '../storage/sqlite-store.js'
import { createTempDir, cleanupTempDir } from './setup.js'
import type { KnowledgeEntry } from '../types.js'

function makeEntry(overrides?: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: overrides?.id || crypto.randomUUID(),
    type: overrides?.type || 'concept',
    title: overrides?.title || 'Test Entry',
    summary: 'A test entry',
    content: 'Test content here',
    tags: overrides?.tags || ['test'],
    roles: overrides?.roles || ['developer'],
    tasks: overrides?.tasks || [],
    truth: overrides?.truth || 'staging',
    provenance: overrides?.provenance || 'extracted',
    strength: 0.8,
    stability: 0.8,
    difficulty: 0.3,
    temperature: 'warm',
    practice_count: 0,
    practice_success: 0,
    relations: overrides?.relations || [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

describe('SqliteStore', () => {
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

  it('saves and retrieves an entry', async () => {
    const entry = makeEntry()
    await store.save(entry)
    const retrieved = await store.get(entry.id)
    expect(retrieved).not.toBeNull()
    expect(retrieved!.title).toBe('Test Entry')
    expect(retrieved!.truth).toBe('staging')
    expect(retrieved!.provenance).toBe('extracted')
  })

  it('returns null for missing entry', async () => {
    const result = await store.get('nonexistent')
    expect(result).toBeNull()
  })

  it('deletes an entry', async () => {
    const entry = makeEntry()
    await store.save(entry)
    const deleted = await store.delete(entry.id)
    expect(deleted).toBe(true)
    expect(await store.get(entry.id)).toBeNull()
  })

  it('confirms a staging entry', async () => {
    const entry = makeEntry({ truth: 'staging' })
    await store.save(entry)
    const confirmed = await store.confirm(entry.id)
    expect(confirmed).toBe(true)
    const retrieved = await store.get(entry.id)
    expect(retrieved!.truth).toBe('confirmed')
  })

  it('does not confirm already confirmed entry', async () => {
    const entry = makeEntry({ truth: 'confirmed' })
    await store.save(entry)
    const confirmed = await store.confirm(entry.id)
    expect(confirmed).toBe(false)
  })

  it('searches by FTS', async () => {
    const entry = makeEntry({
      title: 'React Hooks Guide',
      tags: ['react', 'hooks'],
      truth: 'confirmed',
      temperature: 'hot',
    })
    await store.save(entry)
    const results = await store.search({ query: 'react hooks' })
    expect(results.length).toBeGreaterThan(0)
  })

  it('ignores staging entries in search', async () => {
    const staging = makeEntry({ title: 'Secret Knowledge', truth: 'staging' })
    await store.save(staging)
    const results = await store.search({ query: 'secret' })
    expect(results.length).toBe(0)
  })

  it('saves and retrieves relations', async () => {
    // Insert the target entry first (required by FK constraint)
    const targetEntry = makeEntry({ id: 'other-entry', title: 'Target Entry' })
    await store.save(targetEntry)
    const entry = makeEntry({
      id: 'source-entry',
      relations: [{ target: 'other-entry', type: 'references' }],
    })
    await store.save(entry)
    const retrieved = await store.get(entry.id)
    expect(retrieved!.relations.length).toBe(1)
    expect(retrieved!.relations[0].target).toBe('other-entry')
  })

  it('finds similar entries', async () => {
    const entry1 = makeEntry({ title: 'React Patterns', truth: 'confirmed' })
    const entry2 = makeEntry({ title: 'React Hooks Deep Dive', truth: 'confirmed' })
    await store.save(entry1)
    await store.save(entry2)
    const similar = await store.findSimilar('React Patterns', '')
    expect(similar.length).toBeGreaterThan(0)
  })

  it('reports health', async () => {
    const h = await store.health()
    expect(h.ok).toBe(true)
    expect(typeof h.count).toBe('number')
  })
})
