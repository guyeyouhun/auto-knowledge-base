import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { SqliteStore } from '../storage/sqlite-store.js'
import { handleLearn } from '../tools/learn.js'
import { handleConfirm } from '../tools/confirm.js'
import { createTempDir, cleanupTempDir } from './setup.js'

describe('handleLearn', () => {
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

  it('stores an entry as staging by default', async () => {
    const result = await handleLearn(store, {
      content: 'React useState is a hook for state management',
      title: 'useState Hook',
      tags: ['react', 'hooks'],
      roles: ['frontend'],
    })
    expect(result.title).toBe('useState Hook')
    expect(result.dedup).toBe(false)

    const entry = await store.get(result.id)
    expect(entry!.truth).toBe('staging')
  })

  it('detects duplicate by title', async () => {
    await handleLearn(store, { content: 'First', title: 'React Hook' })
    const result = await handleLearn(store, { content: 'Second', title: 'React Hook' })
    expect(result.dedup).toBe(true)
  })

  it('creates entry even without title', async () => {
    const result = await handleLearn(store, { content: 'Some knowledge content here' })
    expect(result.dedup).toBe(false)
    expect(result.title.length).toBeGreaterThan(0)
  })
})

describe('handleConfirm', () => {
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

  it('confirms a staging entry', async () => {
    const { id } = await handleLearn(store, { content: 'test', title: 'Test' })
    const result = await handleConfirm(store, id)
    expect(result.success).toBe(true)
    const entry = await store.get(id)
    expect(entry!.truth).toBe('confirmed')
  })

  it('fails for non-existent entry', async () => {
    const result = await handleConfirm(store, 'does-not-exist')
    expect(result.success).toBe(false)
  })

  it('fails for already confirmed entry', async () => {
    const { id } = await handleLearn(store, { content: 'test', title: 'Test' })
    await handleConfirm(store, id)
    const result = await handleConfirm(store, id)
    expect(result.success).toBe(false)
  })
})
