import type { KnowledgeStorage } from '../storage/interface.js'
import type { KnowledgeEntry, LLMStatus, RelevantParams } from '../types.js'
import type { LLMClient } from '../llm/client.js'
import { spreadActivation } from '../diffusion.js'

export async function handleRelevant(
  storage: KnowledgeStorage,
  params: RelevantParams,
  llm?: LLMClient,
): Promise<{ entries: KnowledgeEntry[]; llmStatus: LLMStatus }> {
  const { role, task, keywords, project, maxResults } = params
  const limit = maxResults || 5

  // 1. Get diffusion-activated entries for this role
  const activated = await spreadActivation(storage, role)
  const activationMap = new Map(activated.map(a => [a.entry.id, a.activation]))

  // 2. BM25 search on task/keywords
  const terms = [...(keywords || []), ...task.split(/\s+/).filter(w => w.length > 1)]
  const searched = terms.length > 0
    ? await storage.search({ query: terms.join(' '), project, limit: limit * 5 })
    : []

  // 3. Combine entries (activation + search results)
  const combined = new Map<string, KnowledgeEntry>()
  for (const e of searched) combined.set(e.id, e)
  for (const a of activated) combined.set(a.entry.id, a.entry)

  // 4. Filter + score
  const scored = [...combined.values()]
    .filter(e => {
      // Role filter: if entry specifies roles, current must match
      if (e.roles.length > 0 && !e.roles.includes(role)) return false
      return e.truth === 'confirmed' && e.temperature !== 'frozen'
    })
    .map(e => {
      const activation = activationMap.get(e.id) ?? 0
      const hasTaskMatch = searched.some(s => s.id === e.id)

      const roleBonus = activation > 0 ? 0.3 : 0
      const utilityBonus = activation > 0 ? 1.3 : 1.0
      const strengthScore = e.strength * 0.5 * utilityBonus
      const taskScore = hasTaskMatch ? 0.2 : 0
      const provBonus = (e.provenance === 'extracted' || e.provenance === 'user_stated') ? 0.1
        : e.provenance === 'unverified' ? -0.1 : 0

      return {
        entry: e,
        score: roleBonus + strengthScore + taskScore + provBonus,
      }
    })

  scored.sort((a, b) => b.score - a.score)
  let result = scored.slice(0, limit).map(s => s.entry)

  // 5. LLM relevance re-ranking (optional enhancement)
  let llmStatus: LLMStatus = llm?.configured ? 'degraded' : 'unconfigured'
  if (llm?.configured && result.length > 0) {
    try {
      const ranked = await llm.rankRelevant(params.task, params.keywords || [], result)
      if (ranked.length > 0) {
        const rankMap = new Map(ranked.map(r => [r.id, r.relevance]))
        result.sort((a, b) => (rankMap.get(b.id) ?? 0) - (rankMap.get(a.id) ?? 0))
      }
      llmStatus = 'active'
    } catch {
      llmStatus = 'degraded'
    }
  }

  // Record access for returned entries
  await Promise.all(result.map(e => storage.recordAccess(e.id)))

  return { entries: result, llmStatus }
}
