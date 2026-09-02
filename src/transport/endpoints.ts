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

export interface ListVaultCredentialsParams {
  search?: string;
  /** Max credentials per page. Falls back to the API's own default when omitted. */
  pageSize?: number;
  /** Opaque cursor from a previous page's `nextCursor`. Omit to fetch the first page. */
  cursor?: string;
}

export interface CredentialPage {
  credentials: VerifiableCredential[];
  /** Opaque cursor for the next page, or `null` when this is the last page. */
  nextCursor: string | null;
}

export const listVaultCredentials = (
  ctx: ActaContextValue,
  vaultId: string,
  params: ListVaultCredentialsParams = {},
  signal?: AbortSignal,
) => {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.pageSize !== undefined) query.set("pageSize", String(params.pageSize));
  if (params.cursor !== undefined) query.set("cursor", params.cursor);
  const qs = query.toString();
  return request<CredentialPage>(ctx, `/vaults/${encodeURIComponent(vaultId)}/credentials${qs ? `?${qs}` : ""}`, { signal });
};

export const getCredential = (ctx: ActaContextValue, id: string, signal?: AbortSignal) =>
  request<VerifiableCredential>(ctx, `/credentials/${encodeURIComponent(id)}`, { signal });
