import type { KnowledgeStorage } from '../storage/interface.js'
import type { KnowledgeEntry, LLMStatus, RelevantParams } from '../types.js'
import type { LLMClient } from '../llm/client.js'
import { spreadActivation } from '../diffusion.js'

export async function handleRelevant(
  storage: KnowledgeStorage,
  params: RelevantParams,
  llm?: LLMClient,
): Promise<{
  entries: KnowledgeEntry[]
  synthesis: string
  llmStatus: LLMStatus
}> {
  const { role, task, keywords, project, maxResults = 5 } = params

  // 1. Diffusion activation (role-based)
  const activated = await spreadActivation(storage, role)

  // 2. BM25 boost on activated entries
  const queryTerms = [task, ...(keywords || [])].join(' ')
  let entries: KnowledgeEntry[]

  if (activated.length > 0) {
    // Score activated entries by BM25 relevance
    const bm25Results = await storage.search({ query: queryTerms, limit: maxResults * 2 })
    const bm25Ids = new Set(bm25Results.map(e => e.id))

    // Merge: activated get priority, BM25 fills remaining slots
    const merged = activated
      .filter(a => bm25Ids.has(a.entry.id))
      .slice(0, maxResults)
      .map(a => a.entry)

    const remaining = bm25Results.filter(e => !merged.find(m => m.id === e.id))
    entries = [...merged, ...remaining].slice(0, maxResults)
  } else {
    // No role config — pure BM25
    entries = await storage.search({ query: queryTerms, limit: maxResults })
  }

  // 3. LLM synthesis
  const llmStatus: LLMStatus = llm?.configured ? 'active' : 'unconfigured'
  let synthesis = ''
  if (llm?.configured && entries.length > 0) {
    try {
      const result = await llm.rankSearchResults(queryTerms, entries)
      if (result) {
        synthesis = result.synthesis || ''
        entries = result.rankings || entries
      }
    } catch {
      // LLM rerank failed gracefully
    }
  }

  return { entries: entries.slice(0, maxResults), synthesis, llmStatus }
}
