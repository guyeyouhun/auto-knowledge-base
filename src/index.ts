#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { config } from './config.js'
import { SqliteStore } from './storage/sqlite-store.js'
import { handleSearch } from './tools/search.js'
import { handleLearn } from './tools/learn.js'
import { handleConfirm } from './tools/confirm.js'
import { handleRelevant } from './tools/relevant.js'
import { handleStatus } from './tools/status.js'
import { handleGetRoleConfig, handleSetRoleConfig, handleListRoles } from './tools/role-config.js'
import { SearchSchema, LearnSchema, RelevantSchema, ConfirmSchema, RoleConfigSchema } from './validation.js'

// ── 初始化 ──

const storage = new SqliteStore(config.dbPath)

const server = new Server(
  { name: 'auto-knowledge-base', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

// ── 工具列表 ──

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'knowledge_search',
      description: '搜索知识库，支持语义理解。返回匹配的知识条目和综合说明。',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词或自然语言查询' },
          tags: { type: 'array', items: { type: 'string' }, description: '按标签筛选' },
          project: { type: 'string', description: '按项目名筛选' },
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
  ],
}))

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
        const result = await handleSearch(storage, parsed.data)
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
        const result = await handleLearn(storage, parsed.data)
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
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }

      case 'knowledge_relevant': {
        const parsed = RelevantSchema.safeParse(args)
        if (!parsed.success) {
          return { isError: true, content: [{ type: 'text', text: parsed.error.message }] }
        }
        const result = await handleRelevant(storage, parsed.data)
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
