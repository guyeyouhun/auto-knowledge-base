#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { config } from './config.js'
import { FileStore } from './storage/file-store.js'
import { LLMClient } from './llm/client.js'
import { handleSearch } from './tools/search.js'
import { handleLearn, handleLearnStaged } from './tools/learn.js'
import { handleRelevant } from './tools/relevant.js'
import { handleStatus } from './tools/status.js'

// ── 初始化 ──

const storage = new FileStore(config.knowledgeDir)
const llm = new LLMClient()

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
      description: '导入知识到知识库。LLM 会自动提取结构化信息（标题、摘要、标签、关系）。',
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
      name: 'knowledge_learn_staged',
      description: '暂存待确认知识。存入 staging 区域，需要确认后才正式入库。',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '知识内容' },
          source: { type: 'string', description: '来源描述' },
        },
        required: ['content'],
      },
    },
    {
      name: 'knowledge_relevant',
      description: '获取与当前任务相关的知识。基于任务描述和关键词返回最匹配的条目。',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', description: '当前任务描述' },
          keywords: { type: 'array', items: { type: 'string' }, description: '关键词列表' },
          project: { type: 'string', description: '当前项目名' },
          currentFile: { type: 'string', description: '当前文件路径' },
          maxResults: { type: 'number', description: '最大返回数' },
        },
        required: ['task'],
      },
    },
    {
      name: 'knowledge_status',
      description: '知识库状态概览：条目数量、类型分布、LLM 连接状态。',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'knowledge_config',
      description: '查看 LLM 配置信息（不暴露密钥）。',
      inputSchema: {
        type: 'object',
        properties: {},
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
        const result = await handleSearch(storage, llm, {
          query: args?.query as string,
          tags: args?.tags as string[],
          project: args?.project as string,
          limit: args?.limit as number,
        })
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
        }
      }

      case 'knowledge_learn': {
        const result = await handleLearn(storage, llm, {
          content: args?.content as string,
          type: args?.type as any,
          title: args?.title as string,
          project: args?.project as string,
          tags: args?.tags as string[],
          source: args?.source as string,
        })
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
        }
      }

      case 'knowledge_learn_staged': {
        const result = await handleLearnStaged(
          storage,
          llm,
          args?.content as string,
          args?.source as string,
        )
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
        }
      }

      case 'knowledge_relevant': {
        const result = await handleRelevant(storage, llm, {
          task: args?.task as string,
          keywords: args?.keywords as string[],
          project: args?.project as string,
          currentFile: args?.currentFile as string,
          maxResults: args?.maxResults as number,
        })
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
        }
      }

      case 'knowledge_status': {
        const result = await handleStatus(storage, llm)
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
  console.error('[auto-kb] MCP Server started')
  console.error(`[auto-kb] LLM: ${llm.configured ? llm.modelName + ' (' + llm.provider + ')' : 'NOT CONFIGURED'}`)
  console.error(`[auto-kb] Knowledge dir: ${config.knowledgeDir}`)
}

main().catch((err) => {
  console.error('[auto-kb] Fatal:', err)
  process.exit(1)
})
