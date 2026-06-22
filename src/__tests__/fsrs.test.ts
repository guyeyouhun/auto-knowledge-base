import { describe, expect, test } from 'vitest'
import {
  applySuccess,
  applyFailure,
  applyDecay,
  updateTemperature,
  type FSRSParams,
} from '../fsrs.js'

describe('applySuccess', () => {
  test('increases strength', () => {
    const p: FSRSParams = { strength: 0.5, stability: 10, difficulty: 0.3 }
    const result = applySuccess(p)
    expect(result.strength).toBeGreaterThan(p.strength)
    // Verified: 0.5 + 0.05 * (1 - 0.5) = 0.5 + 0.025 = 0.525
    expect(result.strength).toBeCloseTo(0.525, 10)
  })

  test('approaches 1 asymptotically (multiple calls)', () => {
    let p: FSRSParams = { strength: 0, stability: 10, difficulty: 0.3 }
    // After many successes, strength should approach but never exceed 1
    for (let i = 0; i < 1000; i++) {
      p = applySuccess(p)
    }
    expect(p.strength).toBeLessThanOrEqual(1)
    // After 1000 iterations from 0, strength should be near 1
    expect(p.strength).toBeGreaterThan(0.99)
  })

  test('increases stability by 1.3x', () => {
    const p: FSRSParams = { strength: 0.5, stability: 10, difficulty: 0.3 }
    const result = applySuccess(p)
    expect(result.stability).toBeCloseTo(13, 10)
  })
})

describe('applyFailure', () => {
  test('decreases strength by 0.10', () => {
    const p: FSRSParams = { strength: 0.7, stability: 10, difficulty: 0.3 }
    const result = applyFailure(p)
    expect(result.strength).toBeCloseTo(0.6, 10)
  })

  test('increases difficulty by 1.1x', () => {
    const p: FSRSParams = { strength: 0.7, stability: 10, difficulty: 0.3 }
    const result = applyFailure(p)
    expect(result.difficulty).toBeCloseTo(0.33, 10)
  })
})

describe('applyDecay', () => {
  test('does nothing at exactly 7 days', () => {
    const p: FSRSParams = { strength: 0.8, stability: 20, difficulty: 0.3 }
    const result = applyDecay(p, 7)
    expect(result).toBe(p) // same reference — no decay applied
    expect(result.strength).toBe(0.8)
    expect(result.stability).toBe(20)
  })

  test('decays at 14 days', () => {
    const p: FSRSParams = { strength: 0.8, stability: 20, difficulty: 0.3 }
    // excessDays = 14 - 7 = 7
    // strength decay = 0.02 * 7 = 0.14 → 0.8 - 0.14 = 0.66
    // stability decay = 0.05 * 7 = 0.35 → 20 - 0.35 = 19.65
    const result = applyDecay(p, 14)
    expect(result.strength).toBeCloseTo(0.66, 10)
    expect(result.stability).toBeCloseTo(19.65, 10)
  })

  test("doesn't go below 0", () => {
    const p: FSRSParams = { strength: 0.05, stability: 0.1, difficulty: 0.3 }
    // excessDays = 365 (massive gap)
    // strength decay = 0.02 * 358 = 7.16 → floored at 0
    const result = applyDecay(p, 365)
    expect(result.strength).toBe(0)
    expect(result.stability).toBe(0)
  })
})

describe('updateTemperature', () => {
  test('boundaries', () => {
    expect(updateTemperature(0.81)).toBe('hot')
    expect(updateTemperature(0.80)).toBe('warm')
    expect(updateTemperature(0.61)).toBe('warm')
    expect(updateTemperature(0.60)).toBe('cool')
    expect(updateTemperature(0.11)).toBe('cool')
    expect(updateTemperature(0.10)).toBe('frozen')
  })

  test('frozen state persists (strength 0)', () => {
    expect(updateTemperature(0)).toBe('frozen')
    expect(updateTemperature(-0.01)).toBe('frozen')
  })
})
