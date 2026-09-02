import { useCallback, useEffect, useRef, useState } from "react";
import { useActaConfigContext } from "../config/context";
import { SealError, SealErrorCode } from "../errors";
import { subscribeVault } from "../transport/cache";
import { isAbortError } from "../transport/client";
import { listVaultCredentials } from "../transport/endpoints";
import type { VerifiableCredential } from "../types";

function toSealError(err: unknown): SealError {
  if (err instanceof SealError) return err;
  return new SealError({
    code: SealErrorCode.UNKNOWN_ERROR,
    message: err instanceof Error ? err.message : "An unknown error occurred.",
    cause: err,
  });
}

export interface UseVaultReadOptions {
  search?: string;
  /** Max credentials per page, used by both the initial fetch and `loadMore()`. Falls back to the API's own default when omitted. */
  pageSize?: number;
}

export interface UseVaultReadResult {
  credentials: VerifiableCredential[];
  isLoading: boolean;
  /** True while a `loadMore()` page fetch is in flight. */
  isLoadingMore: boolean;
  error: SealError | null;
  /** True when another page is available via `loadMore()`. */
  hasMore: boolean;
  refetch: () => void;
  /** Fetches and appends the next page. No-op if `hasMore` is false. */
  loadMore: () => void;
}

interface State {
  credentials: VerifiableCredential[];
  cursor: string | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: SealError | null;
}

const INITIAL_STATE: State = { credentials: [], cursor: null, isLoading: true, isLoadingMore: false, error: null };

/** Reads a vault's credentials, one page at a time. Fetches page one on mount, on `vaultId`/`search`/`pageSize` change, and whenever a `useVault` write invalidates this vault. */
export function useVaultRead(vaultId: string, options: UseVaultReadOptions = {}): UseVaultReadResult {
  const ctx = useActaConfigContext("useVaultRead");
  const { search, pageSize } = options;
  const [state, setState] = useState<State>(INITIAL_STATE);
  const mountedRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);
  // Bumped by every replace fetch so a stale loadMore response (from a superseded page-1 generation) can't apply.
  const generationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchCredentials = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const generation = ++generationRef.current;
    setState({ ...INITIAL_STATE, isLoading: true });

    listVaultCredentials(ctx, vaultId, { search, pageSize }, controller.signal).then(
      (page) => {
        if (!mountedRef.current || controller.signal.aborted || generation !== generationRef.current) return;
        setState({ credentials: page.credentials, cursor: page.nextCursor, isLoading: false, isLoadingMore: false, error: null });
      },
      (err) => {
        if (!mountedRef.current || controller.signal.aborted || isAbortError(err) || generation !== generationRef.current) return;
        setState({ credentials: [], cursor: null, isLoading: false, isLoadingMore: false, error: toSealError(err) });
      },
    );
  }, [ctx, vaultId, search, pageSize]);

  useEffect(() => {
    fetchCredentials();
    return () => controllerRef.current?.abort();
  }, [fetchCredentials]);

  useEffect(() => subscribeVault(vaultId, fetchCredentials), [vaultId, fetchCredentials]);

  const loadMore = useCallback(() => {
    if (state.cursor === null || state.isLoading) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const generation = generationRef.current;
    const cursor = state.cursor;
    setState((s) => ({ ...s, isLoadingMore: true, error: null }));

    listVaultCredentials(ctx, vaultId, { search, pageSize, cursor }, controller.signal).then(
      (page) => {
        if (!mountedRef.current || controller.signal.aborted || generation !== generationRef.current) return;
        setState((s) => ({
          ...s,
          credentials: [...s.credentials, ...page.credentials],
          cursor: page.nextCursor,
          isLoadingMore: false,
        }));
      },
      (err) => {
        if (!mountedRef.current || controller.signal.aborted || isAbortError(err) || generation !== generationRef.current) return;
        setState((s) => ({ ...s, isLoadingMore: false, error: toSealError(err) }));
      },
    );
  }, [ctx, vaultId, search, pageSize, state.cursor, state.isLoading]);

  return {
    credentials: state.credentials,
    isLoading: state.isLoading,
    isLoadingMore: state.isLoadingMore,
    error: state.error,
    hasMore: state.cursor !== null,
    refetch: fetchCredentials,
    loadMore,
  };
}
