import type { KnowledgeStorage } from '../storage/interface.js'
import type { KnowledgeEntry, RelevantParams } from '../types.js'
import { spreadActivation } from '../diffusion.js'

export async function handleRelevant(
  storage: KnowledgeStorage,
  params: RelevantParams,
): Promise<{ entries: KnowledgeEntry[] }> {
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
  const result = scored.slice(0, limit).map(s => s.entry)

  // Record access for returned entries
  await Promise.all(result.map(e => storage.recordAccess(e.id)))

  return { entries: result }
}
