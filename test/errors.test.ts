import { describe, expect, it } from "vitest";
import { SealError, SealErrorCode } from "../src/errors";

describe("SealError", () => {
  it("carries code, message, httpStatus, requestId, and details", () => {
    const err = new SealError({
      code: SealErrorCode.NETWORK_ERROR,
      message: "boom",
      httpStatus: 503,
      requestId: "req-1",
      details: { foo: "bar" },
    });

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SealError");
    expect(err.code).toBe("NETWORK_ERROR");
    expect(err.message).toBe("boom");
    expect(err.httpStatus).toBe(503);
    expect(err.requestId).toBe("req-1");
    expect(err.details).toEqual({ foo: "bar" });
  });

  it("accepts an arbitrary API error code, not just SealErrorCode", () => {
    const err = new SealError({ code: "vault_not_found", message: "no such vault" });
    expect(err.code).toBe("vault_not_found");
  });

  it("attaches the original cause when provided", () => {
    const cause = new Error("root cause");
    const err = new SealError({ code: SealErrorCode.UNKNOWN_ERROR, message: "wrapped", cause });
    expect((err as { cause?: unknown }).cause).toBe(cause);
  });

  it("leaves optional fields undefined when omitted", () => {
    const err = new SealError({ code: SealErrorCode.MISSING_VAULT_ID, message: "no vault" });
    expect(err.httpStatus).toBeUndefined();
    expect(err.requestId).toBeUndefined();
  });
});
