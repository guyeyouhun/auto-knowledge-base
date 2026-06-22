<p align="center">
  <img src="https://img.shields.io/badge/tests-119%20passed-green?style=flat-square&logo=vitest" alt="tests" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license" />
  <img src="https://img.shields.io/badge/MCP-ready-purple?style=flat-square&logo=claude" alt="MCP" />
  <img src="https://img.shields.io/badge/SQLite-FTS5%2BVector-blue?style=flat-square&logo=sqlite" alt="SQLite" />
</p>

<h1 align="center">auto-knowledge-base</h1>

<p align="center">
  <strong>17 个 MCP 工具，读路径零 LLM 依赖，<10ms 检索延迟。</strong>
</p>

<p align="center">
  <code>knowledge_search</code> · <code>knowledge_learn</code> · <code>knowledge_confirm</code> · <code>knowledge_relevant</code> · <code>knowledge_export</code>
  <br />
  <i>Claude Code / Cursor / Windsurf 通用</i>
</p>

---

## 快速开始

```bash
git clone https://github.com/guyeyouhun/auto-knowledge-base.git
cd auto-knowledge-base
npm install && npm run build && node dist/install.js
```

```
# 存一条知识 → staging
knowledge_learn(content: "Vite 使用 Rollup 打包", title: "Vite 构建", tags: ["vite"], roles: ["frontend"])

# 确认 → confirmed
knowledge_confirm(id: "550e8400-e29b-41d4-a716-446655440000")

# 搜索
knowledge_search(query: "vite rollup")

# 角色感知检索
knowledge_relevant(role: "frontend", task: "配置构建工具")

# 导出备份
knowledge_export
```

---

## 核心能力

| | 功能 | 实现 |
|---|---|---|
| 🔍 | **搜索** | BM25 全文搜索 + 可选向量混合搜索 (RRF 融合) |
| 🧠 | **存储** | SQLite + FTS5 + 关系图谱 + 向量嵌入 |
| 👤 | **角色** | 角色隔离 + 扩散激活自动发现关联知识 |
| 📊 | **生命周期** | staging → confirmed → FSRS-6 衰减 → frozen |
| ⚡ | **性能** | 检索全程零 LLM 调用，<10ms |
| 🛡️ | **可信度** | truth(生命周期) × provenance(认知来源) 双轴 |

---

## 工具

**核心（4 个）**

| 工具 | 说明 |
|------|------|
| `knowledge_search` | BM25 全文搜索，可选加向量混合 |
| `knowledge_learn` | 存入 staging，自动去重 |
| `knowledge_confirm` | staging → confirmed |
| `knowledge_relevant` | 角色 + 扩散激活 + BM25 评分 |

**配置（2 个）**

| 工具 | 说明 |
|------|------|
| `knowledge_role_config` | 角色入口节点/扩散深度配置 |
| `knowledge_config` | LLM 配置查看 |

**运维（5 个）**

| 工具 | 说明 |
|------|------|
| `knowledge_maintenance` | FSRS-6 衰减扫描 |
| `knowledge_export` / `import` | JSON 备份/恢复 |
| `knowledge_audit` | 操作日志查询 |
| `knowledge_status` | 统计（truth/温度/关系/嵌入） |

---

## Test

```bash
npm test              # 119 tests, 18 files
npm run test:watch    # 开发模式
```

---

## 设计目标

- [设计文档](docs/design-goals.md) — 完整设计思路
- [测试方案](QA.md) — 从克隆到验收的完整流程
- [实现状态](docs/current-status.md) — 当前进展

---

<p align="center">
  <a href="README.md">English</a>
</p>
