import type { KnowledgeStorage } from '../storage/interface.js'
import { applyDecay, updateTemperature } from '../fsrs.js'

export async function handleDecaySweep(
  storage: KnowledgeStorage,
): Promise<{ decayed: number; frozen: number }> {
  const allIds = await storage.list('confirmed')
  let decayed = 0
  let frozen = 0
  const now = Date.now()

  for (const id of allIds) {
    const entry = await storage.get(id)
    if (!entry || !entry.last_accessed) continue

    const days = (now - new Date(entry.last_accessed).getTime()) / (1000 * 60 * 60 * 24)
    if (days <= 7) continue

    const result = applyDecay(
      { strength: entry.strength, stability: entry.stability, difficulty: entry.difficulty },
      days,
    )

    const temp = updateTemperature(result.strength)
    if (result.strength !== entry.strength || temp !== entry.temperature) {
      await storage.updateParams(id, {
        strength: result.strength,
        stability: result.stability,
        temperature: temp,
      })
      decayed++
      if (temp === 'frozen' && entry.temperature !== 'frozen') frozen++
    }
  }
  return { decayed, frozen }
}
