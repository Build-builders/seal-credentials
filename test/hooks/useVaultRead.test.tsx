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

function page(credentials: VerifiableCredential[], nextCursor: string | null = null) {
  return jsonResponse(200, { credentials, nextCursor });
}

describe("useVaultRead", () => {
  it("fetches page one on mount", async () => {
    const fetchMock = vi.fn(async () => page([vc("a")]));
    const wrapper = makeWrapper({ fetch: fetchMock });
    const { result } = renderHook(() => useVaultRead("vault-1"), { wrapper });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.credentials).toEqual([vc("a")]);
    expect(result.current.error).toBeNull();
    expect(result.current.hasMore).toBe(false);
  });

  it("passes `search` as a query param and refetches when it changes", async () => {
    const fetchMock = mockFetch(async (url) => {
      const u = new URL(String(url));
      const search = u.searchParams.get("search");
      return page(search ? [vc(search)] : []);
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
      return page(callCount === 1 ? [] : [vc("a")]);
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
    const fetchMock = vi.fn(async () => page([]));
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
      return page([vc("b-result")]);
    });
    const wrapper = makeWrapper({ fetch: fetchMock });
    const { result, rerender } = renderHook(({ search }: { search: string }) => useVaultRead("vault-1", { search }), {
      wrapper,
      initialProps: { search: "a" },
    });

    rerender({ search: "b" });
    await waitFor(() => expect(result.current.credentials).toEqual([vc("b-result")]));

    // The stale "a" request resolving afterward must not clobber the newer result.
    first.resolve(page([vc("a-result")]));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.credentials).toEqual([vc("b-result")]);
  });

  it("refetch() re-runs the fetch on demand", async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount += 1;
      return page(callCount === 1 ? [] : [vc("a")]);
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

  it("exposes hasMore from nextCursor and loadMore() appends the next page", async () => {
    const fetchMock = mockFetch(async (url) => {
      const cursor = new URL(String(url)).searchParams.get("cursor");
      if (cursor === null) return page([vc("a")], "cursor-2");
      if (cursor === "cursor-2") return page([vc("b")], null);
      throw new Error(`unexpected cursor ${cursor}`);
    });
    const wrapper = makeWrapper({ fetch: fetchMock });
    const { result } = renderHook(() => useVaultRead("vault-1"), { wrapper });

    await waitFor(() => expect(result.current.credentials).toEqual([vc("a")]));
    expect(result.current.hasMore).toBe(true);

    act(() => {
      result.current.loadMore();
    });

    expect(result.current.isLoadingMore).toBe(true);
    await waitFor(() => expect(result.current.credentials).toEqual([vc("a"), vc("b")]));
    expect(result.current.isLoadingMore).toBe(false);
    expect(result.current.hasMore).toBe(false);
  });

  it("passes `pageSize` and the previous page's cursor as query params on loadMore()", async () => {
    const queries: Array<{ pageSize: string | null; cursor: string | null }> = [];
    const fetchMock = mockFetch(async (url) => {
      const u = new URL(String(url));
      queries.push({ pageSize: u.searchParams.get("pageSize"), cursor: u.searchParams.get("cursor") });
      return u.searchParams.get("cursor") === null ? page([vc("a")], "cursor-2") : page([vc("b")], null);
    });
    const wrapper = makeWrapper({ fetch: fetchMock });
    const { result } = renderHook(() => useVaultRead("vault-1", { pageSize: 5 }), { wrapper });

    await waitFor(() => expect(result.current.credentials).toEqual([vc("a")]));
    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.credentials).toEqual([vc("a"), vc("b")]));

    expect(queries).toEqual([
      { pageSize: "5", cursor: null },
      { pageSize: "5", cursor: "cursor-2" },
    ]);
  });

  it("loadMore() is a no-op once hasMore is false", async () => {
    const fetchMock = vi.fn(async () => page([vc("a")], null));
    const wrapper = makeWrapper({ fetch: fetchMock });
    const { result } = renderHook(() => useVaultRead("vault-1"), { wrapper });

    await waitFor(() => expect(result.current.hasMore).toBe(false));

    act(() => {
      result.current.loadMore();
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.credentials).toEqual([vc("a")]);
  });

  it("a full refetch resets accumulated pages and cancels an in-flight loadMore()", async () => {
    const loadMoreDeferred = deferred<Response>();
    let refetchCount = 0;
    const fetchMock = mockFetch(async (url) => {
      const cursor = new URL(String(url)).searchParams.get("cursor");
      if (cursor === "cursor-2") return loadMoreDeferred.promise;
      refetchCount += 1;
      return page([vc(`refetch-${refetchCount}`)], refetchCount === 1 ? "cursor-2" : null);
    });
    const wrapper = makeWrapper({ fetch: fetchMock });
    const { result } = renderHook(() => useVaultRead("vault-1"), { wrapper });

    await waitFor(() => expect(result.current.credentials).toEqual([vc("refetch-1")]));

    act(() => {
      result.current.loadMore();
    });
    expect(result.current.isLoadingMore).toBe(true);

    act(() => {
      result.current.refetch();
    });
    await waitFor(() => expect(result.current.credentials).toEqual([vc("refetch-2")]));
    expect(result.current.isLoadingMore).toBe(false);
    expect(result.current.hasMore).toBe(false);

    // The superseded loadMore() resolving afterward must not resurrect stale pages.
    loadMoreDeferred.resolve(page([vc("stale")], null));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.credentials).toEqual([vc("refetch-2")]);
  });
});
