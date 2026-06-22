import { randomUUID } from 'crypto'
import type { KnowledgeStorage } from '../storage/interface.js'
import type { LLMClient } from '../llm/client.js'
import type { KnowledgeEntry, LearnParams } from '../types.js'

export async function handleLearn(
  storage: KnowledgeStorage,
  llm: LLMClient,
  params: LearnParams,
): Promise<{ id: string; title: string; truth: string }> {
  const { content, type, title, tags, source } = params

  // 尝试 LLM 提取
  let extracted = llm.configured ? await llm.extract(content) : null

  const entry: KnowledgeEntry = {
    id: randomUUID(),
    type: extracted?.type || type || 'concept',
    title: extracted?.title || title || content.slice(0, 60).replace(/\n/g, ' ').trim(),
    summary: extracted?.summary || content.slice(0, 200).replace(/\n/g, ' ').trim(),
    content,
    tags: extracted?.tags || tags || [],
    roles: [],
    tasks: [],
    truth: extracted ? 'confirmed' : 'staging',
    provenance: extracted ? 'extracted' : 'unverified',
    strength: 1,
    stability: 1,
    difficulty: 1,
    temperature: 'warm',
    practice_count: 0,
    practice_success: 0,
    source: source || 'knowledge_learn',
    relations: extracted?.relations || [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  await storage.save(entry)
  return { id: entry.id, title: entry.title, truth: entry.truth }
}

export async function handleLearnStaged(
  storage: KnowledgeStorage,
  llm: LLMClient,
  content: string,
  source?: string,
): Promise<{ id: string; title: string }> {
  let extracted = llm.configured ? await llm.extract(content) : null

  const entry: KnowledgeEntry = {
    id: randomUUID(),
    type: extracted?.type || 'concept',
    title: extracted?.title || content.slice(0, 60).replace(/\n/g, ' ').trim(),
    summary: extracted?.summary || '',
    content,
    tags: extracted?.tags || [],
    roles: [],
    tasks: [],
    truth: 'staging',
    provenance: extracted ? 'extracted' : 'unverified',
    strength: 1,
    stability: 1,
    difficulty: 1,
    temperature: 'warm',
    practice_count: 0,
    practice_success: 0,
    source: source || 'staged',
    relations: extracted?.relations || [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  await storage.save(entry)
  return { id: entry.id, title: entry.title }
}
