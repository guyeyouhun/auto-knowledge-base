# auto-knowledge-base 测试方案

确保项目可以从 GitHub 克隆安装并正常工作。

---

## 1. 构建验证（2 分钟）

```bash
git clone https://github.com/guyeyouhun/auto-knowledge-base.git
cd auto-knowledge-base
npm install
npm run build
```

**预期结果：**
- `npm install` 无报错，`better-sqlite3` 原生模块编译成功
- `npm run build` 生成 `dist/` 目录，包含 `dist/storage/schema.sql`
- `tsc` 无编译错误

```bash
# 验证关键文件存在
ls dist/index.js          # MCP Server 入口
ls dist/storage/schema.sql  # SQLite 建表脚本
ls dist/storage/sqlite-store.js  # 存储层
ls dist/tools/*.js        # 全部工具处理器
ls dist/fsrs.js           # FSRS 衰减引擎
ls dist/embedding.js       # 向量嵌入
ls dist/diffusion.js       # 扩散激活
```

---

## 2. 单元测试（1 分钟）

```bash
npm test
```

**预期结果：** 19 个测试文件，119 个测试，全部通过。

```
Test Files  19 passed (19)
     Tests  119 passed (119)
```

覆盖清单：

| 测试文件 | 数量 | 覆盖内容 |
|---------|:----:|---------|
| `sqlite-store.test.ts` | 10 | CRUD、FTS5 搜索、confirm、relations、findSimilar、health |
| `types.test.ts` | 3 | truth/provenance/relationType 类型 |
| `validation.test.ts` | 7 | 所有 Zod 校验 schema（空值、类型、边界） |
| `search.test.ts` | 7 | BM25 搜索、相关检索、混合向量搜索降级 |
| `learn.test.ts` | 6 | staging 默认、去重检测、confirm |
| `relevant.test.ts` | 15 | 角色过滤、扩散激活、评分公式 |
| `diffusion.test.ts` | 10 | BFS 算法、衰减、阈值截断 |
| `fsrs.test.ts` | 10 | 成功/失败/衰减公式、温度边界 |
| `practice.test.ts` | 7 | 访问追踪、FSRS 更新 |
| `maintenance.test.ts` | 8 | 衰减扫描、冻结检测、冲突检测 |
| `role-config.test.ts` | 6 | role_config CRUD |
| `audit.test.ts` | 5 | 审计日志写入与查询 |
| `embedding.test.ts` | 9 | 余弦相似度、存储 round-trip |
| `ops.test.ts` | 8 | 导出/导入、增强状态 |
| `integration.test.ts` | 1 | learn→confirm→search 全链路 |
| `mcp-integration.test.ts` | 2 | MCP 协议层（tools/list、learn+confirm） |
| `install.test.ts` | 1 | 安装脚本 |
| `smoke.test.ts` | 1 | 框架验证 |

---

## 3. 安装验证（2 分钟）

```bash
# 安装到 Claude Code
node dist/install.js
```

**预期结果：**
- 输出 JSON `{ "action": "installed", "dir": "...", "llmConfigured": false }`
- `claude mcp list` 显示 `auto-kb` 已注册

**验证安装结果：**

```bash
claude mcp list | grep auto-kb
```

---

## 4. 核心功能验证（5 分钟）

以下测试通过 MCP 协议直接调用，不依赖 Claude Code 会话。

```bash
# 1. 启动 MCP Server 后台运行
node dist/index.js &
PID=$!
sleep 1

# 2. 验证 tools/list 返回 17 个工具
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node -e "
const c=require('child_process');
const p=c.spawn('node',['dist/index.js']);
p.stdout.on('data',d=>console.log(d.toString()));
p.stdin.write('{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}\n');
setTimeout(()=>p.kill(),2000);
"
# 应看到 17 个工具的 JSON 响应

# 3. 清理
kill $PID 2>/dev/null
```

