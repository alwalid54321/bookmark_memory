/**
 * embeddings.ts — Local embedding generation using a lightweight approach.
 * Uses the Gemini embedding API or falls back to a simple TF-IDF-like
 * bag-of-words approach for offline/zero-dependency operation.
 *
 * We avoid bundling transformers.js (~40MB) to keep the extension lightweight.
 * Instead we use Gemini's embedding endpoint when available, and a local
 * hashing-based embedding as fallback.
 */

const EMBEDDING_DIM = 256;

// ─── Simple local embedding (no external deps) ─────────────────────
// Uses a deterministic hashing approach to create a fixed-size vector
// from text. Not as good as a neural model, but works offline instantly.

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

function localEmbed(text: string): number[] {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const words = normalized.split(/\s+/).filter(w => w.length > 1);
  const vec = new Float32Array(EMBEDDING_DIM).fill(0);

  for (const word of words) {
    const h = Math.abs(hashCode(word));
    const idx = h % EMBEDDING_DIM;
    const sign = (h & 1) === 0 ? 1 : -1;
    vec[idx] += sign;
  }

  // L2 normalize
  let mag = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) mag += vec[i] * vec[i];
  mag = Math.sqrt(mag);
  if (mag > 0) {
    for (let i = 0; i < EMBEDDING_DIM; i++) vec[i] /= mag;
  }

  return Array.from(vec);
}

// ─── Gemini Embedding API ───────────────────────────────────────────

async function geminiEmbed(text: string, apiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT',
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini embedding failed: ${response.status}`);
  }

  const data = await response.json();
  return data.embedding.values as number[];
}

// ─── Ollama Embedding API ───────────────────────────────────────────

async function ollamaEmbed(text: string, model: string = 'nomic-embed-text'): Promise<number[]> {
  const response = await fetch('http://localhost:11434/api/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text }),
  });

  if (!response.ok) {
    throw new Error(`Ollama embedding failed: ${response.status}`);
  }

  const data = await response.json();
  return data.embeddings[0] as number[];
}

// ─── Public API ─────────────────────────────────────────────────────

export type EmbeddingProvider = 'gemini' | 'ollama' | 'local';

export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  geminiApiKey?: string;
  ollamaModel?: string;
}

export async function generateEmbedding(
  text: string,
  config: EmbeddingConfig,
): Promise<number[]> {
  // Truncate very long texts to keep embedding cost/time reasonable
  const truncated = text.slice(0, 2000);

  try {
    switch (config.provider) {
      case 'gemini':
        if (!config.geminiApiKey) throw new Error('No Gemini API key');
        return await geminiEmbed(truncated, config.geminiApiKey);

      case 'ollama':
        return await ollamaEmbed(truncated, config.ollamaModel ?? 'nomic-embed-text');

      case 'local':
      default:
        return localEmbed(truncated);
    }
  } catch (err) {
    console.warn('[BookmarkMemory] Embedding failed, using local fallback:', err);
    return localEmbed(truncated);
  }
}

/**
 * Batch embedding for multiple texts (reduces overhead for initial indexing).
 */
export async function generateEmbeddings(
  texts: string[],
  config: EmbeddingConfig,
): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await generateEmbedding(text, config));
  }
  return results;
}
