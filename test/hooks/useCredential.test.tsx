import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCredential } from "../../src/hooks/useCredential";
import { jsonResponse, makeWrapper } from "../testUtils";
import type { VerifiableCredential } from "../../src/types";

// Each test uses its own credential id: the shared credential cache is keyed
// by (baseURL, id), and its TTL comfortably outlives a single test — reusing
// an id across tests would read a previous test's cached response.
function vc(id: string, overrides: Partial<VerifiableCredential> = {}): VerifiableCredential {
  return {
    id,
    vaultId: "vault-1",
    subject: "did:example:123",
    claims: { name: "Ada" },
    issuer: "did:example:issuer",
    issuedAt: "2026-01-01T00:00:00.000Z",
    status: "valid",
    ...overrides,
  };
}

describe("useCredential", () => {
  it("fetches the credential and derives isValid/isRevoked", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, vc("cred-valid", { status: "valid" })));
    const wrapper = makeWrapper({ fetch: fetchMock });
    const { result } = renderHook(() => useCredential("cred-valid"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.credential).toEqual(vc("cred-valid", { status: "valid" }));
    expect(result.current.isValid).toBe(true);
    expect(result.current.isRevoked).toBe(false);
  });

  it("derives isRevoked from a revoked credential", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, vc("cred-revoked", { status: "revoked", revokedAt: "2026-02-01T00:00:00.000Z" })));
    const wrapper = makeWrapper({ fetch: fetchMock });
    const { result } = renderHook(() => useCredential("cred-revoked"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isValid).toBe(false);
    expect(result.current.isRevoked).toBe(true);
  });

  it("shares one in-flight request across concurrent mounts for the same id", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, vc("cred-shared")));
    const wrapper = makeWrapper({ fetch: fetchMock });

    const { result } = renderHook(() => ({ a: useCredential("cred-shared"), b: useCredential("cred-shared") }), { wrapper });

    await waitFor(() => expect(result.current.a.isLoading).toBe(false));
    expect(result.current.b.isLoading).toBe(false);
    expect(result.current.a.credential).toEqual(vc("cred-shared"));
    expect(result.current.b.credential).toEqual(vc("cred-shared"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetch() bypasses the cache and hits the network again", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, vc("cred-refetch")));
    const wrapper = makeWrapper({ fetch: fetchMock });
    const { result } = renderHook(() => useCredential("cred-refetch"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refetch();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("surfaces a fetch failure as a SealError and leaves credential null", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(404, { error: "not_found", message: "no such credential" }));
    const wrapper = makeWrapper({ fetch: fetchMock });
    const { result } = renderHook(() => useCredential("cred-missing"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.credential).toBeNull();
    expect(result.current.error?.code).toBe("not_found");
    expect(result.current.isValid).toBe(false);
    expect(result.current.isRevoked).toBe(false);
  });
});
