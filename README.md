# Seal

React SDK to interact with the ACTA API and manage verifiable credentials on the Stellar blockchain.

Seal is non-custodial: it never touches a private key. Every write goes
through a prepare → sign → submit flow — the ACTA API hands back an
unsigned transaction (XDR), your app signs it with whatever wallet it
already uses (Freighter, Stellar Wallets Kit, etc.), and Seal submits the
signed result.

## Quick Start

```bash
npm i @acta-team/seal
```

```tsx
import { ActaConfig, mainNet, useVault } from "@acta-team/seal";
import { signTransaction } from "./my-wallet-integration"; // your wallet of choice

// Configure API key in .env: ACTA_API_KEY_MAINNET=your-api-key
// (or pass apiKey explicitly — see "Configuration" below)
function App() {
  return (
    <ActaConfig baseURL={mainNet} signTransaction={signTransaction}>
      <IssueButton />
    </ActaConfig>
  );
}

function IssueButton() {
  const { issueCredential, status, error } = useVault("vault-id");

  return (
    <button
      disabled={status === "preparing" || status === "signing" || status === "submitting"}
      onClick={() => issueCredential({ subject: "did:example:123", claims: { name: "Ada" } })}
    >
      {status === "idle" || status === "done" || status === "error" ? "Issue credential" : status}
      {error ? ` (${error.code})` : null}
    </button>
  );
}
```

## Configuration

`<ActaConfig>` wraps your app once and configures every hook beneath it:

```tsx
<ActaConfig
  baseURL={mainNet} // or testNet, or a custom ACTA API URL
  apiKey="..." // optional — falls back to ACTA_API_KEY_MAINNET / ACTA_API_KEY_TESTNET
  signTransaction={async (xdr) => await myWallet.sign(xdr)} // required for useVault writes
  fetch={customFetch} // optional — override for SSR/testing/custom transport
>
  <App />
</ActaConfig>
```

- **`signTransaction`** is the seam that keeps Seal non-custodial. Wire in
  your own wallet integration here — Seal never imports a wallet library
  and never sees a private key. It's required by any `useVault` write
  action; read hooks (`useVaultRead`, `useCredential`) don't need it.
- **`apiKey`** falls back to `ACTA_API_KEY_MAINNET` / `ACTA_API_KEY_TESTNET`
  (matched against `baseURL`) when `process.env` is populated at runtime.
  This is most reliable in Node/SSR contexts; in a browser bundle, prefer
  passing `apiKey` explicitly since bundlers that statically replace
  `process.env.FOO` won't see this dynamic lookup.

## Hooks

### `useVault(vaultId?)` — write access

```tsx
const {
  status, // "idle" | "preparing" | "signing" | "submitting" | "done" | "error"
  error, // SealError | null
  issueCredential, // (input: IssueCredentialInput) => Promise<VerifiableCredential>
  revokeCredential, // (vcId: string) => Promise<VerifiableCredential>
  deployVault, // () => Promise<VaultDeployResult>
  allowIssuer, // (issuer: string) => Promise<IssuerAccessResult>
  denyIssuer, // (issuer: string) => Promise<IssuerAccessResult>
  reset, // () => void — clears status/error after a completed or failed action
} = useVault(vaultId);
```

`issueCredential`, `allowIssuer`, and `denyIssuer` operate on the `vaultId`
passed to `useVault`; `issueCredential`'s input can also carry its own
`vaultId` to target a different vault from the same hook instance.
`deployVault` needs no vault id — it creates one. Every action is
cancel-safe: state updates are skipped after unmount, and in-flight
requests are aborted on unmount.

### `useVaultRead(vaultId, { search?, pageSize? })` — read a vault's credentials

```tsx
const { credentials, isLoading, isLoadingMore, hasMore, error, refetch, loadMore } = useVaultRead(vaultId, {
  search: "ada",
  pageSize: 20,
});
```

Fetches page one on mount and whenever `vaultId`/`search`/`pageSize`
change. Automatically refetches (from page one) when a `useVault` write
invalidates this vault — no manual `refetch()` needed after issuing or
revoking a credential in the same vault.

Call `loadMore()` to fetch and append the next page — `hasMore` tells you
whether one exists, and `isLoadingMore` reflects that fetch in flight
(`isLoading` only covers the initial/refetch load). `loadMore()` is a
no-op once `hasMore` is `false`.

### `useCredential(id)` — read a single credential

```tsx
const { credential, isValid, isRevoked, isLoading, error, refetch } = useCredential(id);
```

`isValid`/`isRevoked` are derived from the fetched record. Multiple
components mounting `useCredential(id)` for the same id share one
in-flight request and a short-lived cache entry — no duplicate network
calls.

## Handling writes (prepare/sign/submit)

Every `useVault` action runs the same three-step flow, and `status`
reflects exactly where it is:

1. **`preparing`** — Seal asks the ACTA API for an unsigned transaction (XDR).
2. **`signing`** — Seal calls your `signTransaction(xdr)` callback. This is
   a user-interactive step (a wallet popup, biometric prompt, etc.) — your
   UI should reflect it.
3. **`submitting`** — Seal submits the signed XDR back to the ACTA API.
4. **`done`** / **`error`** — the action settled.

```tsx
const { issueCredential, status, error, reset } = useVault(vaultId);

async function handleIssue() {
  try {
    const credential = await issueCredential({ subject, claims });
    // credential is available immediately; useVaultRead for this vault
    // has already been invalidated and will refetch on its own.
  } catch (err) {
    // err is also available as `error` after the state update settles
  }
}
```

If `signTransaction` isn't configured, or the user rejects the signing
prompt, or the API rejects the submission, the action rejects with a
`SealError` and `status` becomes `"error"`. Call `reset()` to clear
`status`/`error` once you're done showing the failure.

## Errors

Every hook surfaces a typed `SealError` (never a raw `Error`):

```tsx
import { SealError, SealErrorCode } from "@acta-team/seal";

try {
  await issueCredential(input);
} catch (err) {
  if (err instanceof SealError) {
    if (err.code === SealErrorCode.SIGNING_REJECTED) {
      // user declined in their wallet
    }
    console.error(err.code, err.httpStatus, err.message);
  }
}
```

`err.code` mirrors the ACTA API's `code` field for API-level failures, or
one of `SealErrorCode`'s SDK-raised codes (`SIGNING_REJECTED`,
`MISSING_SIGN_TRANSACTION`, `MISSING_VAULT_ID`, `NETWORK_ERROR`,
`UNKNOWN_ERROR`) for everything else.

## Documentation

📖 [Full Documentation →](https://docs.acta.build)

## Layout

```
seal-credentials/
├── src/
│   ├── config/       # ActaConfig provider, mainNet/testNet baseURL constants
│   ├── hooks/        # useVault, useVaultRead, useCredential
│   ├── transport/     # internal HTTP client, prepare/sign/submit flow, cache (not exported)
│   ├── errors.ts     # SealError
│   ├── types.ts      # public types
│   └── index.ts      # public entry point
└── docs/             # local notes; canonical docs live at docs.acta.build
```

See [docs/remaining-work.md](./docs/remaining-work.md) for what's
intentionally out of scope for this pass.

## Local development

```bash
npm install
npm run build
npm run lint
npm run typecheck
npm test
```

## License

MIT License – see the [LICENSE](./LICENSE) file for details.
