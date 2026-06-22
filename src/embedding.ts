import type { LLMClient } from './llm/client.js'

/**
 * Compute cosine similarity between two Float32Array vectors.
 * Returns 0 for mismatched lengths.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0

  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

/**
 * Generate an embedding vector for the given text using the LLM client.
 * Returns null if the LLM is not configured or the request fails.
 */
export async function generateEmbedding(
  text: string,
  llm: LLMClient,
): Promise<Float32Array | null> {
  if (!llm.configured) return null

  try {
    const result = await llm.embed(text)
    return result ? new Float32Array(result) : null
  } catch {
    return null
  }
}
