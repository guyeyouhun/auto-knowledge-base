import type { KnowledgeStorage } from '../storage/interface.js'

export async function handleAuditQuery(
  storage: KnowledgeStorage,
  limit?: number,
  operation?: string,
): Promise<{ entries: any[] }> {
  const entries = await storage.queryAudit(limit, operation)
  return { entries }
}
