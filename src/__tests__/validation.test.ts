import { describe, it, expect } from 'vitest'
import { SearchSchema, LearnSchema, ConfirmSchema } from '../validation.js'

describe('SearchSchema', () => {
  it('accepts valid search params', () => {
    const result = SearchSchema.safeParse({ query: 'react hooks' })
    expect(result.success).toBe(true)
  })

  it('rejects empty query', () => {
    const result = SearchSchema.safeParse({ query: '' })
    expect(result.success).toBe(false)
  })

  it('accepts optional fields', () => {
    const result = SearchSchema.safeParse({
      query: 'test',
      tags: ['react', 'hooks'],
      project: 'frontend',
      limit: 10,
    })
    expect(result.success).toBe(true)
  })
})

describe('LearnSchema', () => {
  it('accepts valid learn params', () => {
    const result = LearnSchema.safeParse({ content: 'some knowledge content' })
    expect(result.success).toBe(true)
  })

  it('rejects empty content', () => {
    const result = LearnSchema.safeParse({ content: '' })
    expect(result.success).toBe(false)
  })
})

describe('ConfirmSchema', () => {
  it('accepts valid UUID', () => {
    const result = ConfirmSchema.safeParse({ id: '550e8400-e29b-41d4-a716-446655440000' })
    expect(result.success).toBe(true)
  })

  it('rejects non-UUID', () => {
    const result = ConfirmSchema.safeParse({ id: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })
})
