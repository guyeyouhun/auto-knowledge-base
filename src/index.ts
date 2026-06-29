#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { config } from './config.js'
import { SqliteStore } from './storage/sqlite-store.js'
import { LLMClient } from './llm/client.js'
import { handleSearch } from './tools/search.js'
import { handleLearn } from './tools/learn.js'
import { handleConfirm } from './tools/confirm.js'
import { handleRelevant } from './tools/relevant.js'
import { handleStatus } from './tools/status.js'
import { handleGetRoleConfig, handleSetRoleConfig, handleListRoles } from './tools/role-config.js'
import { handleDecaySweep } from './tools/maintenance.js'
import { handleAuditQuery } from './tools/audit.js'
import { handleExport, handleImport } from './tools/ops.js'
import { handleReportGap } from './tools/report-gap.js'
import { handleGaps } from './tools/gaps.js'
import { SearchSchema, LearnSchema, RelevantSchema, ConfirmSchema, RoleConfigSchema, MaintenanceSchema, AuditSchema, ImportSchema, RequestRefreshSchema, ReportGapSchema, QueryGapsSchema } from './validation.js'
import type { KnowledgeEntry } from './types.js'

// ── 初始化 ──

const storage = new SqliteStore(config.dbPath)

const llm = (config.isLLMConfigured() || config.isEmbeddingConfigured()) ? new LLMClient() : undefined
if (llm) {
  console.error(`[auto-kb] LLM configured: ${llm.modelName} (${llm.provider})`)
  if (config.isEmbeddingConfigured()) {
    console.error(`[auto-kb] Embedding: ${config.embedding.model} (${config.embedding.baseUrl})`)
  }
}
const server = new Server(
  { name: 'auto-knowledge-base', version: '0.1.0' },
  { capabilities: { tools: {}, prompts: {} } },
)

