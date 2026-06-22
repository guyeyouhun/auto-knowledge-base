-- Enable WAL mode for concurrent reads
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS knowledge (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('project','pattern','concept','decision')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  code_example TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  roles TEXT NOT NULL DEFAULT '[]',
  tasks TEXT NOT NULL DEFAULT '[]',
  truth TEXT NOT NULL DEFAULT 'staging'
    CHECK(truth IN ('confirmed','staging','disputed','deprecated')),
  provenance TEXT NOT NULL DEFAULT 'unverified'
    CHECK(provenance IN ('extracted','inferred','synthesized','user_stated','unverified')),
  evidence TEXT,
  strength REAL NOT NULL DEFAULT 0.8,
  stability REAL NOT NULL DEFAULT 0.8,
  difficulty REAL NOT NULL DEFAULT 0.3,
  temperature TEXT NOT NULL DEFAULT 'warm'
    CHECK(temperature IN ('hot','warm','cool','frozen')),
  practice_count INTEGER NOT NULL DEFAULT 0,
  practice_success INTEGER NOT NULL DEFAULT 0,
  supersedes TEXT REFERENCES knowledge(id),
  superseded_by TEXT REFERENCES knowledge(id),
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed TEXT
);

CREATE TABLE IF NOT EXISTS relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_kn TEXT NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
  target_kn TEXT NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
  rel_type TEXT NOT NULL CHECK(rel_type IN (
    'references','contradicts','supersedes','derives_from','extends','implements'
  )),
  weight REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_kn, target_kn, rel_type)
);

CREATE TABLE IF NOT EXISTS role_config (
  role TEXT PRIMARY KEY,
  entry_kn_ids TEXT NOT NULL DEFAULT '[]',
  spread_depth INTEGER NOT NULL DEFAULT 2,
  context_budget INTEGER NOT NULL DEFAULT 4000,
  priority_tasks TEXT NOT NULL DEFAULT '[]'
);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  title, summary, content, code_example, tags, tasks,
  content='knowledge',
  content_rowid='rowid',
  tokenize='unicode61'
);

-- FTS triggers
CREATE TRIGGER IF NOT EXISTS knowledge_ai AFTER INSERT ON knowledge BEGIN
  INSERT INTO knowledge_fts(rowid, title, summary, content, code_example, tags, tasks)
  VALUES (new.rowid, new.title, new.summary, new.content, new.code_example, new.tags, new.tasks);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_ad AFTER DELETE ON knowledge BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, title, summary, content, code_example, tags, tasks)
  VALUES ('delete', old.rowid, old.title, old.summary, old.content, old.code_example, old.tags, old.tasks);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_au AFTER UPDATE ON knowledge BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, title, summary, content, code_example, tags, tasks)
  VALUES ('delete', old.rowid, old.title, old.summary, old.content, old.code_example, old.tags, old.tasks);
  INSERT INTO knowledge_fts(rowid, title, summary, content, code_example, tags, tasks)
  VALUES (new.rowid, new.title, new.summary, new.content, new.code_example, new.tags, new.tasks);
END;

CREATE INDEX IF NOT EXISTS idx_knowledge_truth ON knowledge(truth);
CREATE INDEX IF NOT EXISTS idx_knowledge_temperature ON knowledge(temperature);
CREATE INDEX IF NOT EXISTS idx_knowledge_strength ON knowledge(strength DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_provenance ON knowledge(provenance);
CREATE INDEX IF NOT EXISTS idx_knowledge_roles ON knowledge(roles);
CREATE INDEX IF NOT EXISTS idx_rel_source ON relations(source_kn);
CREATE INDEX IF NOT EXISTS idx_rel_target ON relations(target_kn);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kn_id TEXT,
  operation TEXT NOT NULL,
  detail TEXT,
  actor TEXT DEFAULT 'agent',
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_kn ON audit_log(kn_id);
CREATE INDEX IF NOT EXISTS idx_audit_op ON audit_log(operation);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(timestamp);
