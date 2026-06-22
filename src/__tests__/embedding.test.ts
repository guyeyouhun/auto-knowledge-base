import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { SqliteStore } from '../storage/sqlite-store.js'
import { cosineSimilarity } from '../embedding.js'
import { createTempDir, cleanupTempDir } from './setup.js'

async function insertKnowledgeEntry(store: SqliteStore, id: string): Promise<void> {
  const entry = {
    id,
    type: 'concept' as const,
    title: `Test ${id}`,
    summary: 'Test summary',
    content: 'Test content',
    tags: ['test'],
    roles: [],
    tasks: [],
    truth: 'confirmed' as const,
    provenance: 'unverified' as const,
    strength: 0.8,
    stability: 0.8,
    difficulty: 0.3,
    temperature: 'warm' as const,
    practice_count: 0,
    practice_success: 0,
    relations: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  await store.save(entry)
}

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const a = new Float32Array([1, 2, 3])
    const b = new Float32Array([1, 2, 3])
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5)
  })

  it('returns 0.0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([0, 1, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5)
  })

  it('returns -1.0 for opposite vectors', () => {
    const a = new Float32Array([1, 2, 3])
    const b = new Float32Array([-1, -2, -3])
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5)
  })

  it('returns 0 for mismatched lengths', () => {
    const a = new Float32Array([1, 2, 3])
    const b = new Float32Array([1, 2])
    expect(cosineSimilarity(a, b)).toBe(0)
  })

  it('handles zero vectors gracefully', () => {
    const a = new Float32Array([0, 0, 0])
    const b = new Float32Array([1, 2, 3])
    expect(cosineSimilarity(a, b)).toBe(0)
  })
})

describe('embedding storage', () => {
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

  it('saves and retrieves an embedding round-trip', async () => {
    await insertKnowledgeEntry(store, 'kn-1')
    const embedding = new Float32Array([0.1, 0.2, 0.3, 0.4])
    await store.saveEmbedding('kn-1', embedding, 'text-embedding-3')

    const result = await store.getEmbedding('kn-1')
    expect(result).not.toBeNull()
    expect(result!.model).toBe('text-embedding-3')
    expect(result!.embedding[0]).toBeCloseTo(0.1, 5)
    expect(result!.embedding[1]).toBeCloseTo(0.2, 5)
    expect(result!.embedding[2]).toBeCloseTo(0.3, 5)
    expect(result!.embedding[3]).toBeCloseTo(0.4, 5)
  })

  it('returns null for non-existent embedding', async () => {
    const result = await store.getEmbedding('nonexistent')
    expect(result).toBeNull()
  })

  it('upserts embedding on conflict', async () => {
    await insertKnowledgeEntry(store, 'kn-1')
    const emb1 = new Float32Array([0.1, 0.2])
    await store.saveEmbedding('kn-1', emb1, 'model-v1')

    const emb2 = new Float32Array([0.3, 0.4])
    await store.saveEmbedding('kn-1', emb2, 'model-v2')

    const result = await store.getEmbedding('kn-1')
    expect(result!.model).toBe('model-v2')
    expect(result!.embedding[0]).toBeCloseTo(0.3, 5)
    expect(result!.embedding[1]).toBeCloseTo(0.4, 5)
  })

  it('returns all embeddings via getAllEmbeddings', async () => {
    await insertKnowledgeEntry(store, 'kn-1')
    await insertKnowledgeEntry(store, 'kn-2')
    await insertKnowledgeEntry(store, 'kn-3')
    await store.saveEmbedding('kn-1', new Float32Array([1, 2, 3]), 'm1')
    await store.saveEmbedding('kn-2', new Float32Array([4, 5, 6]), 'm1')
    await store.saveEmbedding('kn-3', new Float32Array([7, 8, 9]), 'm1')

    const all = await store.getAllEmbeddings()
    expect(all).toHaveLength(3)
    expect(all.map((e) => e.kn_id).sort()).toEqual(['kn-1', 'kn-2', 'kn-3'])
  })
})
