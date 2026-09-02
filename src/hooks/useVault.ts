import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useActaConfigContext } from "../config/context";
import { SealError, SealErrorCode } from "../errors";
import { invalidateVault } from "../transport/cache";
import {
  prepareDeployVault,
  prepareIssueCredential,
  prepareIssuerAccess,
  prepareRevokeCredential,
  submitDeployVault,
  submitIssueCredential,
  submitIssuerAccess,
  submitRevokeCredential,
} from "../transport/endpoints";
import { runPrepareSignSubmit } from "../transport/prepareSignSubmit";
import type { ActionStatus, IssueCredentialInput, IssuerAccessResult, VaultDeployResult, VerifiableCredential } from "../types";

interface State {
  status: ActionStatus;
  error: SealError | null;
}

type Action =
  | { type: "phase"; phase: "preparing" | "signing" | "submitting" }
  | { type: "done" }
  | { type: "error"; error: SealError }
  | { type: "reset" };

const initialState: State = { status: "idle", error: null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "phase":
      return { status: action.phase, error: null };
    case "done":
      return { status: "done", error: null };
    case "error":
      return { status: "error", error: action.error };
    case "reset":
      return initialState;
  }
}

function requireVaultId(vaultId: string | undefined): string {
  if (!vaultId) {
    throw new SealError({
      code: SealErrorCode.MISSING_VAULT_ID,
      message: "This action needs a vaultId — pass one to useVault(vaultId) or in the action's input.",
    });
  }
  return vaultId;
}

function toSealError(err: unknown): SealError {
  if (err instanceof SealError) return err;
  return new SealError({
    code: SealErrorCode.UNKNOWN_ERROR,
    message: err instanceof Error ? err.message : "An unknown error occurred.",
    cause: err,
  });
}

export interface UseVaultResult {
  status: ActionStatus;
  error: SealError | null;
  issueCredential: (input: IssueCredentialInput) => Promise<VerifiableCredential>;
  revokeCredential: (vcId: string) => Promise<VerifiableCredential>;
  deployVault: () => Promise<VaultDeployResult>;
  allowIssuer: (issuer: string) => Promise<IssuerAccessResult>;
  denyIssuer: (issuer: string) => Promise<IssuerAccessResult>;
  reset: () => void;
}

/** Write access to a vault: issue/revoke credentials, deploy a vault, manage issuer access. Every action runs prepare -> sign -> submit. */
export function useVault(vaultId?: string): UseVaultResult {
  const ctx = useActaConfigContext("useVault");
  const [state, dispatch] = useReducer(reducer, initialState);
  const mountedRef = useRef(true);
  const controllersRef = useRef(new Set<AbortController>());

  useEffect(() => {
    mountedRef.current = true;
    const controllers = controllersRef.current;
    return () => {
      mountedRef.current = false;
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
    };
  }, []);

  const safeDispatch = useCallback((action: Action) => {
    if (mountedRef.current) dispatch(action);
  }, []);

  const runAction = useCallback(
    async <T,>(
      run: (
        signal: AbortSignal,
        onPhase: (phase: "preparing" | "signing" | "submitting") => void,
      ) => Promise<{ result: T; invalidateVaultId: string | null }>,
    ): Promise<T> => {
      const controller = new AbortController();
      controllersRef.current.add(controller);
      try {
        const { result, invalidateVaultId } = await run(controller.signal, (phase) => safeDispatch({ type: "phase", phase }));
        if (invalidateVaultId) invalidateVault(invalidateVaultId);
        safeDispatch({ type: "done" });
        return result;
      } catch (err) {
        const sealError = toSealError(err);
        safeDispatch({ type: "error", error: sealError });
        throw sealError;
      } finally {
        controllersRef.current.delete(controller);
      }
    },
    [safeDispatch],
  );

  const deployVault = useCallback(
    () =>
      runAction(async (signal, onPhase) => {
        const result = await runPrepareSignSubmit({
          signTransaction: ctx.signTransaction,
          prepare: () => prepareDeployVault(ctx, signal),
          submit: (signedXdr) => submitDeployVault(ctx, signedXdr, signal),
          onPhase,
        });
        return { result, invalidateVaultId: null };
      }),
    [ctx, runAction],
  );

  const issueCredential = useCallback(
    (input: IssueCredentialInput) =>
      runAction(async (signal, onPhase) => {
        const targetVaultId = requireVaultId(input.vaultId ?? vaultId);
        const result = await runPrepareSignSubmit({
          signTransaction: ctx.signTransaction,
          prepare: () => prepareIssueCredential(ctx, targetVaultId, { subject: input.subject, claims: input.claims }, signal),
          submit: (signedXdr) => submitIssueCredential(ctx, targetVaultId, signedXdr, signal),
          onPhase,
        });
        return { result, invalidateVaultId: targetVaultId };
      }),
    [ctx, runAction, vaultId],
  );

  const revokeCredential = useCallback(
    (vcId: string) =>
      runAction(async (signal, onPhase) => {
        const targetVaultId = requireVaultId(vaultId);
        const result = await runPrepareSignSubmit({
          signTransaction: ctx.signTransaction,
          prepare: () => prepareRevokeCredential(ctx, targetVaultId, vcId, signal),
          submit: (signedXdr) => submitRevokeCredential(ctx, targetVaultId, vcId, signedXdr, signal),
          onPhase,
        });
        return { result, invalidateVaultId: targetVaultId };
      }),
    [ctx, runAction, vaultId],
  );

  const setIssuerAccess = useCallback(
    (action: "allow" | "deny", issuer: string) =>
      runAction(async (signal, onPhase) => {
        const targetVaultId = requireVaultId(vaultId);
        const result = await runPrepareSignSubmit({
          signTransaction: ctx.signTransaction,
          prepare: () => prepareIssuerAccess(ctx, targetVaultId, action, issuer, signal),
          submit: (signedXdr) => submitIssuerAccess(ctx, targetVaultId, action, signedXdr, signal),
          onPhase,
        });
        return { result, invalidateVaultId: null };
      }),
    [ctx, runAction, vaultId],
  );

  const allowIssuer = useCallback((issuer: string) => setIssuerAccess("allow", issuer), [setIssuerAccess]);
  const denyIssuer = useCallback((issuer: string) => setIssuerAccess("deny", issuer), [setIssuerAccess]);

  const reset = useCallback(() => safeDispatch({ type: "reset" }), [safeDispatch]);

  return useMemo(
    () => ({
      status: state.status,
      error: state.error,
      issueCredential,
      revokeCredential,
      deployVault,
      allowIssuer,
      denyIssuer,
      reset,
    }),
    [state, issueCredential, revokeCredential, deployVault, allowIssuer, denyIssuer, reset],
  );
}
