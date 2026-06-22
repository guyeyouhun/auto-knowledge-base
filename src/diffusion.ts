import type { KnowledgeStorage } from './storage/interface.js'
import type { KnowledgeEntry } from './types.js'

const DECAY = 0.5
const THRESHOLD = 0.05

export interface ActivatedEntry {
  entry: KnowledgeEntry
  activation: number
  hops: number
}

export async function spreadActivation(
  storage: KnowledgeStorage,
  role: string,
): Promise<ActivatedEntry[]> {
  const roleConfig = await storage.getRoleConfig(role)
  if (!roleConfig || roleConfig.entry_kn_ids.length === 0) return []

  const visited = new Set<string>()
  const activated: Map<string, { activation: number; hops: number }> = new Map()
  const queue: Array<{ id: string; activation: number; hops: number }> = []

  // Start with entry nodes at activation 1.0
  for (const id of roleConfig.entry_kn_ids) {
    if (!visited.has(id)) {
      visited.add(id)
      queue.push({ id, activation: 1.0, hops: 0 })
    }
  }

  // BFS with decay
  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.activation < THRESHOLD) continue

    // Record activation (take max if already activated)
    const existing = activated.get(current.id)
    if (!existing || current.activation > existing.activation) {
      activated.set(current.id, { activation: current.activation, hops: current.hops })
    }

    // Stop spreading at max depth
    if (current.hops >= (roleConfig.spread_depth || 2)) continue

    // Get neighbors via relations
    const neighbors = await storage.getRelations(current.id)
    for (const rel of neighbors) {
      // Determine target id (follow the relation to the other end)
      const targetId = rel.target_kn === current.id ? rel.source_kn : rel.target_kn
      if (!visited.has(targetId)) {
        visited.add(targetId)
        queue.push({
          id: targetId,
          activation: current.activation * DECAY,
          hops: current.hops + 1,
        })
      }
    }
  }

  // Fetch entries
  const results: ActivatedEntry[] = []
  for (const [id, info] of activated) {
    const entry = await storage.get(id)
    if (entry && entry.truth === 'confirmed' && entry.temperature !== 'frozen') {
      results.push({ entry, activation: info.activation, hops: info.hops })
    }
  }

  results.sort((a, b) => b.activation - a.activation)
  return results
}
