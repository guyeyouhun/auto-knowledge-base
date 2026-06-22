import type { KnowledgeStorage } from '../storage/interface.js'
import type { KnowledgeEntry, RelevantParams } from '../types.js'

export async function handleRelevant(
  storage: KnowledgeStorage,
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

  return { entries: candidates.slice(0, limit) }
}
