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
    expect(result.llmStatus).toBe('unconfigured')
  })

  it('returns empty for no match', async () => {
    const result = await handleSearch(store, { query: 'nonexistent' })
    expect(result.entries.length).toBe(0)
  })

  it('returns synthesis empty when LLM not configured', async () => {
    await store.save(makeConfirmedEntry({ title: 'React Hooks', content: 'useState', tags: ['react'] }))
    const result = await handleSearch(store, { query: 'react' })
    expect(result.synthesis).toBe('')
    expect(result.llmStatus).toBe('unconfigured')
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

describe('handleSearch with hybrid vector search', () => {
  let store: SqliteStore
  let tempDir: string
  // A simple mock LLM that returns a fixed embedding
  const mockLLM = {
    configured: true,
    embed: async (_text: string) => [0.1, 0.2, 0.3],
  } as any

  beforeEach(() => {
    tempDir = createTempDir()
    store = new SqliteStore(join(tempDir, 'test.db'))
  })

  afterEach(() => {
    store.close()
    cleanupTempDir(tempDir)
  })

  it('falls back to BM25 when useVector is false', async () => {
    await store.save(makeConfirmedEntry({ title: 'React Hooks', content: 'useState' }))
    const result = await handleSearch(store, { query: 'react' }, mockLLM, false)
    expect(result.entries.length).toBe(1)
  })

  it('uses hybrid search when useVector is true and embeddings exist', async () => {
    const entry = makeConfirmedEntry({ title: 'React Hooks', content: 'useState' })
    await store.save(entry)
    // Save a matching embedding
    await store.saveEmbedding(entry.id, new Float32Array([0.1, 0.2, 0.3]), 'test-model')
    const result = await handleSearch(store, { query: 'react' }, mockLLM, true)
    expect(result.entries.length).toBe(1)
  })

  it('falls back to BM25 when no embeddings exist', async () => {
    await store.save(makeConfirmedEntry({ title: 'React Hooks', content: 'useState' }))
    const result = await handleSearch(store, { query: 'react' }, mockLLM, true)
    expect(result.entries.length).toBe(1)
  })

  it('falls back to BM25 when LLM is not configured', async () => {
    await store.save(makeConfirmedEntry({ title: 'React Hooks', content: 'useState' }))
    const noLLM = { configured: false } as any
    const result = await handleSearch(store, { query: 'react' }, noLLM, true)
    expect(result.entries.length).toBe(1)
  })
})

describe('handleSearch with LLM rerank', () => {
  let store: SqliteStore
  let tempDir: string

  const mockLLM = {
    configured: true,
    rankSearchResults: async (_query: string, entries: any[]) => ({
      rankings: entries.map((e: any, i: number) => ({ id: e.id, relevance: 1 - i * 0.1, reason: 'mock' })),
      synthesis: 'Synthesis text',
    }),
    embed: async (_text: string) => [0.1, 0.2, 0.3],
    modelName: 'test-model',
  } as any

  beforeEach(() => {
    tempDir = createTempDir()
    store = new SqliteStore(join(tempDir, 'test.db'))
  })

  afterEach(() => {
    store.close()
    cleanupTempDir(tempDir)
  })

  it('returns synthesis from LLM when configured', async () => {
    await store.save(makeConfirmedEntry({ title: 'React Hooks', content: 'useState', tags: ['react'] }))
    const result = await handleSearch(store, { query: 'react' }, mockLLM, false)
    expect(result.synthesis).toBe('Synthesis text')
    expect(result.llmStatus).toBe('active')
  })

  it('marks degraded when LLM rerank fails', async () => {
    const brokenLLM = {
      configured: true,
      rankSearchResults: async () => { throw new Error('API error') },
    } as any
    await store.save(makeConfirmedEntry({ title: 'React Hooks', content: 'useState', tags: ['react'] }))
    const result = await handleSearch(store, { query: 'react' }, brokenLLM, false)
    expect(result.entries.length).toBe(1)
    expect(result.synthesis).toBe('')
    expect(result.llmStatus).toBe('degraded')
  })
})
