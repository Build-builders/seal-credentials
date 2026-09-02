/** SDK-raised error codes. API-level failures instead carry the ACTA API's own `error` code. */
export const SealErrorCode = {
  SIGNING_REJECTED: "SIGNING_REJECTED",
  MISSING_SIGN_TRANSACTION: "MISSING_SIGN_TRANSACTION",
  MISSING_VAULT_ID: "MISSING_VAULT_ID",
  NETWORK_ERROR: "NETWORK_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type SealErrorCode = (typeof SealErrorCode)[keyof typeof SealErrorCode];

export interface SealErrorInput {
  code: string;
  message: string;
  httpStatus?: number;
  requestId?: string;
  details?: unknown;
  cause?: unknown;
}

/**
 * Every Seal hook rejects with a `SealError`, never a raw `Error`.
 *
 * `code` is either one of {@link SealErrorCode} (raised by the SDK itself,
 * before or around a request) or the ACTA API's own `error` field, passed
 * through verbatim for API-level failures.
 */
export class SealError extends Error {
  readonly code: string;
  readonly httpStatus?: number;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(input: SealErrorInput) {
    super(input.message);
    this.name = "SealError";
    this.code = input.code;
    if (input.httpStatus !== undefined) this.httpStatus = input.httpStatus;
    if (input.requestId !== undefined) this.requestId = input.requestId;
    this.details = input.details;
    if (input.cause !== undefined) (this as { cause?: unknown }).cause = input.cause;
  }
}