// ── 工具列表 ──

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'knowledge_search',
      description: '搜索知识库，支持语义理解。可选按角色限定搜索范围。返回匹配的知识条目和综合说明。',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词或自然语言查询' },
          tags: { type: 'array', items: { type: 'string' }, description: '按标签筛选' },
          project: { type: 'string', description: '按项目名筛选' },
          role: { type: 'string', description: '按角色限定搜索范围（可选，基于扩散激活）' },
          limit: { type: 'number', description: '返回数量上限' },
        },
        required: ['query'],
      },
    },
    {
      name: 'knowledge_learn',
      description: '导入知识到知识库。自动检测重复，始终写入 staging 区域。',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '知识内容（文本、代码、文档片段等）' },
          type: { type: 'string', enum: ['project', 'pattern', 'concept', 'decision'], description: '知识类型（可选，LLM 自动判断）' },
          title: { type: 'string', description: '标题（可选，LLM 自动生成）' },
          project: { type: 'string', description: '关联项目名' },
          tags: { type: 'array', items: { type: 'string' }, description: '标签（可选，LLM 自动提取）' },
          source: { type: 'string', description: '来源描述' },
        },
        required: ['content'],
      },
    },
    {
      name: 'knowledge_confirm',
      description: '将 staging 知识升级为 confirmed。确认后该知识参与检索。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '知识条目 ID' },
        },
        required: ['id'],
      },
    },
    {
      name: 'knowledge_relevant',
      description: '获取与当前任务相关的知识。基于角色扩散激活、任务描述和关键词返回最匹配的条目。',
      inputSchema: {
        type: 'object',
        properties: {
          role: { type: 'string', description: '当前 Agent 角色' },
          task: { type: 'string', description: '当前任务描述' },
          keywords: { type: 'array', items: { type: 'string' }, description: '关键词列表' },
          project: { type: 'string', description: '当前项目名' },
          maxResults: { type: 'number', description: '最大返回数' },
        },
        required: ['role', 'task'],
      },
    },
    {
      name: 'knowledge_status',
      description: '知识库状态概览：条目数量、存储类型。',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'knowledge_config',
      description: '查看配置信息（不暴露密钥）。',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'knowledge_role_config',
      description: '管理角色配置。支持 get（获取角色配置）、set（设置/更新角色配置）、list（列出所有角色）。',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['get', 'set', 'list'],
            description: '操作类型：get 获取角色配置，set 设置/更新角色配置，list 列出所有角色',
          },
          role: {
            type: 'string',
            description: '角色名称（get/set 时需要）',
          },
          entry_kn_ids: {
            type: 'array',
            items: { type: 'string' },
            description: '入口知识条目 ID 列表（set 时需要）',
          },
          spread_depth: {
            type: 'number',
            description: '扩散深度（set 时需要）',
          },
          context_budget: {
            type: 'number',
            description: '上下文预算 token 数（set 时需要）',
          },
          priority_tasks: {
            type: 'array',
            items: { type: 'string' },
            description: '优先任务描述列表（set 时需要）',
          },
        },
        required: ['action'],
      },
    },
    {
      name: 'knowledge_maintenance',
      description: '知识库维护操作。当前支持 decay_sweep：对超过 7 天未访问的 confirmed 条目执行 FSRS 衰减扫描，返回衰减和冻结的条目数。',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['decay_sweep'],
            description: '维护操作类型',
          },
        },
        required: ['action'],
      },
    },
    {
      name: 'knowledge_audit',
      description: '查询审计日志。返回知识库操作记录，包括学习、搜索、确认等。',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['query'],
            description: '操作类型，当前仅支持 query',
          },
          limit: {
            type: 'number',
            description: '返回条数上限（默认 50）',
          },
          operation: {
            type: 'string',
            description: '按操作类型过滤（learn/search/confirm/relevant/role_config/maintenance 等）',
          },
        },
        required: ['action'],
      },
    },
    {
      name: 'knowledge_export',
      description: '导出全部知识条目为 JSON。不包含嵌入向量。',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'knowledge_import',
      description: '从 JSON 导入知识条目。跳过已存在的 ID（不覆盖）。',
      inputSchema: {
        type: 'object',
        properties: {
          entries: {
            type: 'array',
            items: { type: 'object' },
            description: '知识条目数组',
          },
        },
        required: ['entries'],
      },
    },
    {
      name: 'knowledge_request_refresh',
      description: '请求重新消化一条知识。当知识过时需要从源素材重新提取时调用。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '知识条目 ID' },
          reason: { type: 'string', enum: ['decay', 'agent_request', 'manual'], description: '刷新原因' },
        },
        required: ['id'],
      },
    },
    {
      name: 'knowledge_report_gap',
      description: '报告知识库空白：当搜索未找到所需知识时报告 gap。可选提供 source_url 触发自动消化（content-digester）。',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词或问题' },
          source_url: { type: 'string', description: '知识来源 URL（提供后触发自动消化）' },
          reporter_role: { type: 'string', description: '报告者角色' },
          reporter_agent: { type: 'string', description: '报告者 Agent ID' },
        },
        required: ['query'],
      },
    },
    {
      name: 'knowledge_gaps',
      description: '查询知识库空白（gap）记录。可按状态和报告者角色过滤，支持分页。',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['open', 'digested', 'rejected', 'auto_digested'], description: '按状态筛选' },
          reporter_role: { type: 'string', description: '按报告者角色筛选' },
          limit: { type: 'number', description: '返回条数上限' },
        },
      },
    },
  ],
}))


