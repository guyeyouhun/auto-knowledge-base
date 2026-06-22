import type { KnowledgeStorage } from '../storage/interface.js'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export async function handleStatus(
  storage: KnowledgeStorage,
): Promise<{
  entryCount: number
  byTruth: Record<string, number>
  byTemperature: Record<string, number>
  relationCount: number
  embeddingCount: number
  dbSizeBytes: number
  dbSizeHuman: string
  storageType: string
}> {
  const health = await storage.health()
  const stats = await storage.getStats()
  return {
    entryCount: health.count,
    byTruth: stats.byTruth,
    byTemperature: stats.byTemperature,
    relationCount: stats.relationCount,
    embeddingCount: stats.embeddingCount,
    dbSizeBytes: stats.dbSizeBytes,
    dbSizeHuman: formatBytes(stats.dbSizeBytes),
    storageType: 'sqlite',
  }
}
