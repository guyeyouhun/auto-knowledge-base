import { randomUUID } from 'crypto'
import type { KnowledgeStorage } from '../storage/interface.js'
import type { LLMClient } from '../llm/client.js'
import type { KnowledgeEntry, LearnParams } from '../types.js'

export async function handleLearn(
  storage: KnowledgeStorage,
  llm: LLMClient,
  params: LearnParams,
): Promise<{ id: string; title: string; confidence: string }> {
  const { content, type, title, project, tags, source } = params

  // 尝试 LLM 提取
  let extracted = llm.configured ? await llm.extract(content) : null

  const entry: KnowledgeEntry = {
    id: randomUUID(),
    type: extracted?.type || type || 'concept',
    title: extracted?.title || title || content.slice(0, 60).replace(/\n/g, ' ').trim(),
    summary: extracted?.summary || content.slice(0, 200).replace(/\n/g, ' ').trim(),
    content,
    tags: extracted?.tags || tags || [],
    relations: extracted?.relations || [],
    projects: extracted?.projects || (project ? [project] : []),
    confidence: extracted ? 'confirmed' : 'staging',
    source: source || 'knowledge_learn',
    llmGenerated: !!extracted,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await storage.save(entry)
  return { id: entry.id, title: entry.title, confidence: entry.confidence }
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
    relations: extracted?.relations || [],
    projects: extracted?.projects || [],
    confidence: 'staging',
    source: source || 'staged',
    llmGenerated: !!extracted,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await storage.save(entry)
  return { id: entry.id, title: entry.title }
}