// ── Prompts（自动上下文注入） ──

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: 'knowledge_context',
      description: '获取与当前角色和任务相关的知识，自动注入为系统上下文。Agent 无感知获得知识。',
      arguments: [
        { name: 'role', description: '当前 Agent 角色', required: false },
        { name: 'task', description: '当前任务描述', required: false },
      ],
    },
    {
      name: 'knowledge_search_context',
      description: '根据搜索词获取相关知识注入上下文。',
      arguments: [
        { name: 'query', description: '搜索关键词', required: true },
      ],
    },
  ],
}))

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  switch (name) {
    case 'knowledge_context': {
      const role = (args?.role as string) || 'default'
      const task = (args?.task as string) || ''
      const relevantResult = await handleRelevant(storage, { role, task, maxResults: 5 }, llm)
      const text = relevantResult.entries.length === 0
        ? '（暂无相关知识）'
        : '以下是知识库中与当前任务相关的知识：\n\n' +
          relevantResult.entries.map((e, i) =>
            `[${i + 1}] ${e.title}\n${e.summary || e.content.slice(0, 300)}`
          ).join('\n\n') +
          '\n\n请在需要时参考以上知识。'
      return { messages: [{ role: 'assistant' as const, content: { type: 'text', text } }] }
    }

    case 'knowledge_search_context': {
      const query = args?.query as string
      if (!query) return { messages: [] }
      const searchResult = await handleSearch(storage, { query, limit: 5 }, llm)
      const text = searchResult.entries.length === 0
        ? `未找到与 "${query}" 相关知识。`
        : `搜索结果（${query}）：\n\n` +
          searchResult.entries.map((e, i) =>
            `[${i + 1}] ${e.title}\n${e.summary || e.content.slice(0, 300)}`
          ).join('\n\n')
      return { messages: [{ role: 'assistant' as const, content: { type: 'text', text } }] }
    }

    default:
      throw new Error(`Unknown prompt: ${name}`)
  }
})

