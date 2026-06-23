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

describe('handleLearn with LLM extraction', () => {
  let store: SqliteStore
  let tempDir: string

  const mockLLM = {
    configured: true,
    extract: async (_content: string) => ({
      title: 'LLM Title',
      summary: 'LLM summary',
      tags: ['llm', 'auto'],
      type: 'concept',
      relations: [],
      projects: [],
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

  it('uses LLM extraction when no title or tags provided', async () => {
    const result = await handleLearn(store, { content: 'some knowledge content' }, mockLLM)
    expect(result.title).toBe('LLM Title')
    expect(result.llmStatus).toBe('active')
  })

  it('user-provided title overrides LLM extraction', async () => {
    const result = await handleLearn(store, { content: 'some content', title: 'Manual Title' }, mockLLM)
    expect(result.title).toBe('Manual Title')
    expect(result.llmStatus).toBe('active')
  })

  it('user-provided params fall back to LLM when title is empty', async () => {
    const result = await handleLearn(store, { content: 'some content', tags: ['manual'] }, mockLLM)
    expect(result.title).toBe('LLM Title')
    expect(result.llmStatus).toBe('active')
  })

  it('degrades gracefully when LLM extraction fails', async () => {
    const brokenLLM = {
      configured: true,
      extract: async () => { throw new Error('API error') },
    } as any
    const result = await handleLearn(store, { content: 'fallback content' }, brokenLLM)
    expect(result.title).toBe('fallback content')
    expect(result.llmStatus).toBe('degraded')
  })

  it('uses defaults when LLM not configured', async () => {
    const noLLM = { configured: false } as any
    const result = await handleLearn(store, { content: 'plain content' }, noLLM)
    expect(result.title).toBe('plain content')
    expect(result.llmStatus).toBe('unconfigured')
  })
})
