export { ActaConfig, mainNet, testNet } from "./config";
export { useVault, useVaultRead, useCredential } from "./hooks";
export type { UseVaultResult, UseVaultReadOptions, UseVaultReadResult, UseCredentialResult } from "./hooks";
export { SealError, SealErrorCode } from "./errors";
export type {
  ActaConfigProps,
  ActionStatus,
  FetchLike,
  IssueCredentialInput,
  IssuerAccessResult,
  SignTransaction,
  VaultDeployResult,
  VerifiableCredential,
} from "./types";
