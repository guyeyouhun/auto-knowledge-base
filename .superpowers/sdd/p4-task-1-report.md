# Phase 4, Task 1: Audit Logging

## Changes

### `src/storage/schema.sql`
- Added `audit_log` table with columns: `id`, `kn_id`, `operation`, `detail`, `actor`, `timestamp`
- Added indexes on `kn_id`, `operation`, and `timestamp` for efficient queries

### `src/types.ts`
- Added `AuditEntry` interface with fields: `id`, `kn_id`, `operation`, `detail`, `actor`, `timestamp`

### `src/storage/interface.ts`
- Added `logAudit(kn_id, operation, detail?)` method to `KnowledgeStorage` interface
- Added `queryAudit(limit?, operation?)` method returning `AuditEntry[]`

### `src/storage/sqlite-store.ts`
- Implemented `logAudit()` — inserts into `audit_log` table
- Implemented `queryAudit()` — queries with optional operation filter, ordered by timestamp DESC, with configurable limit (default 50)

### `src/validation.ts`
- Added `AuditSchema` with `action: 'query'`, optional `limit` and `operation` fields

### `src/tools/audit.ts` (new)
- Exports `handleAuditQuery(storage, limit?, operation?)` — returns `{ entries }` from the audit log

### `src/index.ts`
- Registered `knowledge_audit` tool in the tool list with input schema
- Added `case 'knowledge_audit'` handler in the dispatch switch
- Added `storage.logAudit(...)` calls after successful completion of: `knowledge_search`, `knowledge_learn`, `knowledge_confirm`, `knowledge_relevant`, `knowledge_role_config` (set action), `knowledge_maintenance` (decay_sweep)

### `src/__tests__/audit.test.ts` (new, 5 tests)
- **Log and query**: logs an entry, verifies it is returned with correct fields
- **Query with limit**: inserts 3 entries, queries with limit 2, verifies count
- **Filter by operation**: inserts entries with different operations, filters for one type
- **Reverse chronological order**: inserts 3 entries, verifies DESC ordering
- **Null kn_id**: logs with null kn_id, verifies it is stored as null

## Verification
- Build: `tsc` passes with zero errors.
- All 5 new audit tests pass.
