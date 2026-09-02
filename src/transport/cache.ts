import type { ActaContextValue } from "../config/context";
import { getCredential } from "./endpoints";
import type { VerifiableCredential } from "../types";

// --- vault invalidation: lets useVaultRead refetch after a useVault write ---

const vaultSubscribers = new Map<string, Set<() => void>>();

export function subscribeVault(vaultId: string, listener: () => void): () => void {
  let set = vaultSubscribers.get(vaultId);
  if (!set) {
    set = new Set();
    vaultSubscribers.set(vaultId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) vaultSubscribers.delete(vaultId);
  };
}

export function invalidateVault(vaultId: string): void {
  vaultSubscribers.get(vaultId)?.forEach((listener) => listener());
}

// --- credential cache: dedupes concurrent useCredential(id) mounts, short TTL ---

const CREDENTIAL_TTL_MS = 2000;

interface CredentialCacheEntry {
  promise: Promise<VerifiableCredential>;
  expiresAt: number;
}

const credentialCache = new Map<string, CredentialCacheEntry>();

function credentialCacheKey(ctx: ActaContextValue, id: string): string {
  return `${ctx.baseURL}::${id}`;
}

export function getOrFetchCredential(
  ctx: ActaContextValue,
  id: string,
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<VerifiableCredential> {
  const key = credentialCacheKey(ctx, id);
  const cached = credentialCache.get(key);
  const isFresh = cached && cached.expiresAt > Date.now();

  if (!options.force && isFresh) return cached.promise;

  const promise = getCredential(ctx, id, options.signal);
  credentialCache.set(key, { promise, expiresAt: Date.now() + CREDENTIAL_TTL_MS });

  // Don't cache a rejection — the next mount/refetch should retry, not replay the failure.
  promise.catch(() => {
    if (credentialCache.get(key)?.promise === promise) credentialCache.delete(key);
  });

  return promise;
}
