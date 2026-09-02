import type { ActaContextValue } from "../config/context";
import { request } from "./client";
import type { IssueCredentialInput, IssuerAccessResult, VaultDeployResult, VerifiableCredential } from "../types";

export interface TxPrepareResponse {
  xdr: string;
  network: string;
}

const json = <T>(ctx: ActaContextValue, path: string, body: unknown, signal?: AbortSignal) =>
  request<T>(ctx, path, { method: "POST", body, signal });

// --- deployVault ---

export const prepareDeployVault = (ctx: ActaContextValue, signal?: AbortSignal) =>
  json<TxPrepareResponse>(ctx, "/vaults/prepare", {}, signal);

export const submitDeployVault = (ctx: ActaContextValue, signedXdr: string, signal?: AbortSignal) =>
  json<VaultDeployResult>(ctx, "/vaults/submit", { signedXdr }, signal);

// --- allow / deny issuer ---

export const prepareIssuerAccess = (
  ctx: ActaContextValue,
  vaultId: string,
  action: "allow" | "deny",
  issuer: string,
  signal?: AbortSignal,
) => json<TxPrepareResponse>(ctx, `/vaults/${encodeURIComponent(vaultId)}/issuers/${action}/prepare`, { issuer }, signal);

export const submitIssuerAccess = (
  ctx: ActaContextValue,
  vaultId: string,
  action: "allow" | "deny",
  signedXdr: string,
  signal?: AbortSignal,
) => json<IssuerAccessResult>(ctx, `/vaults/${encodeURIComponent(vaultId)}/issuers/${action}/submit`, { signedXdr }, signal);

// --- issueCredential ---

export const prepareIssueCredential = (
  ctx: ActaContextValue,
  vaultId: string,
  input: Pick<IssueCredentialInput, "subject" | "claims">,
  signal?: AbortSignal,
) => json<TxPrepareResponse>(ctx, `/vaults/${encodeURIComponent(vaultId)}/credentials/prepare`, input, signal);

export const submitIssueCredential = (ctx: ActaContextValue, vaultId: string, signedXdr: string, signal?: AbortSignal) =>
  json<VerifiableCredential>(ctx, `/vaults/${encodeURIComponent(vaultId)}/credentials/submit`, { signedXdr }, signal);

// --- revokeCredential ---

export const prepareRevokeCredential = (ctx: ActaContextValue, vaultId: string, vcId: string, signal?: AbortSignal) =>
  json<TxPrepareResponse>(
    ctx,
    `/vaults/${encodeURIComponent(vaultId)}/credentials/${encodeURIComponent(vcId)}/revoke/prepare`,
    {},
    signal,
  );

export const submitRevokeCredential = (
  ctx: ActaContextValue,
  vaultId: string,
  vcId: string,
  signedXdr: string,
  signal?: AbortSignal,
) =>
  json<VerifiableCredential>(
    ctx,
    `/vaults/${encodeURIComponent(vaultId)}/credentials/${encodeURIComponent(vcId)}/revoke/submit`,
    { signedXdr },
    signal,
  );

// --- reads ---

export const listVaultCredentials = (ctx: ActaContextValue, vaultId: string, search: string | undefined, signal?: AbortSignal) => {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return request<VerifiableCredential[]>(ctx, `/vaults/${encodeURIComponent(vaultId)}/credentials${query}`, { signal });
};

export const getCredential = (ctx: ActaContextValue, id: string, signal?: AbortSignal) =>
  request<VerifiableCredential>(ctx, `/credentials/${encodeURIComponent(id)}`, { signal });
