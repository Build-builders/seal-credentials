import type { ReactNode } from "react";

/** Signs an unsigned transaction (XDR) and returns the signed XDR. Never sees a private key inside Seal. */
export type SignTransaction = (xdr: string) => Promise<string>;

/** A `fetch`-compatible function, injectable for SSR/testing/custom transport. */
export type FetchLike = typeof fetch;

export interface ActaConfigProps {
  /** ACTA API base URL — `mainNet`, `testNet`, or a custom URL (staging, self-hosted, `http://localhost:...`). */
  baseURL: string;
  /** Falls back to `ACTA_API_KEY_MAINNET` / `ACTA_API_KEY_TESTNET` (matched against `baseURL`) when unset. */
  apiKey?: string;
  /** Required for any `useVault` write action. Read hooks don't need it. */
  signTransaction?: SignTransaction;
  /** Override the transport — SSR, testing, or a custom fetch implementation. */
  fetch?: FetchLike;
  children: ReactNode;
}

/** Status of a `useVault` write action. */
export type ActionStatus = "idle" | "preparing" | "signing" | "submitting" | "done" | "error";

export interface VerifiableCredential {
  id: string;
  vaultId: string;
  subject: string;
  claims: Record<string, unknown>;
  issuer: string;
  issuedAt: string;
  status: "valid" | "revoked";
  revokedAt?: string;
}

export interface IssueCredentialInput {
  subject: string;
  claims: Record<string, unknown>;
  /** Overrides the `vaultId` passed to `useVault`, targeting a different vault from the same hook instance. */
  vaultId?: string;
}

export interface VaultDeployResult {
  vaultId: string;
  txId: string;
}

export interface IssuerAccessResult {
  vaultId: string;
  issuer: string;
  allowed: boolean;
  txId: string;
}
