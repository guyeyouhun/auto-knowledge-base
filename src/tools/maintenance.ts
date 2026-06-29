import type { KnowledgeStorage } from '../storage/interface.js'
import { applyDecay, updateTemperature } from '../fsrs.js'

export async function handleDecaySweep(
  storage: KnowledgeStorage,
): Promise<{
  decayed: number
  frozen: number
  refreshed: number
}> {
  const staleEntries = await storage.getStaleEntries(7)
  let decayed = 0
  let frozen = 0

  for (const entry of staleEntries) {
    const daysSinceAccess = Math.floor(
      (Date.now() - new Date(entry.updated_at).getTime()) / (1000 * 60 * 60 * 24),
    )

    const newParams = applyDecay(
      {
        strength: entry.strength,
        stability: entry.stability,
        difficulty: entry.difficulty,
      },
      daysSinceAccess,
    )

    const newTemp = updateTemperature(newParams.strength)

    await storage.updateFSRSParams(entry.id, newParams, newTemp)
    decayed++

    if (newTemp === 'frozen') {
      frozen++
      // Queue refresh for frozen entries
      await storage.queueRefresh(entry.id, `kb:${entry.id}`, 'unknown', 'decay')
    }
  }

  return { decayed, frozen, refreshed: frozen }
}
