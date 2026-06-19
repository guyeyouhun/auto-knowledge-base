# 自主知识库 (Auto Knowledge Base)

MCP 协议的知识库系统，为工程 Agent 提供智能知识服务。

## 当前状态

- **版本：** v0.1 MVP
- **MCP Server：** 注册到 Claude Code（工具名 `auto-kb`，需配置 LLM）
- **LLM 配置：** 通过环境变量 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL` 指定
- **存储：** JSON 文件系统 + 全文索引
- **安装：** 支持一键安装/卸载，复制到永久目录运行

## 核心设计原则

1. **自带 LLM 层** — 不依赖 Claude Code 会话，MCP Server 独立调用 LLM
2. **staging 暂存** — 自动捕获的知识先存 staging，确认后才固化
3. **主动推送** — `knowledge_relevant` 根据上下文推送，不被动等待查询
4. **通用协议** — MCP，任何兼容客户端都能用，模型用户自配

## 知识类型

- `concept` — 概念/理论
- `pattern` — 可复用的实现模式
- `decision` — 技术决策及理由
- `project` — 项目特有知识

## 信任级别

- `confirmed` — LLM 提取 + 指令导入，直接固化
- `staging` — 自动捕获或暂存，需确认
- `extracted` / `inferred` — 为后续扩展预留

## 架构决策（重要）

| 决策 | 选择 | 理由 |
|------|------|------|
| LLM API 格式 | 先试 OpenAI，404/503 自动切 Anthropic | 兼容大多数供应商 |
| 存储方式 | MVP 用 JSON 文件 | 零依赖，后续迁 SQLite |
| 搜索结果排序 | 关键词初筛 → LLM 语义重排 | 兼顾速度和理解力 |
| 降级策略 | LLM 不可用时降级为纯文本搜索 | 不影响基本功能 |

## 技术债务 / 待改进

1. **JSON 存储 → SQLite** — 并发写入、大规模检索更可靠
2. **向量嵌入** — 大量知识时 LLM 搜索成本高，需 embedding 降级
3. **自动捕获** — PostToolUse hook 提取工程知识到 staging
4. **知识图谱可视化** — 展示实体间关系

## 一键安装 / 卸载

```bash
# 构建
npm run build

# 安装（自动探测 LLM 配置，通常不需要参数）
node dist/install.js

# 如需手动指定 LLM:
node dist/install.js --llm-url <URL> --llm-key <KEY> --llm-model <MODEL>

# 安装后使用（在任意 Claude Code 会话中）
claude> 把这份代码存到知识库
claude> 搜索关于 MCP 的知识

# 卸载
node dist/uninstall.js

# 重新配置 LLM
claude mcp remove auto-kb
node dist/install.js --llm-url <新URL> --llm-key <新KEY> --llm-model <新MODEL>
```

## 开发记录

- 2026-06-18: v0.1 MVP 完成，6 个工具全部测试通过
- 2026-06-18: LLM 客户端实现，自动探测 OpenAI/Anthropic 格式
- 2026-06-18: 注册到 Claude Code，端到端验证通过
- 2026-06-18: 与 Mem0/SwarmVault/Engram 等竞品对比分析完成

## 知识库内容（./knowledge/）

存入的知识包括：
- MCP 协议、React Hooks、TypeScript interface vs type、CC-Switch 等测试数据
- 后续实际使用中会积累更多工程知识
