import { randomUUID } from 'crypto'
import type { KnowledgeStorage } from '../storage/interface.js'
import type { KnowledgeEntry, LearnParams, LLMStatus } from '../types.js'
import type { LLMClient } from '../llm/client.js'
import { generateEmbedding } from '../embedding.js'

export async function handleLearn(
  storage: KnowledgeStorage,
  params: LearnParams,
  llm?: LLMClient,
): Promise<{ id: string; title: string; dedup: boolean; llmStatus: LLMStatus }> {
  const { content, title, summary, tags, roles, tasks, type, source, relations, contradicts } = params

  // 1. LLM extraction (optional enhancement)
  let llmStatus: LLMStatus = llm?.configured ? 'active' : 'unconfigured'
  let extractedTitle = title
  let extractedTags = tags
  let extractedSummary = summary
  let extractedType = type

  if (llm?.configured) {
    try {
      const extracted = await llm.extract(content)
      if (extracted) {
        if (!extractedTitle) extractedTitle = extracted.title
        if (!extractedTags?.length) extractedTags = extracted.tags
        if (!extractedSummary) extractedSummary = extracted.summary
        if (!extractedType) extractedType = extracted.type
        llmStatus = 'active'
      } else {
        llmStatus = 'degraded'
      }
    } catch {
      llmStatus = 'degraded'
    }
  }

  // 2. Dedup check
  const similar = await storage.findSimilar(extractedTitle || content.slice(0, 60), content)

  if (similar.length > 0 && extractedTitle) {
    const exact = similar.find(e => e.title.toLowerCase() === extractedTitle!.toLowerCase())
    if (exact) {
      exact.practice_count += 1
      exact.updated_at = new Date().toISOString()
      if (content) exact.content = content
      await storage.save(exact)
      return { id: exact.id, title: exact.title, dedup: true, llmStatus }
    }
  }

  // 3. Create new entry (always staging)
  const entry: KnowledgeEntry = {
    id: randomUUID(),
    type: extractedType || 'concept',
    title: extractedTitle || content.slice(0, 60).replace(/\n/g, ' ').trim(),
    summary: extractedSummary || '',
    content,
    code_example: undefined,
    tags: extractedTags || [],
    roles: roles || [],
    tasks: tasks || [],
    truth: 'staging',
    provenance: llmStatus !== 'unconfigured' ? 'extracted' : 'unverified',
    evidence: undefined,
    strength: 0.8,
    stability: 0.8,
    difficulty: 0.3,
    temperature: 'warm',
    practice_count: 0,
    practice_success: 0,
    source: source || undefined,
    relations: relations || [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  await storage.save(entry)

  // 4. Handle contradictions
  if (contradicts && contradicts.length > 0) {
    for (const targetId of contradicts) {
      await storage.addRelation(entry.id, targetId, 'contradicts')
    }
  }

  // 5. Handle explicit relations
  if (relations && relations.length > 0) {
    for (const rel of relations) {
      const existing = await storage.search({ query: rel.target, limit: 1 })
      if (existing.length > 0) {
        await storage.addRelation(entry.id, existing[0].id, rel.type)
      }
    }
  }

  // 6. Fire-and-forget embedding
  if (llm?.embeddingConfigured) {
    generateEmbedding(content, llm)
      .then(emb => {
        if (emb) storage.saveEmbedding(entry.id, emb).catch(() => {})
      })
      .catch(() => {})
  }

  return { id: entry.id, title: entry.title, dedup: false, llmStatus }
}
