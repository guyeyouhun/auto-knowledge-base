import { z } from 'zod'

export const SearchSchema = z.object({
  query: z.string().min(1, 'query is required'),
  tags: z.array(z.string()).optional(),
  project: z.string().optional(),
  role: z.string().optional(),
  limit: z.number().int().positive().optional(),
})

export const LearnSchema = z.object({
  content: z.string().min(1, 'content is required'),
  title: z.string().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional(),
  tasks: z.array(z.string()).optional(),
  type: z.enum(['project', 'pattern', 'concept', 'decision']).optional(),
  source: z.string().optional(),
  contradicts: z.array(z.string()).optional(),
  relations: z.array(z.object({
    target: z.string(),
    type: z.enum(['references', 'contradicts', 'supersedes', 'derives_from', 'extends', 'implements']),
  })).optional(),
})

export const RelevantSchema = z.object({
  role: z.string().min(1, 'role is required'),
  task: z.string().min(1, 'task is required'),
  keywords: z.array(z.string()).optional(),
  project: z.string().optional(),
  maxResults: z.number().int().positive().optional(),
})

export const ConfirmSchema = z.object({
  id: z.string().uuid('valid knowledge ID required'),
})

export const RoleConfigSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('get'), role: z.string().min(1) }),
  z.object({
    action: z.literal('set'),
    role: z.string().min(1),
    entry_kn_ids: z.array(z.string()),
    spread_depth: z.number().int().min(1),
    context_budget: z.number().int().min(1),
    priority_tasks: z.array(z.string()),
  }),
  z.object({ action: z.literal('list') }),
])

export const SearchResultSchema = z.object({
  entries: z.array(z.any()),
  synthesis: z.string(),
})

export const MaintenanceSchema = z.object({
  action: z.literal('decay_sweep'),
})

export const AuditSchema = z.object({
  action: z.literal('query'),
  limit: z.number().int().positive().optional(),
  operation: z.string().optional(),
})

export const ImportSchema = z.object({
  entries: z.array(z.object({
    id: z.string(),
    type: z.enum(['project', 'pattern', 'concept', 'decision']),
    title: z.string(),
    content: z.string(),
    truth: z.enum(['confirmed', 'staging', 'disputed', 'deprecated']),
    provenance: z.enum(['extracted', 'inferred', 'synthesized', 'user_stated', 'unverified']),
  }).partial()),
})

export const RequestRefreshSchema = z.object({
  id: z.string().min(1, 'knowledge ID is required'),
  reason: z.enum(['decay', 'agent_request', 'manual']).optional().default('agent_request'),
})

export const ReportGapSchema = z.object({
  query: z.string().min(1, 'query is required'),
  source_url: z.string().optional(),
  reporter_role: z.string().optional(),
  reporter_agent: z.string().optional(),
})

export const QueryGapsSchema = z.object({
  status: z.enum(['open', 'digested', 'rejected', 'auto_digested']).optional(),
  reporter_role: z.string().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().min(0).optional(),
})