// ── 工具调用 ──

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case 'knowledge_search': {
        const parsed = SearchSchema.safeParse(args)
        if (!parsed.success) {
          return { isError: true, content: [{ type: 'text', text: parsed.error.message }] }
        }
        const result = await handleSearch(storage, parsed.data, llm, true)
        await storage.logAudit(null, 'search', `query: ${parsed.data.query}`)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
        }
      }

      case 'knowledge_learn': {
        const parsed = LearnSchema.safeParse(args)
        if (!parsed.success) {
          return { isError: true, content: [{ type: 'text', text: parsed.error.message }] }
        }
        const result = await handleLearn(storage, parsed.data, llm)
        await storage.logAudit(result.id, 'learn', `title: ${result.title}`)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
        }
      }

      case 'knowledge_confirm': {
        const parsed = ConfirmSchema.safeParse(args)
        if (!parsed.success) return { isError: true, content: [{ type: 'text', text: parsed.error.message }] }
        const result = await handleConfirm(storage, parsed.data.id)
        await storage.logAudit(parsed.data.id, 'confirm', result.message)
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }

      case 'knowledge_relevant': {
        const parsed = RelevantSchema.safeParse(args)
        if (!parsed.success) {
          return { isError: true, content: [{ type: 'text', text: parsed.error.message }] }
        }
        const result = await handleRelevant(storage, parsed.data, llm)
        await storage.logAudit(null, 'relevant', `role: ${parsed.data.role}, task: ${parsed.data.task.slice(0, 50)}`)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
        }
      }

      case 'knowledge_status': {
        const result = await handleStatus(storage)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
        }
      }

      case 'knowledge_config': {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(config.getConfigSummary(), null, 2),
          }],
        }
      }

      case 'knowledge_role_config': {
        const parsed = RoleConfigSchema.safeParse(args)
        if (!parsed.success) {
          return { isError: true, content: [{ type: 'text', text: parsed.error.message }] }
        }
        const { action } = parsed.data

        switch (action) {
          case 'get': {
            const result = await handleGetRoleConfig(storage, parsed.data.role)
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
          }
          case 'set': {
            const result = await handleSetRoleConfig(storage, {
              role: parsed.data.role,
              entry_kn_ids: parsed.data.entry_kn_ids,
              spread_depth: parsed.data.spread_depth,
              context_budget: parsed.data.context_budget,
              priority_tasks: parsed.data.priority_tasks,
            })
            await storage.logAudit(null, 'role_config', `action: set, role: ${parsed.data.role}`)
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
          }
          case 'list': {
            const result = await handleListRoles(storage)
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
          }
          default:
            return { isError: true, content: [{ type: 'text', text: `Unknown action: ${action}` }] }
        }
      }

      case 'knowledge_maintenance': {
        const parsed = MaintenanceSchema.safeParse(args)
        if (!parsed.success) {
          return { isError: true, content: [{ type: 'text', text: parsed.error.message }] }
        }
        const { action } = parsed.data

        switch (action) {
          case 'decay_sweep': {
            const result = await handleDecaySweep(storage)
            await storage.logAudit(null, 'maintenance', `decayed: ${result.decayed}, frozen: ${result.frozen}, refreshed: ${result.refreshed}`)
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
          }
          default:
            return { isError: true, content: [{ type: 'text', text: `Unknown maintenance action: ${action}` }] }
        }
      }

      case 'knowledge_audit': {
        const parsed = AuditSchema.safeParse(args)
        if (!parsed.success) {
          return { isError: true, content: [{ type: 'text', text: parsed.error.message }] }
        }
        const result = await handleAuditQuery(storage, parsed.data.limit, parsed.data.operation)
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }

      case 'knowledge_export': {
        const exportResult = await handleExport(storage)
        await storage.logAudit(null, 'export', `count: ${exportResult.count}`)
        return { content: [{ type: 'text', text: JSON.stringify(exportResult, null, 2) }] }
      }
      case 'knowledge_request_refresh': {
        const parsed = RequestRefreshSchema.safeParse(args)
        if (!parsed.success) {
          return { isError: true, content: [{ type: 'text', text: parsed.error.message }] }
        }
        const entry = await storage.get(parsed.data.id)
        if (!entry) {
          return { isError: true, content: [{ type: 'text', text: `Entry not found: ${parsed.data.id}` }] }
        }
        const sourceRef = entry.source || `kb:${entry.id}`
        const sourceType = sourceRef.startsWith('http') ? 'article'
          : sourceRef.includes('github') ? 'repo'
          : sourceRef.includes('arxiv') ? 'paper'
          : 'unknown'
        await storage.queueRefresh(entry.id, sourceRef, sourceType, parsed.data.reason)
        await storage.logAudit(entry.id, 'request_refresh', `reason: ${parsed.data.reason}`)
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true,
            kn_id: entry.id,
            source_ref: sourceRef,
            reason: parsed.data.reason,
          }, null, 2) }],
        }
      }

      case 'knowledge_import': {
        const parsed = ImportSchema.safeParse(args)
        if (!parsed.success) {
          return { isError: true, content: [{ type: 'text', text: parsed.error.message }] }
        }
        const importResult = await handleImport(storage, parsed.data.entries as KnowledgeEntry[])
        await storage.logAudit(null, 'import', `imported: ${importResult.imported}, skipped: ${importResult.skipped}`)
        return { content: [{ type: 'text', text: JSON.stringify(importResult, null, 2) }] }
      }


      case 'knowledge_report_gap': {
        const parsed = ReportGapSchema.safeParse(args)
        if (!parsed.success) {
          return { isError: true, content: [{ type: 'text', text: parsed.error.message }] }
        }
        const result = await handleReportGap(storage, parsed.data, llm)
        await storage.logAudit(null, 'report_gap', `query: ${parsed.data.query}, found: ${result.found}, auto_digested: ${result.autoDigested}`)
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        }
      }

      case 'knowledge_gaps': {
        const parsed = QueryGapsSchema.safeParse(args)
        if (!parsed.success) {
          return { isError: true, content: [{ type: 'text', text: parsed.error.message }] }
        }
        const result = await handleGaps(storage, parsed.data)
        await storage.logAudit(null, 'gaps', `query gaps, status: ${parsed.data.status || 'all'}, reporter_role: ${parsed.data.reporter_role || 'all'}`)
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        }
      }
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      isError: true,
      content: [{ type: 'text', text: msg }],
    }
  }
})

// ── 启动 ──

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`[auto-kb] MCP Server started (SQLite)`)
  console.error(`[auto-kb] Database: ${config.dbPath}`)
}

main().catch((err) => {
  console.error('[auto-kb] Fatal:', err)
  process.exit(1)
})
