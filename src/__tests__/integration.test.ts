import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { SqliteStore } from '../storage/sqlite-store.js'
import { handleSearch } from '../tools/search.js'
import { handleLearn } from '../tools/learn.js'
import { handleConfirm } from '../tools/confirm.js'
import { createTempDir, cleanupTempDir } from './setup.js'

describe('integration: learn -> confirm -> search', () => {
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

  it('full pipeline: learn staging -> confirm -> search finds it', async () => {
    // Learn
    const learned = await handleLearn(store, {
      content: 'Vite is a build tool that uses Rollup under the hood',
      title: 'Vite Build Tool',
      tags: ['vite', 'build'],
      roles: ['frontend'],
    })
    expect(learned.dedup).toBe(false)

    // Confirm
    const confirmed = await handleConfirm(store, learned.id)
    expect(confirmed.success).toBe(true)

    // Search should now find it
    const results = await handleSearch(store, { query: 'vite build tool' })
    expect(results.entries.length).toBe(1)
    expect(results.entries[0].title).toBe('Vite Build Tool')
  })
})
