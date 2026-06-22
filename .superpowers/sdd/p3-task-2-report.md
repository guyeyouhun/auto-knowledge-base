# Phase 3 Task 2: Practice Tracking

## Summary

Implemented practice tracking for the auto-knowledge-base storage layer, integrating FSRS-6 math formulas for spaced repetition updates.

## Changes

### `src/storage/interface.ts`
- Added `recordAccess(id: string): Promise<void>` — increments `practice_count` and sets `last_accessed`
- Added `recordPractice(id: string, success: boolean): Promise<void>` — uses FSRS formulas to update `strength`, `stability`, `difficulty`, and `temperature`

### `src/storage/sqlite-store.ts`
- Imported `applySuccess`, `applyFailure`, `updateTemperature` from `../fsrs.js`
- Implemented `recordAccess()`: simple UPDATE of `practice_count` and `last_accessed`
- Implemented `recordPractice()`: fetches current entry, applies FSRS formulas via pure functions, then UPDATEs FSRS fields, `practice_count`, `practice_success`, `temperature`, and timestamps

### `src/tools/relevant.ts`
- After scoring and slicing results, calls `storage.recordAccess(id)` for each returned entry using `Promise.all` for concurrent execution

### `src/__tests__/practice.test.ts`
- `recordAccess`:
  - increments `practice_count` across multiple calls
  - sets `last_accessed`
- `recordPractice`:
  - handles nonexistent id gracefully (no-op)
  - updates strength (0.5 -> 0.525), stability (10 -> 13), and temperature (warm -> cool) on success
  - updates strength (0.5 -> 0.4), difficulty (0.3 -> 0.33), and temperature (warm -> cool) on failure
  - increments `practice_count` and `practice_success` on success
  - increments `practice_count` but not `practice_success` on failure

## Test Results

All 83 tests pass across 13 test files, including 7 new practice tests.
