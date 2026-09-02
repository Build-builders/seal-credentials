import { useCallback, useEffect, useRef, useState } from "react";
import { useActaConfigContext } from "../config/context";
import { SealError, SealErrorCode } from "../errors";
import { getOrFetchCredential } from "../transport/cache";
import type { VerifiableCredential } from "../types";

function toSealError(err: unknown): SealError {
  if (err instanceof SealError) return err;
  return new SealError({
    code: SealErrorCode.UNKNOWN_ERROR,
    message: err instanceof Error ? err.message : "An unknown error occurred.",
    cause: err,
  });
}

export interface UseCredentialResult {
  credential: VerifiableCredential | null;
  isValid: boolean;
  isRevoked: boolean;
  isLoading: boolean;
  error: SealError | null;
  refetch: () => void;
}

/**
 * Reads a single credential by id. Multiple components mounting `useCredential(id)` for the
 * same id share one in-flight request and a short-lived cache entry — no duplicate network calls.
 */
export function useCredential(id: string): UseCredentialResult {
  const ctx = useActaConfigContext("useCredential");
  const [state, setState] = useState<{ credential: VerifiableCredential | null; isLoading: boolean; error: SealError | null }>({
    credential: null,
    isLoading: true,
    error: null,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    (options: { force?: boolean } = {}) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      getOrFetchCredential(ctx, id, options).then(
        (credential) => {
          if (!mountedRef.current) return;
          setState({ credential, isLoading: false, error: null });
        },
        (err) => {
          if (!mountedRef.current) return;
          setState({ credential: null, isLoading: false, error: toSealError(err) });
        },
      );
    },
    [ctx, id],
  );

  useEffect(() => {
    load();
  }, [load]);

  const refetch = useCallback(() => load({ force: true }), [load]);

  return {
    credential: state.credential,
    isValid: state.credential?.status === "valid",
    isRevoked: state.credential?.status === "revoked",
    isLoading: state.isLoading,
    error: state.error,
    refetch,
  };
}
