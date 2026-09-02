import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useVault } from "../../src/hooks/useVault";
import { useVaultRead } from "../../src/hooks/useVaultRead";
import { SealErrorCode } from "../../src/errors";
import { jsonResponse, makeWrapper, mockFetch, deferred } from "../testUtils";
import type { VerifiableCredential } from "../../src/types";

const credential: VerifiableCredential = {
  id: "vc-1",
  vaultId: "vault-1",
  subject: "did:example:123",
  claims: { name: "Ada" },
  issuer: "did:example:issuer",
  issuedAt: "2026-01-01T00:00:00.000Z",
  status: "valid",
};

function issueCredentialFetch() {
  return mockFetch(async (url) => {
    const u = String(url);
    if (u.endsWith("/vaults/vault-1/credentials/prepare")) {
      return jsonResponse(200, { xdr: "unsigned-xdr", network: "Test SDF Network" });
    }
    if (u.endsWith("/vaults/vault-1/credentials/submit")) {
      return jsonResponse(200, credential);
    }
    throw new Error(`unexpected request: ${u}`);
  });
}

describe("useVault", () => {
  it("runs the full preparing -> signing -> submitting -> done sequence on success", async () => {
    const fetchMock = issueCredentialFetch();
    const signTransaction = vi.fn(async (xdr: string) => `signed:${xdr}`);
    const wrapper = makeWrapper({ fetch: fetchMock, signTransaction });

    const { result } = renderHook(() => useVault("vault-1"), { wrapper });
    expect(result.current.status).toBe("idle");

    let returned: VerifiableCredential | undefined;
    await act(async () => {
      returned = await result.current.issueCredential({ subject: "did:example:123", claims: { name: "Ada" } });
    });

    expect(returned).toEqual(credential);
    expect(result.current.status).toBe("done");
    expect(result.current.error).toBeNull();
    expect(signTransaction).toHaveBeenCalledWith("unsigned-xdr");
  });

  it("rejects with MISSING_SIGN_TRANSACTION when ActaConfig has no signTransaction", async () => {
    const fetchMock = issueCredentialFetch();
    const wrapper = makeWrapper({ fetch: fetchMock });
    const { result } = renderHook(() => useVault("vault-1"), { wrapper });

    await act(async () => {
      await expect(result.current.issueCredential({ subject: "s", claims: {} })).rejects.toMatchObject({
        code: SealErrorCode.MISSING_SIGN_TRANSACTION,
      });
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error?.code).toBe(SealErrorCode.MISSING_SIGN_TRANSACTION);
    // Never reached the network — prepare's endpoint was never called.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects with SIGNING_REJECTED when signTransaction throws", async () => {
    const fetchMock = issueCredentialFetch();
    const signTransaction = vi.fn(async () => {
      throw new Error("user rejected");
    });
    const wrapper = makeWrapper({ fetch: fetchMock, signTransaction });
    const { result } = renderHook(() => useVault("vault-1"), { wrapper });

    await act(async () => {
      await expect(result.current.issueCredential({ subject: "s", claims: {} })).rejects.toMatchObject({
        code: SealErrorCode.SIGNING_REJECTED,
      });
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error?.code).toBe(SealErrorCode.SIGNING_REJECTED);
  });

  it("rejects with MISSING_VAULT_ID when no vaultId is available", async () => {
    const fetchMock = issueCredentialFetch();
    const signTransaction = vi.fn(async (xdr: string) => xdr);
    const wrapper = makeWrapper({ fetch: fetchMock, signTransaction });
    const { result } = renderHook(() => useVault(), { wrapper });

    await act(async () => {
      await expect(result.current.issueCredential({ subject: "s", claims: {} })).rejects.toMatchObject({
        code: SealErrorCode.MISSING_VAULT_ID,
      });
    });

    expect(result.current.status).toBe("error");
  });

  it("issueCredential's input.vaultId overrides the hook-level vaultId", async () => {
    const fetchMock = mockFetch(async (url) => {
      const u = String(url);
      if (u.endsWith("/vaults/other-vault/credentials/prepare")) return jsonResponse(200, { xdr: "x", network: "n" });
      if (u.endsWith("/vaults/other-vault/credentials/submit")) return jsonResponse(200, { ...credential, vaultId: "other-vault" });
      throw new Error(`unexpected request: ${u}`);
    });
    const signTransaction = vi.fn(async (xdr: string) => xdr);
    const wrapper = makeWrapper({ fetch: fetchMock, signTransaction });
    const { result } = renderHook(() => useVault("vault-1"), { wrapper });

    await act(async () => {
      await result.current.issueCredential({ subject: "s", claims: {}, vaultId: "other-vault" });
    });

    expect(result.current.status).toBe("done");
  });

  it("reset() clears status and error back to idle", async () => {
    const fetchMock = issueCredentialFetch();
    const wrapper = makeWrapper({ fetch: fetchMock });
    const { result } = renderHook(() => useVault("vault-1"), { wrapper });

    await act(async () => {
      await result.current.issueCredential({ subject: "s", claims: {} }).catch(() => {});
    });
    expect(result.current.status).toBe("error");

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("does not update state after unmount (in-flight request aborted)", async () => {
    const pending = deferred<Response>();
    const fetchMock = mockFetch(async (url) => {
      const u = String(url);
      if (u.endsWith("/vaults/vault-1/credentials/prepare")) return pending.promise;
      throw new Error(`unexpected request: ${u}`);
    });
    const signTransaction = vi.fn(async (xdr: string) => xdr);
    const wrapper = makeWrapper({ fetch: fetchMock, signTransaction });
    const { result, unmount } = renderHook(() => useVault("vault-1"), { wrapper });

    let actionPromise!: Promise<unknown>;
    act(() => {
      actionPromise = result.current.issueCredential({ subject: "s", claims: {} }).catch(() => {});
    });

    unmount();
    pending.resolve(jsonResponse(200, { xdr: "x", network: "n" }));
    await actionPromise;

    // No assertion on result.current after unmount (React discourages it); the
    // absence of an "act() outside test" / state-update warning is the point.
  });

  it("invalidates useVaultRead for the written vault after issueCredential succeeds", async () => {
    let listCallCount = 0;
    const fetchMock = mockFetch(async (url) => {
      const u = String(url);
      if (u.endsWith("/vaults/vault-1/credentials/prepare")) return jsonResponse(200, { xdr: "x", network: "n" });
      if (u.endsWith("/vaults/vault-1/credentials/submit")) return jsonResponse(200, credential);
      if (u.includes("/vaults/vault-1/credentials")) {
        listCallCount += 1;
        return jsonResponse(200, { credentials: listCallCount === 1 ? [] : [credential], nextCursor: null });
      }
      throw new Error(`unexpected request: ${u}`);
    });
    const signTransaction = vi.fn(async (xdr: string) => xdr);
    const wrapper = makeWrapper({ fetch: fetchMock, signTransaction });

    const { result } = renderHook(
      () => ({ vault: useVault("vault-1"), read: useVaultRead("vault-1") }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.read.isLoading).toBe(false));
    expect(result.current.read.credentials).toEqual([]);

    await act(async () => {
      await result.current.vault.issueCredential({ subject: "s", claims: {} });
    });

    await waitFor(() => expect(result.current.read.credentials).toEqual([credential]));
  });
});
