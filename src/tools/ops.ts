import type { KnowledgeStorage } from '../storage/interface.js'
import type { KnowledgeEntry } from '../types.js'

export async function handleExport(
  storage: KnowledgeStorage,
): Promise<{ entries: KnowledgeEntry[]; exportedAt: string; count: number }> {
  const ids = await storage.list()
  const entries: KnowledgeEntry[] = []
  for (const id of ids) {
    const entry = await storage.get(id)
    if (entry) entries.push(entry)
  }
  return { entries, exportedAt: new Date().toISOString(), count: entries.length }
}

export async function handleImport(
  storage: KnowledgeStorage,
  entries: KnowledgeEntry[],
): Promise<{ imported: number; skipped: number }> {
  let imported = 0
  let skipped = 0
  for (const entry of entries) {
    const existing = await storage.get(entry.id)
    if (existing) {
      skipped++
      continue
    }
    await storage.save(entry)
    imported++
  }
  return { imported, skipped }
}