### 核心工作流测试

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | `knowledge_learn` 存一条知识 | 返回 `{ id, title, dedup: false }` |
| 2 | `knowledge_confirm` 确认 | 返回 `{ success: true }` |
| 3 | `knowledge_search` 搜索 | 找到刚确认的知识 |
| 4 | `knowledge_relevant` 关联检索 | 按角色 + 任务返回结果 |
| 5 | `knowledge_export` 导出 | 返回全部知识 JSON |
| 6 | `knowledge_import` 导入 | 跳过已有 ID |
| 7 | `knowledge_status` 状态 | 显示条目数、温度分布等 |

---

## 5. 角色系统验证（3 分钟）

```bash
# 1. 配置 frontend 角色，指定入口知识
knowledge_role_config(
  action: "set",
  role: "frontend",
  entry_kn_ids: ["<已确认的知识 ID>"],
  spread_depth: 2,
  context_budget: 4000
)

# 2. 验证配置已保存
knowledge_role_config(action: "get", role: "frontend")
# → 返回刚设置的配置

# 3. 关联检索
knowledge_relevant(role: "frontend", task: "配置构建工具")
# → 返回扩散激活 + BM25 匹配的结果
```

---

## 6. 冲突检测验证（2 分钟）

```bash
# 1. 存第一条知识
knowledge_learn(content: "Vite 配置文件是 vite.config.ts", title: "Vite Config")

# 2. 确认
knowledge_confirm(id: "<ID>")

# 3. 存矛盾的知识
knowledge_learn(
  content: "Vite 配置文件是 vite.config.js",
  title: "Vite Config js",
  contradicts: ["<第一条的 ID>"]
)

# 4. 验证双方都是 disputed
knowledge_status
# → disputed 计数应为 2
```

---

## 7. 导出/导入验证（2 分钟）

```bash
# 1. 导出全部知识
knowledge_export
# → 保存返回的 JSON

# 2. 清空知识库（删库）
rm knowledge/knowledge.db

# 3. 重新导入
knowledge_import(entries: <上一步导出的 JSON 数据>)

# 4. 验证导入成功
knowledge_status
# → 条目数应与导出前一致
```

---

## 8. 衰减与维护验证（1 分钟）

```bash
# 手动触发衰减扫描
knowledge_maintenance(action: "decay_sweep")
# → 返回 { decayed: N, frozen: M }
```

---

## 9. 向量搜索验证（可选，需配置 LLM）

仅当配置了 LLM 且 LLM 支持 embeddings API 时可用。

```bash
# 存入知识并生成嵌入
knowledge_learn(content: "React 是一个 UI 库", title: "React")
knowledge_confirm(id: "<ID>")

# 混合搜索
knowledge_search(query: "前端框架", useVector: true)
# → 返回 BM25 + 向量混合排序的结果
```

---

## 10. 审计日志验证（1 分钟）

```bash
# 查看最近操作
knowledge_audit(action: "query", limit: 10)

# 按操作类型过滤
knowledge_audit(action: "query", operation: "learn")
```

---

## CI/CD 集成

```yaml
# .github/workflows/test.yml 示例
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build
      - run: cp src/storage/schema.sql dist/storage/schema.sql
      - run: npm test
```

---

## 常见问题排查

### schema.sql 找不到
```
症状: SQLITE_ERROR: no such table: knowledge
原因: dist/storage/schema.sql 缺失
解决: cp src/storage/schema.sql dist/storage/schema.sql
```

### better-sqlite3 编译失败
```
症状: npm install 报 node-gyp 错误
原因: 缺少 C++ 编译工具
解决: 
  Ubuntu/Debian: apt install build-essential python3
  macOS: xcode-select --install
  Windows: npm install --global windows-build-tools
```

### MCP Server 启动后无响应
```
症状: tools/list 请求无返回
原因: 端口冲突或 Node 版本过低
解决: node --version 需 ≥ 18
```

### 端口 443 超时（中国区用户）
```
症状: git push/clone 连接 github.com 超时
解决: 使用代理或镜像
  git config --global http.proxy http://127.0.0.1:7890
```
