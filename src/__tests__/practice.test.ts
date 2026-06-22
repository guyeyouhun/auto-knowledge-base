import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { SqliteStore } from '../storage/sqlite-store.js'
import { createTempDir, cleanupTempDir } from './setup.js'
import type { KnowledgeEntry } from '../types.js'

function makeEntry(overrides?: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: overrides?.id || crypto.randomUUID(),
    type: overrides?.type || 'concept',
    title: overrides?.title || 'Practice Test Entry',
    summary: 'Test entry for practice tracking',
    content: 'Test content here',
    tags: overrides?.tags || ['test'],
    roles: overrides?.roles || ['developer'],
    tasks: overrides?.tasks || [],
    truth: overrides?.truth || 'confirmed',
    provenance: overrides?.provenance || 'extracted',
    strength: 0.5,
    stability: 10,
    difficulty: 0.3,
    temperature: 'warm',
    practice_count: 0,
    practice_success: 0,
    relations: overrides?.relations || [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

describe('recordAccess', () => {
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

  it('increments practice_count', async () => {
    const entry = makeEntry()
    await store.save(entry)

    await store.recordAccess(entry.id)
    const retrieved = await store.get(entry.id)
    expect(retrieved!.practice_count).toBe(1)

    await store.recordAccess(entry.id)
    const retrieved2 = await store.get(entry.id)
    expect(retrieved2!.practice_count).toBe(2)
  })

  it('sets last_accessed', async () => {
    const entry = makeEntry()
    await store.save(entry)

    await store.recordAccess(entry.id)
    const retrieved = await store.get(entry.id)
    expect(retrieved!.last_accessed).not.toBeNull()
  })
})

describe('recordPractice', () => {
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

  it('does nothing for nonexistent id', async () => {
    await store.recordPractice('nonexistent', true)
    // Should not throw
    expect(true).toBe(true)
  })

  it('updates strength and temperature on success', async () => {
    const entry = makeEntry()
    await store.save(entry)

    await store.recordPractice(entry.id, true)
    const retrieved = await store.get(entry.id)

    // strength: 0.5 + 0.05 * (1 - 0.5) = 0.525
    expect(retrieved!.strength).toBeCloseTo(0.525, 5)
    // stability: 10 * 1.3 = 13
    expect(retrieved!.stability).toBeCloseTo(13, 5)
    // difficulty unchanged
    expect(retrieved!.difficulty).toBe(0.3)
    // temperature: 0.525 < 0.6 => 'cool'
    expect(retrieved!.temperature).toBe('cool')
  })

  it('updates strength and difficulty on failure', async () => {
    const entry = makeEntry()
    await store.save(entry)

    await store.recordPractice(entry.id, false)
    const retrieved = await store.get(entry.id)

    // strength: 0.5 - 0.1 = 0.4
    expect(retrieved!.strength).toBeCloseTo(0.4, 5)
    // difficulty: 0.3 * 1.1 = 0.33
    expect(retrieved!.difficulty).toBeCloseTo(0.33, 5)
    // stability unchanged
    expect(retrieved!.stability).toBe(10)
    // temperature: 0.4 => 'cool'
    expect(retrieved!.temperature).toBe('cool')
  })

  it('increments practice_count and practice_success on success', async () => {
    const entry = makeEntry()
    await store.save(entry)

    await store.recordPractice(entry.id, true)
    const retrieved = await store.get(entry.id)

    expect(retrieved!.practice_count).toBe(1)
    expect(retrieved!.practice_success).toBe(1)
  })

  it('increments practice_count but not practice_success on failure', async () => {
    const entry = makeEntry()
    await store.save(entry)

    await store.recordPractice(entry.id, false)
    const retrieved = await store.get(entry.id)

    expect(retrieved!.practice_count).toBe(1)
    expect(retrieved!.practice_success).toBe(0)
  })
})
