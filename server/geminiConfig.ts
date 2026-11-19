import { GoogleGenAI } from "@google/genai";

/**
 * Centralized Gemini model configuration.
 * Uses Gemini 4 Hydrogen (current multimodal Flash model alias).
 */
export const GEMINI_VISION_MODEL = "gemini-4-hydrogen";

const COOLDOWN_MS = 60_000;
const keyCooldownUntil = new Map<number, number>();
let preferredKeyIndex = 0;

function isValidKeyCandidate(val: string | undefined): val is string {
  if (!val) return false;
  const trimmed = val.trim();
  return trimmed.length > 0 && trimmed !== "MY_GEMINI_API_KEY";
}

/**
 * Collects all unique server-side Gemini API keys from environment variables:
 * - GEMINI_API_KEY (single or comma-separated)
 * - GEMINI_API_KEY_2, GEMINI_API_KEY_3, GEMINI_API_KEY_4, GEMINI_API_KEY_5
 * - GEMINI_API_KEYS (comma/newline-separated)
 */
export function getConfiguredApiKeys(): string[] {
  const rawSources = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
    process.env.GEMINI_API_KEYS,
  ];

  const seen = new Set<string>();
  const keys: string[] = [];

  for (const src of rawSources) {
    if (!src) continue;
    const parts = src.split(/[\s,;]+/);
    for (const part of parts) {
      const candidate = part.trim();
      if (isValidKeyCandidate(candidate) && !seen.has(candidate)) {
        seen.add(candidate);
        keys.push(candidate);
      }
    }
  }

  return keys;
}

export function isGeminiKeyConfigured(): boolean {
  return getConfiguredApiKeys().length > 0;
}

export function createGeminiClientForKey(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function isFailoverWorthyError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota") ||
    msg.includes("403") ||
    msg.includes("permission_denied") ||
    msg.includes("api_key_invalid") ||
    msg.includes("400") ||
    msg.includes("503") ||
    msg.includes("unavailable") ||
    msg.includes("timeout")
  );
}

/**
 * Executes a Gemini operation across all configured server API keys,
 * automatically failing over to the next available key if the current key
 * hits quota, rate limits, invalidation, or transient unavailability.
 */
export async function executeWithKeyFailover<T>(
  operation: (ai: GoogleGenAI, keySlot: number) => Promise<T>
): Promise<{ data: T; usedKeySlot: number; totalKeys: number }> {
  const keys = getConfiguredApiKeys();
  if (keys.length === 0) {
    throw new Error(
      "GEMINI_API_KEY is not configured on the server. Add it in Settings > Secrets."
    );
  }

  const now = Date.now();
  const orderedIndices: number[] = [];

  // Prefer active healthy keys first, starting from preferredKeyIndex
  for (let offset = 0; offset < keys.length; offset++) {
    const idx = (preferredKeyIndex + offset) % keys.length;
    const cooldown = keyCooldownUntil.get(idx) ?? 0;
    if (cooldown <= now) {
      orderedIndices.push(idx);
    }
  }
  // Append cooled-down keys as last resort so we never fail if all are cooled down
  for (let offset = 0; offset < keys.length; offset++) {
    const idx = (preferredKeyIndex + offset) % keys.length;
    if (!orderedIndices.includes(idx)) {
      orderedIndices.push(idx);
    }
  }

  let lastError: unknown;

  for (let i = 0; i < orderedIndices.length; i++) {
    const idx = orderedIndices[i];
    const client = createGeminiClientForKey(keys[idx]);

    try {
      const data = await operation(client, idx + 1);
      preferredKeyIndex = idx;
      keyCooldownUntil.delete(idx);
      return { data, usedKeySlot: idx + 1, totalKeys: keys.length };
    } catch (err: unknown) {
      lastError = err;
      const shouldFailover = isFailoverWorthyError(err);

      if (shouldFailover) {
        keyCooldownUntil.set(idx, Date.now() + COOLDOWN_MS);
      }

      const hasMoreKeys = i < orderedIndices.length - 1;
      if (shouldFailover && hasMoreKeys) {
        // Brief pause before failing over to next key slot
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}
