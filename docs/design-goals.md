# auto-knowledge-base Design Goals

## Why

LLMs and coding agents lack persistent, structured knowledge. Session context windows
are limited, and agents forget what they learned across sessions. Auto-knowledge-base
solves this by providing a persistent, queryable knowledge store that agents can read
and write via MCP tools.

## Design Principles

1. **Agent-first, human-friendly** — tools designed for agentic consumption first,
   human debugging second. Agents write structured queries; humans get a CLI/UI for
   oversight.

2. **Automatic knowledge injection** — knowledge reaches the agent without explicit
   querying. FTS5 BM25 + vector embeddings + FSRS spaced repetition + role-based
   diffusion act together to push relevant knowledge into the agent's context.

3. **Layered truth** — from raw staging through confirmed to stable, with provenance
   tracking at every step. Knowledge enters as staging, confirmed for use, frozen
   when stale.

4. **Composable** — learn tool writes; search/relevant reads; confirm/practice/diffuse
   govern lifecycle; maintenance/export handle housekeeping. Each tool does one thing
   well.

5. **Graceful degradation** — LLM rerank, extraction, and embedding each operate
   independently. A failure in one never blocks the others.

## Non-goals

- Full-text vector database (SQLite + FTS5 is sufficient)
- Multi-user access control (single-user assumed; OS file permissions are enough)
- Knowledge provenance graph visualization (CLAUDE.md already documents the schema)

## Scope

### In scope

- MCP tools: learn, search, relevant, confirm, status, practice, audit, role-config,
  maintenance, export, import, report-gap, gaps
- FSRS-6 spaced repetition for retention optimization
- FTS5 BM25 + vector (cosine similarity) hybrid search
- Role-based diffusion activation (BFS)
- Knowledge lifecycle: staging → confirmed → frozen → refresh
- Gap detection: identify topics with insufficient coverage
- Audit logging for accountability
- Uninstall/cleanup

### Out of scope (for now)

- Built-in content ingestion (handled by content-digester)
- Knowledge conflict resolution (manual oversight via confirm/practice)
- Multi-user RBAC
- External knowledge base sync

## Migration Path

v0.1 → v0.2 (current): Focus on core learn/search lifecycle, staging → confirmation,
FSRS decay, diffusion activation, gap detection.

v0.3 (planned): Automatic context injection via MCP prompts/get, knowledge decay
visualization dashboard.

v1.0: Production-ready with content-digester full integration, CLI admin tools,
and migration utilities.