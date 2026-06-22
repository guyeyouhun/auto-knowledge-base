import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { SqliteStore } from '../storage/sqlite-store.js'
import { handleSearch } from '../tools/search.js'
import { handleRelevant } from '../tools/relevant.js'
import { createTempDir, cleanupTempDir } from './setup.js'
import type { KnowledgeEntry } from '../types.js'

function makeConfirmedEntry(overrides?: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type: 'concept',
    title: '',
    summary: '',
    content: '',
    tags: [],
    roles: [],
    tasks: [],
    truth: 'confirmed',
    provenance: 'extracted',
    strength: 0.8, stability: 0.8, difficulty: 0.3,
    temperature: 'hot',
    practice_count: 0, practice_success: 0,
    relations: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('handleSearch', () => {
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

  it('returns matching entries', async () => {
    await store.save(makeConfirmedEntry({ title: 'React Hooks', content: 'useState and useEffect', tags: ['react'] }))
    await store.save(makeConfirmedEntry({ title: 'Vue Composition', content: 'ref and reactive', tags: ['vue'] }))
    const result = await handleSearch(store, { query: 'react hooks' })
    expect(result.entries.length).toBe(1)
    expect(result.entries[0].title).toBe('React Hooks')
  })

  it('returns empty for no match', async () => {
    const result = await handleSearch(store, { query: 'nonexistent' })
    expect(result.entries.length).toBe(0)
  })

  it('returns empty synthesis', async () => {
    await store.save(makeConfirmedEntry({ title: 'React Hooks', content: 'useState', tags: ['react'] }))
    const result = await handleSearch(store, { query: 'react' })
    expect(result.synthesis).toBe('')
  })
})

describe('handleRelevant', () => {
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

  it('returns entries matching task', async () => {
    await store.save(makeConfirmedEntry({ title: 'Backend Deploy', roles: ['backend'], tasks: ['deploy'] }))
    await store.save(makeConfirmedEntry({ title: 'Frontend Build', roles: ['frontend'], tasks: ['build'] }))
    const { entries } = await handleRelevant(store, { role: 'backend', task: 'deploy' })
    expect(entries.length).toBeGreaterThan(0)
    expect(entries[0].title).toBe('Backend Deploy')
  })

  it('returns empty for no match', async () => {
    const { entries } = await handleRelevant(store, { role: 'backend', task: 'nonexistent' })
    expect(entries.length).toBe(0)
  })

  it('respects maxResults limit', async () => {
    await store.save(makeConfirmedEntry({ title: 'A', tags: ['react'], content: 'react hook state effect' }))
    await store.save(makeConfirmedEntry({ title: 'B', tags: ['react'], content: 'react context provider' }))
    await store.save(makeConfirmedEntry({ title: 'C', tags: ['react'], content: 'react ref callback' }))
    const { entries } = await handleRelevant(store, { role: 'frontend', task: 'react', maxResults: 2 })
    expect(entries.length).toBeLessThanOrEqual(2)
  })
})
