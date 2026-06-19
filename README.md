# 自主知识库 (Auto Knowledge Base)

基于 MCP 协议的自主知识库，为工程 Agent 提供智能知识服务。
**自带 LLM 层，模型由用户自配，不绑定任何厂商。**

## 核心理念

不只是知识存储，而是有"大脑"的知识伙伴：
- **有记忆** — 结构化知识存储（实体/模式/决策/项目）
- **有理解力** — 自带 LLM 提取语义、综合推理
- **有主动性** — 根据上下文主动推送相关知识
- **保正确性** — staging 暂存机制，确认后才固化

**谁都能用：** Claude Code / Cursor / Windsurf……任何 MCP 客户端

## 一分钟安装

```bash
# 构建
git clone https://github.com/your-org/auto-knowledge-base.git
cd auto-knowledge-base
npm install && npm run build

# 永久安装到 Claude Code（自动探测 LLM 配置）
node dist/install.js

# 安装完成！现在 Claude 可以直接使用知识库工具了
```

> 安装脚本自动从当前会话环境探测 LLM 配置（`ANTHROPIC_BASE_URL` / `LLM_BASE_URL`），
> 通常不需要手动指定参数。如需手动配置：`node dist/install.js -u <URL> -k <KEY> -m <MODEL>`

卸载同样简单：
```bash
node dist/uninstall.js
```

> 详细用法见 [安装文档](CLAUDE.md#一键安装--卸载)

## 项目状态 (v0.1 MVP)

```
✅ MCP Server 运行中，6 个工具全部通过测试
✅ 文件存储 + 全文索引
✅ LLM 客户端（OpenAI + Anthropic 自动探测）
✅ 语义搜索 + 相关性推理
✅ staging 暂存机制
✅ 一键安装/卸载（node dist/install.js / uninstall.js）
⬜ SQLite 存储（进行中）
⬜ 向量嵌入
⬜ 自动捕获（PostToolUse hook）
⬜ 知识图谱可视化
⬜ 跨项目模式抽象
```

## 架构

```
┌──────────────────────────────────────────────────────┐
│              auto-knowledge-base MCP Server           │
│                                                      │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐         │
│  │  MCP     │   │ 存储层    │   │ LLM 层   │         │
│  │  Tools   │──▶│ JSON     │──▶│ openai   │         │
│  │          │   │ 索引     │   │ client   │         │
│  │ search   │   │ staging  │   │          │         │
│  │ learn    │   │          │   │ extract  │         │
│  │ relevant │   │          │   │ search   │         │
│  │ status   │   │          │   │ synth    │         │
│  └──────────┘   └──────────┘   └────┬─────┘         │
│                                      │               │
│                                      ▼               │
│                           ┌──────────────────┐       │
│                           │  用户配置的 LLM   │       │
│                           └──────────────────┘       │
└──────────────────────────────────────────────────────┘
```

## 快速开始

```bash
# 1. 克隆并构建
git clone <repo-url> && cd auto-knowledge-base
npm install && npm run build

# 2. 永久安装到 Claude Code（提供你的 LLM 配置）
node dist/install.js -u https://api.openai.com/v1 -k sk-your-key -m gpt-4o

# 3. 完成后，Claude Code 会话中直接使用：
#    "把这份代码存到知识库"
#    "搜索关于 React hooks 的知识"
```

### 模型配置示例

```bash
# OpenAI
claude mcp add auto-kb \
  -e LLM_BASE_URL=https://api.openai.com/v1 \
  -e LLM_API_KEY=sk-xxx \
  -e LLM_MODEL=gpt-4o \
  -- node dist/index.js

# 本地 Ollama
claude mcp add auto-kb \
  -e LLM_BASE_URL=http://localhost:11434/v1 \
  -e LLM_API_KEY=ollama \
  -e LLM_MODEL=llama3 \
  -- node dist/index.js

# Anthropic
claude mcp add auto-kb \
  -e LLM_BASE_URL=https://api.anthropic.com \
  -e LLM_API_KEY=sk-ant-xxx \
  -e LLM_MODEL=claude-sonnet-4-20250514 \
  -- node dist/index.js
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `LLM_BASE_URL` | 是 | LLM API 地址（OpenAI 兼容格式） |
| `LLM_API_KEY` | 是 | API 密钥 |
| `LLM_MODEL` | 是 | 模型名称 |
| `KNOWLEDGE_DIR` | 否 | 知识存储路径（默认 ./knowledge） |

## MCP 工具

| 工具 | 参数 | LLM 参与 | 输出 |
|------|------|:---------:|------|
| `knowledge_search` | query, tags?, project?, limit? | ✅ 语义理解 + 排序 | 条目列表 + 综合说明 |
| `knowledge_learn` | content, type?, title?, project?, tags? | ✅ 提取结构化知识 | 条目 ID + 标题 + 置信度 |
| `knowledge_learn_staged` | content, source? | ✅ 提取并暂存 | staging ID |
| `knowledge_relevant` | task, keywords?, project?, file? | ✅ 关联判断 | 排序结果 |
| `knowledge_status` | — | ❌ | 统计 + LLM 状态 |
| `knowledge_config` | — | ❌ | 配置摘要 |

## 信任机制

```
knowledge_learn         → LLM 提取 → 直接固化 (confidence: confirmed)
knowledge_learn_staged  → LLM 提取 → staging (confidence: staging)
                          等待确认或重复 N 次后升级为 confirmed
```

## 项目结构

```
src/
├── index.ts               # MCP Server 入口 + 6 个工具
├── install.ts             # 一键安装脚本
├── uninstall.ts           # 卸载脚本
├── types.ts               # 类型定义
├── config.ts              # 配置读取（.env + 环境变量）
├── llm/
│   └── client.ts          # LLM 客户端（自动探测 OpenAI/Anthropic）
├── storage/
│   ├── interface.ts       # 存储接口
│   └── file-store.ts      # JSON 文件存储 + 索引 + 搜索
└── tools/
    ├── search.ts          # 搜索工具（关键词 + LLM 排序）
    ├── learn.ts           # 学习工具（learn + learn_staged）
    ├── relevant.ts        # 关联推送
    └── status.ts          # 状态 + 配置
knowledge/                 # 知识存储（gitignored）
```

## 后续迭代

| 阶段 | 内容 |
|------|------|
| Phase 1 | ✅ MVP 核心功能 |
| Phase 2 | 🔄 SQLite 存储 + 向量嵌入 |
| Phase 3 | 自动捕获（PostToolUse hook） |
| Phase 4 | 知识图谱可视化 + 跨项目模式抽象 |
| Phase 5 | 自动巡检（arXiv/GitHub 发现） |
