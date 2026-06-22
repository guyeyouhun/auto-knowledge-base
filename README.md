# auto-knowledge-base

基于 MCP 协议的自主知识库，为工程 Agent 提供结构化知识服务。

**读路径不需要 LLM，基础功能开箱即用。** LLM 只作为可选的写路径优化使用（Phase 4 计划）。

**谁都能用：** Claude Code / Cursor / Windsurf……任何 MCP 客户端

---

## 核心理念

- **有记忆** — 结构化知识存储，SQLite + FTS5 全文搜索
- **可信度双轴** — truth（生命周期）× provenance（认知来源），精确控制每条知识的可信度
- **去重存储** — staging 暂存 + 自动去重检测，确认后才固化
- **读路径零 LLM** — 检索、排序、竞争全部在 SQLite 层完成，<10ms

---

## 项目状态 (Phase 1)

```
✅ MCP Server 运行中，6 个 MCP 工具
✅ SQLite + FTS5 全文搜索（BM25 排序）
✅ 双轴可信度：truth × provenance
✅ 6 种关系类型（references/contradicts/supersedes/derives_from/extends/implements）
✅ knowledge_learn 去重检测（自动合并相似条目）
✅ knowledge_confirm（staging → confirmed）
✅ Zod 输入校验（所有工具参数安全验证）
✅ 35 个测试，全面覆盖
⬜ 角色系统 + 扩散激活（Phase 2）
⬜ FSRS-6 衰减 + 温度管理（Phase 3）
⬜ 向量嵌入（Phase 4）
```

---

## 一分钟安装

```bash
# 构建
git clone https://github.com/guyeyouhun/auto-knowledge-base.git
cd auto-knowledge-base
npm install && npm run build

# 安装到 Claude Code（不需要 LLM 配置）
node dist/install.js

# 完成！现在 Claude 可以直接使用知识库工具
```

卸载：
```bash
node dist/uninstall.js
```

---

## 架构

```
┌────────────────────────────────────────────────────┐
│              auto-knowledge-base MCP Server         │
│                                                    │
│  ┌──────────┐   ┌──────────────┐                   │
│  │  MCP     │──▶│  SQLite +     │                   │
│  │  Tools   │   │  FTS5 BM25   │                   │
│  │          │   │              │                   │
│  │ search   │   │  knowledge   │                   │
│  │ learn    │   │  relations   │                   │
│  │ confirm  │   │  role_config │                   │
│  │ relevant │   │              │                   │
│  │ status   │   │  双轴可信度   │                   │
│  │ config   │   └──────────────┘                   │
│  └──────────┘                                      │
└────────────────────────────────────────────────────┘
```

检索路径全程无 LLM 调用，稳定、快速、低成本。

---

## MCP 工具

| 工具 | 参数 | LLM 参与 | 说明 |
|------|------|:---------:|------|
| `knowledge_search` | query, tags?, project?, limit? | ❌ | BM25 全文搜索 |
| `knowledge_learn` | content, title?, tags?, roles? | ❌ | 存入 staging（带去重） |
| `knowledge_confirm` | id | ❌ | staging → confirmed |
| `knowledge_relevant` | role, task, keywords? | ❌ | 任务关联检索 |
| `knowledge_status` | — | ❌ | 知识库统计 |
| `knowledge_config` | — | ❌ | 配置信息 |

### 使用示例

```
knowledge_learn(
  content: "Vite 使用 Rollup 打包，配置在 vite.config.ts",
  title: "Vite 构建配置",
  tags: ["vite", "build", "config"],
  roles: ["frontend"]
)

knowledge_confirm(id: "550e8400-e29b-41d4-a716-446655440000")

knowledge_relevant(role: "frontend", task: "搭建构建管线")
```

---

## 可信度体系

**两条正交轴，共同决定一条知识的可信度：**

| 轴 | 可选值 | 含义 |
|----|--------|------|
| **truth**（生命周期） | confirmed / staging / disputed / deprecated | 知识当前处于什么阶段 |
| **provenance**（认知来源） | extracted / inferred / synthesized / user_stated / unverified | 知识怎么得来的 |

组合示例：
- `confirmed + extracted` → 已验证，原文可查
- `staging + user_stated` → 刚存入，用户提供
- `confirmed + inferred` → 已验证，从实践推导

---

## 项目结构

```
src/
├── index.ts                # MCP Server 入口 + 6 个工具
├── install.ts              # 一键安装脚本
├── uninstall.ts            # 卸载脚本
├── types.ts                # 类型定义（双轴可信度）
├── config.ts               # 配置读取（.env + 环境变量）
├── validation.ts           # Zod 输入校验
├── storage/
│   ├── interface.ts        # KnowledgeStorage 接口
│   ├── sqlite-store.ts     # SQLite 存储实现
│   └── schema.sql          # 建表 SQL
├── tools/
│   ├── search.ts           # knowledge_search（BM25 搜索）
│   ├── learn.ts            # knowledge_learn（去重 + staging）
│   ├── confirm.ts          # knowledge_confirm
│   ├── relevant.ts         # knowledge_relevant
│   └── status.ts           # knowledge_status
└── __tests__/              # 35 个测试
    ├── smoke.test.ts
    ├── types.test.ts
    ├── validation.test.ts
    ├── sqlite-store.test.ts
    ├── search.test.ts
    ├── learn.test.ts
    ├── integration.test.ts
    └── install.test.ts
```

---

## 设计文档

| 文档 | 说明 |
|------|------|
| `docs/design-goals.md` | 完整设计目标（基于 llm-wiki 知识库优化） |
| `docs/current-status.md` | 当前实现状态 |

---

## 后续路线

| 阶段 | 内容 | 状态 |
|------|------|:----:|
| Phase 1 | ✅ SQLite 存储 + BM25 搜索 + 去重 learn + confirm 工具 | ✅ 完成 |
| Phase 2 | 角色系统 + 扩散激活（role_config + relations 图遍历） | 📋 |
| Phase 3 | FSRS-6 衰减 + 温度管理 + 冲突决策 | 📋 |
| Phase 4 | 向量嵌入 + LLM 语义重排（可选优化） | 📋 |
| Phase 5 | 定时维护 + 导出/导入 + 健康检查 | 📋 |
