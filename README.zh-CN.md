<p align="center">
  <picture>
    <img src="https://img.shields.io/npm/v/auto-knowledge-base?style=flat-square&color=blue" alt="npm" />
    <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license" />
    <img src="https://img.shields.io/badge/tests-119%20passed-green?style=flat-square" alt="tests" />
    <img src="https://img.shields.io/badge/MCP-ready-purple?style=flat-square" alt="MCP" />
  </picture>
</p>

<h1 align="center">auto-knowledge-base</h1>

<p align="center">
  <strong>17 个 MCP 工具，读路径零 LLM 依赖，<10ms 检索延迟。</strong><br />
  为工程 Agent 设计的结构化知识库——SQLite + FTS5 + 向量嵌入 + 扩散激活 + FSRS-6 衰减。
</p>

<p align="center">
  Claude Code · Cursor · Windsurf · 任何 MCP 客户端
</p>

---

## 安装

```bash
git clone https://github.com/guyeyouhun/auto-knowledge-base.git
cd auto-knowledge-base
npm install && npm run build
node dist/install.js          # 注册到 MCP
```

## 快速使用

```
# 存知识
knowledge_learn(
  content: "Vite 使用 Rollup 打包，配置在 vite.config.ts",
  title: "Vite 构建配置",
  tags: ["vite", "build"],
  roles: ["frontend"]
)

# 确认（staging → confirmed）
knowledge_confirm(id: "550e8400-e29b-41d4-a716-446655440000")

# 角色感知检索
knowledge_relevant(role: "frontend", task: "配置构建工具")

# BM25 + 向量混合搜索
knowledge_search(query: "vite rollup bundler", useVector: true)

# 导出备份
knowledge_export
```

---

## 核心能力

| 能力 | 实现 |
|------|------|
| **存储** | SQLite + FTS5 BM25 + 向量嵌入（可选混合搜索） |
| **关系图谱** | 6 种关系类型，扩散激活沿图谱自动发现关联知识 |
| **角色隔离** | 不同 Agent 角色看到不同知识，空 roles[] 对所有角色可见 |
| **生命周期** | staging → confirmed → FSRS-6 衰减 → frozen（不移除） |
| **冲突处理** | contradicts 自动标记双方为 disputed，Agent 用选择投票 |
| **可信度** | truth（生命周期）× provenance（认知来源）双轴正交 |
| **审计** | 全部操作写入 audit_log，可查询追溯 |
| **安全** | Zod 输入校验，execFileSync 安装，密钥不泄露 |
| **测试** | 119 个测试，18 个测试文件 |

---

## 架构

```
┌──────────┐   ┌──────────────┐   ┌────────────────┐
│  MCP     │──▶│  SQLite       │   │  LLM Client    │
│  Tools   │   │  + FTS5       │   │  (可选)        │
│          │   │  + 向量嵌入    │   │                │
│ 17 个    │   │  + 关系谱      │   │  embed()       │
│ 工具     │   │  + audit_log   │   └────────────────┘
└──────────┘   └──────────────┘
```

读路径全程无 LLM 调用，<10ms。LLM 仅用于可选嵌入生成。

### 工具清单

| 工具 | 说明 |
|------|------|
| `knowledge_search` | BM25 + 可选向量混合搜索 |
| `knowledge_learn` | staging 写入，自动去重 |
| `knowledge_confirm` | staging → confirmed |
| `knowledge_relevant` | 角色 + 扩散激活 + BM25 评分 |
| `knowledge_role_config` | 角色入口节点配置 |
| `knowledge_maintenance` | 7 天衰减扫描 |
| `knowledge_export` / `import` | JSON 备份/恢复 |
| `knowledge_audit` | 操作日志查询 |
| `knowledge_status` | 按 truth/温度/关系/嵌入 统计 |

### 知识生命周期

```
存入 → staging（暂存，不参与检索）
        ↓ knowledge_confirm
       confirmed（参与检索）
        ↓ 7天未用 → strength 衰减
        ↓ strength ≤ 0.10 → frozen（保留，不检索）
        ↓ contradicts → disputed（双方标记）
        ↓ 被替代 → deprecated
```

---

## Test

```bash
npm test            # 119 tests, 18 files
npm run test:watch  # 开发模式
```

---

## 文档

- [设计目标](docs/design-goals.md) — 完整设计（基于 llm-wiki 知识库优化）
- [测试方案](QA.md) — 从 GitHub 克隆到验收的完整流程

---

<p align="center">
  <a href="README.md">English</a>
</p>
