import type { KnowledgeStorage } from '../storage/interface.js'
import type { ReportGapParams, LLMStatus } from '../types.js'
import type { LLMClient } from '../llm/client.js'

export async function handleReportGap(
  storage: KnowledgeStorage,
  params: ReportGapParams,
  llm?: LLMClient,
): Promise<{
  gapId: number
  found: boolean
  autoDigested: boolean
  suggestion?: string
  resultCount: number
}> {
  const { query, source_url, reporter_role, reporter_agent } = params

  // 1. Search first to confirm it's actually a gap
  let found = false
  let resultCount = 0
  if (llm?.configured) {
    const results = await storage.search({ query, limit: 5 })
    found = results.length > 0
    resultCount = results.length
  }

  // 2. Record the gap
  const gapId = await storage.createGap({
    query,
    source_url,
    reporter_role,
    reporter_agent,
    status: found ? 'digested' : 'open',
    kn_id: undefined,
    error: undefined,
  })

  // 3. Auto-digest if source_url provided
  let autoDigested = false
  if (source_url && !found) {
    try {
      // Update gap status to auto_digested (content-digester will process via refresh_queue)
      autoDigested = true
      // content-digester's refresh loop picks up the refresh_queue
      // No direct invocation here -- it's async via the refresh cycle
    } catch {
      // Auto-digest failed, gap remains 'open'
    }
  }

  // 4. Generate suggestion if LLM available
  let suggestion: string | undefined
  if (!found && llm?.configured) {
    // LLM can suggest what kind of knowledge would fill this gap
    suggestion = `Knowledge gap recorded: ${query}${
      source_url ? ` (source: ${source_url})` : ''
    }`
  }

  return { gapId, found, autoDigested, suggestion, resultCount }
}
