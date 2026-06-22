import { randomUUID } from 'crypto'
import type { KnowledgeStorage } from '../storage/interface.js'
import type { KnowledgeEntry, LearnParams } from '../types.js'

export async function handleLearn(
  storage: KnowledgeStorage,
  params: LearnParams,
): Promise<{ id: string; title: string; dedup: boolean }> {
  const { content, title, summary, tags, roles, tasks, type, source, relations } = params

  // 1. Dedup check — find similar entries
  const similar = await storage.findSimilar(title || content.slice(0, 60), content)

  // If very similar, update existing instead of creating new
  if (similar.length > 0 && title) {
    const exact = similar.find(e => e.title.toLowerCase() === title.toLowerCase())
    if (exact) {
      // Same title — increment usage and update content
      exact.practice_count += 1
      exact.updated_at = new Date().toISOString()
      if (content) exact.content = content
      await storage.save(exact)
      return { id: exact.id, title: exact.title, dedup: true }
    }
  }

  // 2. Create new entry (always staging)
  const entry: KnowledgeEntry = {
    id: randomUUID(),
    type: type || 'concept',
    title: title || content.slice(0, 60).replace(/\n/g, ' ').trim(),
    summary: summary || '',
    content,
    code_example: undefined,
    tags: tags || [],
    roles: roles || [],
    tasks: tasks || [],
    truth: 'staging',
    provenance: 'user_stated',
    strength: 0.8,
    stability: 0.8,
    difficulty: 0.3,
    temperature: 'warm',
    practice_count: 0,
    practice_success: 0,
    relations: relations || [],
    source: source || 'knowledge_learn',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  // If similar found but not exact match, add relations
  if (similar.length > 0) {
    for (const s of similar.slice(0, 3)) {
      entry.relations.push({ target: s.id, type: 'references' })
    }
  }

  await storage.save(entry)
  return { id: entry.id, title: entry.title, dedup: false }
}
