import type { KnowledgeStorage } from '../storage/interface.js'
import type { LLMClient } from '../llm/client.js'
import type { SearchParams, KnowledgeEntry } from '../types.js'

export async function handleSearch(
  storage: KnowledgeStorage,
  llm: LLMClient,
  params: SearchParams,
): Promise<{ entries: KnowledgeEntry[]; synthesis: string }> {
  // 1. 关键词搜索
  const entries = await storage.search(params)

  if (!llm.configured || entries.length === 0) {
    return { entries, synthesis: '' }
  }

  // 2. LLM 语义排序
  const ranked = await llm.rankSearchResults(
    params.query,
    entries.map(e => ({ id: e.id, title: e.title, summary: e.summary, tags: e.tags })),
  )

  // 3. 按 LLM 评分排序
  const rankMap = new Map(ranked.map(r => [r.id, r]))
  entries.sort((a, b) => {
    const ra = rankMap.get(a.id)?.relevance ?? 0
    const rb = rankMap.get(b.id)?.relevance ?? 0
    return rb - ra
  })

  // 简单综合
  const synthesis = ranked.length > 0
    ? `基于语义匹配返回 ${entries.length} 条结果，最相关：${ranked.slice(0, 3).map(r => r.reason).filter(Boolean).join('；')}`
    : ''

  return { entries, synthesis }
}
