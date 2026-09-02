export const mainNet = "https://production-api.acta.build";
export const testNet = "https://sandbox-api.acta.build";

/**
 * Resolves the API key to use for a given `baseURL`.
 *
 * An explicit `apiKey` always wins. Otherwise falls back to
 * `ACTA_API_KEY_MAINNET` / `ACTA_API_KEY_TESTNET` (matched by whether
 * `baseURL` equals {@link mainNet} / {@link testNet}), read from
 * `process.env` when available (most reliable in Node/SSR — in a browser
 * bundle, prefer passing `apiKey` explicitly).
 *
 * Returns `undefined` when nothing resolves — Seal never throws for a
 * missing key. The API rejects the unauthenticated request with a normal
 * `401`, which surfaces as a regular API-level `SealError`.
 */
export function resolveApiKey(baseURL: string, apiKey?: string): string | undefined {
  if (apiKey) return apiKey;

  const env = typeof process !== "undefined" ? process.env : undefined;
  if (!env) return undefined;

  if (baseURL === mainNet) return env.ACTA_API_KEY_MAINNET || undefined;
  if (baseURL === testNet) return env.ACTA_API_KEY_TESTNET || undefined;
  return undefined;
}
