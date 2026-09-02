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
}

export interface UseVaultReadResult {
  credentials: VerifiableCredential[];
  isLoading: boolean;
  error: SealError | null;
  refetch: () => void;
}

/** Reads a vault's credentials. Fetches on mount, on `vaultId`/`search` change, and whenever a `useVault` write invalidates this vault. */
export function useVaultRead(vaultId: string, options: UseVaultReadOptions = {}): UseVaultReadResult {
  const ctx = useActaConfigContext("useVaultRead");
  const { search } = options;
  const [state, setState] = useState<{ credentials: VerifiableCredential[]; isLoading: boolean; error: SealError | null }>({
    credentials: [],
    isLoading: true,
    error: null,
  });
  const mountedRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);

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
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    listVaultCredentials(ctx, vaultId, search, controller.signal).then(
      (credentials) => {
        if (!mountedRef.current || controller.signal.aborted) return;
        setState({ credentials, isLoading: false, error: null });
      },
      (err) => {
        if (!mountedRef.current || controller.signal.aborted || isAbortError(err)) return;
        setState({ credentials: [], isLoading: false, error: toSealError(err) });
      },
    );
  }, [ctx, vaultId, search]);

  useEffect(() => {
    fetchCredentials();
    return () => controllerRef.current?.abort();
  }, [fetchCredentials]);

  useEffect(() => subscribeVault(vaultId, fetchCredentials), [vaultId, fetchCredentials]);

  return { credentials: state.credentials, isLoading: state.isLoading, error: state.error, refetch: fetchCredentials };
}
