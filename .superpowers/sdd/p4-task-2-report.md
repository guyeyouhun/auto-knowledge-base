# Phase 4 Task 2: Vector Embeddings — Implementation Report

## Summary

Added optional vector embedding support to auto-knowledge-base. The feature provides cosine similarity-based semantic search fused with BM25 using Reciprocal Rank Fusion (RRF). All embedding operations are optional and degrade gracefully when the LLM is not configured.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/storage/schema.sql` | Modified | Added `knowledge_embeddings` table |
| `src/embedding.ts` | Created | Cosine similarity math + generation wrapper |
| `src/llm/client.ts` | Modified | Added `embed()` method to `LLMClient` |
| `src/storage/interface.ts` | Modified | Added 3 embedding storage methods |
| `src/storage/sqlite-store.ts` | Modified | Implemented embedding storage with SQLite BLOB |
| `src/tools/search.ts` | Modified | Optional hybrid search with RRF fusion |
| `src/__tests__/embedding.test.ts` | Created | Tests for cosine similarity + storage round-trips |
| `.superpowers/sdd/p4-task-2-report.md` | Created | This report |

## Design Decisions

1. **Separation of concerns**: Pure math (`cosineSimilarity`) lives in `embedding.ts`. API call (`embed()`) lives on `LLMClient`. Storage lives in `SqliteStore`. Each layer is independently testable.

2. **Graceful degradation**: BM25 search remains the default. Vector search is opt-in via the `useVector` parameter on `handleSearch`. If the LLM is unconfigured or embedding generation fails, the system silently falls back to BM25-only.

3. **RRF Fusion**: Uses the standard `k=60` RRF constant. Scores are computed as `0.5 * (1 / (bm25_rank + k)) + 0.5 * (1 / (vector_rank + k))`. Items appearing in only one result set get a penalty rank of `N+1` for the missing set.

4. **SQLite BLOB storage**: Embeddings are stored as raw `Float32Array` buffers in a BLOB column using the native SQLite `BLOB` type. The `ON CONFLICT` upsert pattern keeps idempotent saves clean.

## Test Results

- cosineSimilarity: identical vectors = 1.0
- cosineSimilarity: orthogonal vectors = 0.0
- cosineSimilarity: opposite vectors = -1.0
- cosineSimilarity: mismatched length = 0
- cosineSimilarity: zero vectors = 0
- save/get embedding round-trip
- null returned for non-existent embedding
- upsert on conflict
- getAllEmbeddings with multiple entries
