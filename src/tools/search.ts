import type { KnowledgeStorage } from '../storage/interface.js'
import type { KnowledgeEntry, LLMStatus, SearchParams, Relation } from '../types.js'
import type { LLMClient } from '../llm/client.js'
import { cosineSimilarity } from '../embedding.js'

export async function handleSearch(
  storage: KnowledgeStorage,
  params: SearchParams,
  llm?: LLMClient,
  includeLLMSynthesis?: boolean,
): Promise<{
  entries: KnowledgeEntry[]
  synthesis: string
  llmStatus: LLMStatus
}> {
  const { query, tags, project, role, limit = 10 } = params

  // 1. BM25 search
  let entries = await storage.search({ query, tags, project, limit: limit * 2 })

  // 2. Vector hybrid (if embeddings configured)
  let vectorBoosted = false
  if (llm?.embeddingConfigured && entries.length > 0) {
    try {
      const queryEmb = await llm.embed(query)
      if (queryEmb) {
        const queryVec = new Float32Array(queryEmb)
        const scored: Array<{ entry: KnowledgeEntry; score: number }> = []
        for (const entry of entries) {
          const storedEmb = await storage.getEmbedding(entry.id)
          if (storedEmb) {
            const sim = cosineSimilarity(queryVec, storedEmb)
            scored.push({ entry, score: sim })
          } else {
            scored.push({ entry, score: 0 })
          }
        }
        scored.sort((a, b) => b.score - a.score)
        entries = scored.map(s => s.entry)
        vectorBoosted = true
      }
    } catch {
      // Embedding failed, fall back to BM25 only
    }
  }

  entries = entries.slice(0, limit)

  // 3. LLM rerank + synthesis (optional)
  let synthesis = ''
  const llmStatus: LLMStatus = llm?.configured ? 'active' : 'unconfigured'

  if (includeLLMSynthesis && llm?.configured && entries.length > 0) {
    try {
      const result = await llm.rankSearchResults(query, entries)
      if (result) {
        synthesis = result.synthesis || ''
        entries = result.rankings || entries
      }
    } catch {
      // LLM rerank failed, return raw BM25 (not 'degraded' because core search works)
    }
  }

  return { entries, synthesis, llmStatus }
}
