import type { KnowledgeStorage } from '../storage/interface.js'
import type { SearchParams, KnowledgeEntry, LLMStatus } from '../types.js'
import type { LLMClient } from '../llm/client.js'
import { generateEmbedding, cosineSimilarity } from '../embedding.js'

const RRF_K = 60

/**
 * Perform reciprocal rank fusion between BM25 and vector search results.
 */
function rrfMerge(
  bm25Entries: KnowledgeEntry[],
  vectorIds: string[],
): KnowledgeEntry[] {
  const entryMap = new Map<string, KnowledgeEntry>()
  bm25Entries.forEach((e, i) => entryMap.set(e.id, e))
  vectorIds.forEach((id) => {
    if (!entryMap.has(id)) {
      // Vector-only results are not in entryMap, skip (we need the full entry)
    }
  })

  // Compute RRF score for BM25 results
  const scores = new Map<string, number>()
  bm25Entries.forEach((e, i) => {
    const bm25Rank = i
    const vectorRank = vectorIds.indexOf(e.id)
    const vRank = vectorRank === -1 ? vectorIds.length + 1 : vectorRank
    const score = 0.5 * (1 / (bm25Rank + RRF_K)) + 0.5 * (1 / (vRank + RRF_K))
    scores.set(e.id, score)
  })

  // Add scores for vector-only entries
  vectorIds.forEach((id, i) => {
    if (!scores.has(id)) {
      const bm25Rank = bm25Entries.length + 1
      const score = 0.5 * (1 / (bm25Rank + RRF_K)) + 0.5 * (1 / (i + RRF_K))
      scores.set(id, score)
    }
  })

  // Sort by RRF score descending
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => {
      const entry = entryMap.get(id)
      if (entry) return entry
      // Fallback: try to find the id in bm25 entries again
      return bm25Entries.find((e) => e.id === id)!
    })
    .filter(Boolean)
}

export async function handleSearch(
  storage: KnowledgeStorage,
  params: SearchParams,
  llm?: LLMClient,
  useVector?: boolean,
): Promise<{ entries: KnowledgeEntry[]; synthesis: string; llmStatus: LLMStatus }> {
  const bm25Entries = await storage.search(params)
  let entries = bm25Entries
  let synthesis = ''
  let llmStatus: LLMStatus = llm?.configured ? 'degraded' : 'unconfigured'

  // 1. Vector search + RRF fusion (existing logic)
  if (useVector && llm?.configured && bm25Entries.length > 0) {
    try {
      const queryVector = await generateEmbedding(params.query, llm)
      if (queryVector) {
        const allEmbeddings = await storage.getAllEmbeddings()
        if (allEmbeddings.length > 0) {
          const scored = allEmbeddings
            .map((e) => ({
              id: e.kn_id,
              similarity: cosineSimilarity(queryVector, e.embedding),
            }))
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 5)
            .map((e) => e.id)

          if (scored.length > 0) {
            entries = rrfMerge(bm25Entries, scored)
          }
        }
      }
    } catch {
      // Silently fall back to BM25-only
    }
  }

  // 2. LLM semantic rerank + synthesis
  if (llm?.configured && entries.length > 0) {
    try {
      const { rankings, synthesis: llmSynthesis } = await llm.rankSearchResults(params.query, entries)
      if (rankings.length > 0) {
        const rankMap = new Map(rankings.map(r => [r.id, r.relevance]))
        entries.sort((a, b) => (rankMap.get(b.id) ?? 0) - (rankMap.get(a.id) ?? 0))
      }
      synthesis = llmSynthesis
      llmStatus = 'active'
    } catch {
      llmStatus = 'degraded'
    }
  }

  return { entries, synthesis, llmStatus }
}
