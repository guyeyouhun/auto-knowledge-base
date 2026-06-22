import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { SqliteStore } from '../storage/sqlite-store.js'
import { createTempDir, cleanupTempDir } from './setup.js'

describe('audit logging', () => {
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

  it('logs and queries an audit entry', async () => {
    await store.logAudit('kn-1', 'learn', 'title: React Hooks')
    const entries = await store.queryAudit()
    expect(entries.length).toBe(1)
    expect(entries[0].kn_id).toBe('kn-1')
    expect(entries[0].operation).toBe('learn')
    expect(entries[0].detail).toBe('title: React Hooks')
  })

  it('queries with limit', async () => {
    await store.logAudit(null, 'search', 'query: test')
    await store.logAudit(null, 'search', 'query: foo')
    await store.logAudit(null, 'learn', 'title: Bar')

    const limited = await store.queryAudit(2)
    expect(limited.length).toBe(2)
  })

  it('filters by operation', async () => {
    await store.logAudit(null, 'search', 'query: vite')
    await store.logAudit(null, 'learn', 'title: Vite')
    await store.logAudit(null, 'confirm', 'confirmed Vite')

    const searches = await store.queryAudit(10, 'search')
    expect(searches.length).toBe(1)
    expect(searches[0].operation).toBe('search')
  })

  it('returns entries in reverse chronological order', async () => {
    await store.logAudit(null, 'search', 'first')
    await store.logAudit(null, 'search', 'second')
    await store.logAudit(null, 'search', 'third')

    const entries = await store.queryAudit(3)
    expect(entries[0].detail).toBe('third')
    expect(entries[1].detail).toBe('second')
    expect(entries[2].detail).toBe('first')
  })

  it('logs with null kn_id', async () => {
    await store.logAudit(null, 'search', 'query: no kn')
    const entries = await store.queryAudit()
    expect(entries.length).toBe(1)
    expect(entries[0].kn_id).toBeNull()
  })
})
