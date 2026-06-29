# QA Plan

## 质量目标

- 所有 MCP 工具按预期工作。
- 错误处理完善（LLM 不可用、嵌入向量失败、数据库异常）。
- 性能：知识检索 < 500ms（本地 SQLite）。
- 安全：SQL 注入防护（参数化查询），无明文密钥泄漏。

## 测试分层

### 单元测试（写在 Python 还是 JS？）

当前 129 个 Vitest 测试覆盖：
- types.ts 类型验证（5 个测试，36 assertions）
- sqlite-store.ts（4 个测试）
- schema.sql 初始化（sqlite-store.test.ts）
- learn + confirm 流程（learn.test.ts）
- search + relevant（search.test.ts, relevant.test.ts）
- audit.log 完整性（audit.test.ts）
- role_config CRUD（role-config.test.ts）
- ops.ts 运维工具（ops.test.ts）
- embedding + hybrid search（embedding.test.ts）
- FSRS 间隔重复（fsrs.test.ts）
- diffusion BFS 激活（diffusion.test.ts）
- maintenance 维护（maintenance.test.ts）
- practice 练习（practice.test.ts）
- LLM rerank（search.test.ts）
- install / uninstall（install.test.ts）
- MCP 集成协议（mcp-integration.test.ts）
- 全链路集成测试（integration.test.ts）
- smoke 冒烟测试（smoke.test.ts）
- setup.ts 测试基础设施

### E2E 测试

`scripts/integration_test.py` 手动运行的全链路测试：
1. 启动 MCP Server（子进程）
2. knowledge_learn → confirmation → search
3. 验证输出格式和状态码

### 手动测试清单

1. ✅ `npm test` 全绿
2. ✅ MCP Server 启动（`node path/to/server.js`）
3. ✅ tools/list 返回所有工具
4. ✅ knowledge_learn + confirm 正常写入
5. ✅ knowledge_search 返回结果
6. ✅ knowledge_relevant 关联查询
7. ✅ knowledge_status 健康检查
8. ✅ 零数据初始化不崩溃
9. ✅ 大数据量下搜索 < 2s
10. ✅ LLM 不可用时降级模式正常

## 测试用例（按优先级）

### P0: 核心功能
- [x] knowledge_learn 正常创建 staging 条目
- [x] knowledge_confirm 将 staging 转为 active
- [x] knowledge_search 返回已确认条目
- [x] knowledge_status 健康检查正常
- [x] 并行 learn → confirm → search 链路
- [x] LLM 提取标题/标签/摘要
- [x] BM25 搜索全文
- [x] 获取字幕
- [x] 嵌入向量搜索
- [x] 混合搜索
- [x] LLM rerank + 语义汇总
- [x] FSRS 间隔重复
- [x] 角色基础扩散激活
- [x] 审计日志
- [x] 导出/导入
- [x] MCP 协议集成（tools/list + tools/call）

### P1: 边界情况
- [x] 空标题/空内容
- [x] 过长字段自动截断
- [x] 重复 entry 的 practice_count +1
- [x] 不存在 entry 的 search 返回空
- [x] 匿名学习（无 source）
- [x] 数据库连接失败
- [x] 角色分配不存在角色
- [x] 同时安装和卸载

### P2: 稳定性
- [x] 零数据启动不崩溃
- [x] 大数据量搜索 < 2s
- [x] LLM 不可用时降级
- [x] MCP 传输层异常
- [x] Embedding 不可用时仅 BM25
- [x] 数据库 WAL 模式
- [x] 无效 JSON 工具参数

## 回归测试策略

每次 PR 前：
1. `npm test` 全绿
2. 如果修改了 MCP 工具函数，运行 `scripts/integration_test.py`
3. 验证 README.md 中的 API 示例可用

## 性能基准

| 操作 | 目标 | 实测 |
|------|------|------|
| knowledge_learn (单条) | <200ms | <100ms |
| knowledge_search (1000条目) | <500ms | <200ms |
| knowledge_relevant | <300ms | <150ms |
| knowledge_export | <1s | <500ms |
| MCP Server 启动 | <2s | <1s |