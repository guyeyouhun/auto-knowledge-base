-- auto-kb schema

CREATE TABLE IF NOT EXISTS knowledge (
    id TEXT PRIMARY KEY,
    type TEXT DEFAULT 'concept',
    title TEXT NOT NULL,
    summary TEXT DEFAULT '',
    content TEXT DEFAULT '',
    code_example TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    roles TEXT DEFAULT '[]',
    tasks TEXT DEFAULT '[]',
    truth TEXT DEFAULT 'staging',
    provenance TEXT DEFAULT 'unverified',
    evidence TEXT DEFAULT '',
    strength REAL DEFAULT 0.8,
    stability REAL DEFAULT 0.8,
    difficulty REAL DEFAULT 0.3,
    temperature TEXT DEFAULT 'warm',
    practice_count INTEGER DEFAULT 0,
    practice_success INTEGER DEFAULT 0,
    supersedes TEXT,
    superseded_by TEXT,
    source TEXT DEFAULT '',
    relations TEXT DEFAULT '[]',
    created_at TEXT DEFAULT '',
    updated_at TEXT DEFAULT '',
    last_accessed TEXT
);

-- FTS5全文索引（自动同步）
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
    title,
    summary,
    content,
    tags,
    content=knowledge,
    content_rowid=id,
    tokenize='unicode61'
);

-- 增删改触发器
CREATE TRIGGER IF NOT EXISTS knowledge_ai AFTER INSERT ON knowledge BEGIN
  INSERT INTO knowledge_fts(rowid, title, summary, content, tags)
  VALUES (new.id, new.title, new.summary, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_ad AFTER DELETE ON knowledge BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, title, summary, content, tags)
  VALUES('delete', old.id, old.title, old.summary, old.content, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_au AFTER UPDATE ON knowledge BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, title, summary, content, tags)
  VALUES('delete', old.id, old.title, old.summary, old.content, old.tags);
  INSERT INTO knowledge_fts(rowid, title, summary, content, tags)
  VALUES (new.id, new.title, new.summary, new.content, new.tags);
END;

-- 关系表
CREATE TABLE IF NOT EXISTS relations (
    source_kn TEXT NOT NULL,
    target_kn TEXT NOT NULL,
    rel_type TEXT NOT NULL DEFAULT 'references',
    weight REAL DEFAULT 1.0,
    PRIMARY KEY (source_kn, target_kn, rel_type)
);

-- 角色配置
CREATE TABLE IF NOT EXISTS role_config (
    role TEXT PRIMARY KEY,
    entry_kn_ids TEXT NOT NULL DEFAULT '[]',
    spread_depth INTEGER NOT NULL DEFAULT 2,
    context_budget INTEGER NOT NULL DEFAULT 5000,
    priority_tasks TEXT NOT NULL DEFAULT '[]'
);

-- 审计日志
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kn_id TEXT,
    operation TEXT NOT NULL,
    detail TEXT,
    actor TEXT NOT NULL DEFAULT 'agent',
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 嵌入向量（基础列存储为逗号分隔字符串）
CREATE TABLE IF NOT EXISTS knowledge_embeddings (
    kn_id TEXT PRIMARY KEY,
    embedding TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 刷新队列（content-digester 反馈回路）
CREATE TABLE IF NOT EXISTS refresh_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kn_id TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'unknown',
    source_ref TEXT DEFAULT '',
    reason TEXT DEFAULT 'content_digested',
    status TEXT DEFAULT 'pending',
    error TEXT,
    kn_id_new TEXT,
    created_at TEXT DEFAULT '',
    scheduled_at TEXT DEFAULT '',
    updated_at TEXT DEFAULT ''
);

-- 知识空白（gap）记录
CREATE TABLE IF NOT EXISTS knowledge_gaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    source_url TEXT,
    reporter_role TEXT,
    reporter_agent TEXT,
    status TEXT DEFAULT 'open',
    kn_id TEXT,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_knowledge_truth ON knowledge(truth);
CREATE INDEX IF NOT EXISTS idx_knowledge_temperature ON knowledge(temperature);
CREATE INDEX IF NOT EXISTS idx_knowledge_source ON knowledge(source);
CREATE INDEX IF NOT EXISTS idx_knowledge_updated_at ON knowledge(updated_at);
CREATE INDEX IF NOT EXISTS idx_refresh_queue_status ON refresh_queue(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_status ON knowledge_gaps(status);
