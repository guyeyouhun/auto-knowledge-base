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
  let llmStatus: LLMStatus = llm?.configured ? 'degraded' : 'unconfigured'
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

  // Similar and contradiction handling (unchanged)
  if (similar.length > 0) {
    for (const s of similar.slice(0, 3)) {
      entry.relations.push({ target: s.id, type: 'references' })
    }
  }

  if (contradicts && contradicts.length > 0) {
    let hasExisting = false
    for (const targetId of contradicts) {
      const target = await storage.get(targetId)
      if (target) {
        hasExisting = true
        await storage.updateParams(targetId, { truth: 'disputed' })
        entry.relations.push({ target: targetId, type: 'contradicts' })
      }
    }
    if (hasExisting) {
      entry.truth = 'disputed'
    }
  }

  await storage.save(entry)

  // 4. Generate embedding (non-blocking — entry already stored)
  if (llm?.configured && llmStatus === 'active') {
    generateEmbedding(content, llm).then(embedding => {
      if (embedding) {
        return storage.saveEmbedding(entry.id, embedding, llm!.modelName)
      }
    }).catch(err => {
      console.warn('[learn] embedding failed:', err)
    })
  }

  return { id: entry.id, title: entry.title, dedup: false, llmStatus }
}
