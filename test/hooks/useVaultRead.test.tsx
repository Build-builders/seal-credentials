import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useVaultRead } from "../../src/hooks/useVaultRead";
import { invalidateVault } from "../../src/transport/cache";
import { jsonResponse, makeWrapper, mockFetch, deferred } from "../testUtils";
import type { VerifiableCredential } from "../../src/types";

function vc(id: string): VerifiableCredential {
  return {
    id,
    vaultId: "vault-1",
    subject: "did:example:123",
    claims: {},
    issuer: "did:example:issuer",
    issuedAt: "2026-01-01T00:00:00.000Z",
    status: "valid",
  };
}

describe("useVaultRead", () => {
  it("fetches on mount", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, [vc("a")]));
    const wrapper = makeWrapper({ fetch: fetchMock });
    const { result } = renderHook(() => useVaultRead("vault-1"), { wrapper });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.credentials).toEqual([vc("a")]);
    expect(result.current.error).toBeNull();
  });

  it("passes `search` as a query param and refetches when it changes", async () => {
    const fetchMock = mockFetch(async (url) => {
      const u = new URL(String(url));
      const search = u.searchParams.get("search");
      return jsonResponse(200, search ? [vc(search)] : []);
    });
    const wrapper = makeWrapper({ fetch: fetchMock });
    const { result, rerender } = renderHook(({ search }: { search?: string }) => useVaultRead("vault-1", { search }), {
      wrapper,
      initialProps: { search: undefined as string | undefined },
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.credentials).toEqual([]);

    rerender({ search: "ada" });
    await waitFor(() => expect(result.current.credentials).toEqual([vc("ada")]));
  });

  it("refetches when a useVault write invalidates this vault", async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount += 1;
      return jsonResponse(200, callCount === 1 ? [] : [vc("a")]);
    });
    const wrapper = makeWrapper({ fetch: fetchMock });
    const { result } = renderHook(() => useVaultRead("vault-1"), { wrapper });

    await waitFor(() => expect(result.current.credentials).toEqual([]));

    act(() => {
      invalidateVault("vault-1");
    });

    await waitFor(() => expect(result.current.credentials).toEqual([vc("a")]));
  });

  it("does not refetch for a different vault's invalidation", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, []));
    const wrapper = makeWrapper({ fetch: fetchMock });
    renderHook(() => useVaultRead("vault-1"), { wrapper });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => {
      invalidateVault("some-other-vault");
    });
    // give any accidental async refetch a chance to fire
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a stale in-flight request superseded by a newer one", async () => {
    const first = deferred<Response>();
    const calls: string[] = [];
    const fetchMock = mockFetch(async (url) => {
      const search = new URL(String(url)).searchParams.get("search") ?? "";
      calls.push(search);
      if (search === "a") return first.promise;
      return jsonResponse(200, [vc("b-result")]);
    });
    const wrapper = makeWrapper({ fetch: fetchMock });
    const { result, rerender } = renderHook(({ search }: { search: string }) => useVaultRead("vault-1", { search }), {
      wrapper,
      initialProps: { search: "a" },
    });

    rerender({ search: "b" });
    await waitFor(() => expect(result.current.credentials).toEqual([vc("b-result")]));

    // The stale "a" request resolving afterward must not clobber the newer result.
    first.resolve(jsonResponse(200, [vc("a-result")]));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.credentials).toEqual([vc("b-result")]);
  });

  it("refetch() re-runs the fetch on demand", async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount += 1;
      return jsonResponse(200, callCount === 1 ? [] : [vc("a")]);
    });
    const wrapper = makeWrapper({ fetch: fetchMock });
    const { result } = renderHook(() => useVaultRead("vault-1"), { wrapper });

    await waitFor(() => expect(result.current.credentials).toEqual([]));

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.credentials).toEqual([vc("a")]));
  });

  it("surfaces a fetch failure as a SealError", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(500, { error: "boom", message: "server exploded" }));
    const wrapper = makeWrapper({ fetch: fetchMock });
    const { result } = renderHook(() => useVaultRead("vault-1"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error?.code).toBe("boom");
    expect(result.current.credentials).toEqual([]);
  });
});
