import { describe, expect, it, vi } from "vitest";
import { request } from "../../src/transport/client";
import { SealError, SealErrorCode } from "../../src/errors";
import type { ActaContextValue } from "../../src/config/context";

function fakeResponse(init: { ok: boolean; status: number; statusText?: string; body?: string }): Response {
  return {
    ok: init.ok,
    status: init.status,
    statusText: init.statusText ?? "",
    text: async () => init.body ?? "",
  } as Response;
}

function makeCtx(fetchImpl: typeof fetch, overrides: Partial<ActaContextValue> = {}): ActaContextValue {
  return { baseURL: "https://api.example.com", fetch: fetchImpl, ...overrides };
}

describe("transport/client request()", () => {
  it("returns the parsed JSON body on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, status: 200, body: JSON.stringify({ hello: "world" }) }));
    const result = await request(makeCtx(fetchMock), "/thing");
    expect(result).toEqual({ hello: "world" });
  });

  it("sends the X-ACTA-Key header when apiKey is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, status: 200, body: "{}" }));
    await request(makeCtx(fetchMock, { apiKey: "secret-key" }), "/thing");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-ACTA-Key"]).toBe("secret-key");
  });

  it("omits the X-ACTA-Key header when apiKey is unset", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, status: 200, body: "{}" }));
    await request(makeCtx(fetchMock), "/thing");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-ACTA-Key"]).toBeUndefined();
  });

  it("maps a non-ok response's {error, message, request_id} onto a SealError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({
        ok: false,
        status: 404,
        body: JSON.stringify({ error: "vault_not_found", message: "No such vault", request_id: "req-42" }),
      }),
    );

    const err = await request(makeCtx(fetchMock), "/vaults/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SealError);
    const sealErr = err as SealError;
    expect(sealErr.code).toBe("vault_not_found");
    expect(sealErr.message).toBe("No such vault");
    expect(sealErr.httpStatus).toBe(404);
    expect(sealErr.requestId).toBe("req-42");
  });

  it("falls back to http_<status> when the error body has no `error` field", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 500, statusText: "Server Error", body: "" }));
    const err = (await request(makeCtx(fetchMock), "/x").catch((e: unknown) => e)) as SealError;
    expect(err.code).toBe("http_500");
    expect(err.message).toBe("Server Error");
  });

  it("maps a rejected fetch (network failure) onto NETWORK_ERROR", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const err = (await request(makeCtx(fetchMock), "/x").catch((e: unknown) => e)) as SealError;
    expect(err).toBeInstanceOf(SealError);
    expect(err.code).toBe(SealErrorCode.NETWORK_ERROR);
  });

  it("rethrows an AbortError unchanged, not wrapped as a SealError", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    const err = await request(makeCtx(fetchMock), "/x").catch((e: unknown) => e);
    expect(err).toBe(abortError);
  });

  it("maps an ok response whose body is not a JSON object onto UNKNOWN_ERROR", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, status: 200, body: "42" }));
    const err = (await request(makeCtx(fetchMock), "/x").catch((e: unknown) => e)) as SealError;
    expect(err).toBeInstanceOf(SealError);
    expect(err.code).toBe(SealErrorCode.UNKNOWN_ERROR);
  });

  it("returns undefined for an empty (e.g. 204) ok response body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, status: 204, body: "" }));
    const result = await request(makeCtx(fetchMock), "/x");
    expect(result).toBeUndefined();
  });
});
