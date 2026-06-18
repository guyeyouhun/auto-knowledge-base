import type { KnowledgeStorage } from '../storage/interface.js'
import type { LLMClient } from '../llm/client.js'
import type { KnowledgeEntry, RelevantParams } from '../types.js'

export async function handleRelevant(
  storage: KnowledgeStorage,
  llm: LLMClient,
  params: RelevantParams,
): Promise<{ entries: KnowledgeEntry[] }> {
  const { task, keywords, project, maxResults } = params
  const limit = maxResults || 5

  // 1. 提取搜索词
  const searchTerms = [
    ...(keywords || []),
    ...(task ? task.split(/\s+/).filter(w => w.length > 1) : []),
  ]

  if (searchTerms.length === 0) return { entries: [] }

  // 2. 关键词搜索
  const candidates = await storage.search({
    query: searchTerms.join(' '),
    project,
    limit: limit * 3,
  })

  if (candidates.length === 0) return { entries: [] }

  // 3. LLM 关联推理
  if (llm.configured) {
    const ranked = await llm.rankRelevant(
      task,
      keywords || [],
      candidates.map(e => ({ id: e.id, title: e.title, summary: e.summary, tags: e.tags })),
    )

    const rankMap = new Map(ranked.map(r => [r.id, r]))
    candidates.sort((a, b) => {
      const ra = rankMap.get(a.id)?.relevance ?? 0
      const rb = rankMap.get(b.id)?.relevance ?? 0
      return rb - ra
    })
  }

  return { entries: candidates.slice(0, limit) }
}
