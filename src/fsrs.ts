/**
 * FSRS-6 Engine — Pure math functions for spaced repetition decay.
 *
 * All functions are PURE: no side effects, no storage access.
 * Every mutation returns a new FSRSParams object (immutable pattern).
 */

export interface FSRSParams {
  strength: number
  stability: number
  difficulty: number
}

/**
 * Apply a successful recall.
 *
 * strength asymptotically approaches 1:
 *   strength += 0.05 * (1 - strength)
 * stability grows by 1.3x.
 * difficulty is unchanged on success.
 */
export function applySuccess(p: FSRSParams): FSRSParams {
  return {
    strength: Math.min(1, p.strength + 0.05 * (1 - p.strength)),
    stability: p.stability * 1.3,
    difficulty: p.difficulty,
  }
}

/**
 * Apply a failed recall.
 *
 * strength drops by 0.10 (floored at 0).
 * difficulty rises by 1.1x (capped at 1.0).
 * stability is unchanged on failure.
 */
export function applyFailure(p: FSRSParams): FSRSParams {
  return {
    strength: Math.max(0, p.strength - 0.1),
    stability: p.stability,
    difficulty: Math.min(1, p.difficulty * 1.1),
  }
}

/**
 * Apply time-based decay. Only takes effect when daysSinceAccess > 7.
 *
 *   strength -= 0.02 * (daysSinceAccess - 7), floored at 0
 *   stability -= 0.05 * (daysSinceAccess - 7), floored at 0
 *
 * When daysSinceAccess <= 7 the original object is returned unchanged (pure).
 */
export function applyDecay(p: FSRSParams, daysSinceAccess: number): FSRSParams {
  if (daysSinceAccess <= 7) return p

  const excessDays = daysSinceAccess - 7
  return {
    strength: Math.max(0, p.strength - 0.02 * excessDays),
    stability: Math.max(0, p.stability - 0.05 * excessDays),
    difficulty: p.difficulty,
  }
}

/**
 * Derive a temperature label from the current strength value.
 *
 *   > 0.80 → hot
 *   > 0.60 → warm
 *   > 0.10 → cool
 *   ≤ 0.10 → frozen
 */
export function updateTemperature(
  strength: number,
): 'hot' | 'warm' | 'cool' | 'frozen' {
  if (strength > 0.8) return 'hot'
  if (strength > 0.6) return 'warm'
  if (strength > 0.1) return 'cool'
  return 'frozen'
}
