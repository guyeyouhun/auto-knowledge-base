import { z } from 'zod'

export const SearchSchema = z.object({
  query: z.string().min(1, 'query is required'),
  tags: z.array(z.string()).optional(),
  project: z.string().optional(),
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

export const RoleConfigSchema = z.object({
  action: z.enum(['get', 'set', 'list']),
  role: z.string().min(1).optional(),
  entry_kn_ids: z.array(z.string()).optional(),
  spread_depth: z.number().int().min(1).optional(),
  context_budget: z.number().int().min(1).optional(),
  priority_tasks: z.array(z.string()).optional(),
})

export const SearchResultSchema = z.object({
  entries: z.array(z.any()),
  synthesis: z.string(),
})
