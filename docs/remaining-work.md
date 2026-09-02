# Remaining work

Notes on what's intentionally out of scope for this pass. Canonical, always
up-to-date docs live at [docs.acta.build](https://docs.acta.build); this file
just tracks local scope decisions.

- **No low-level owner/contractId/`did:stellar`/smart-wallet control.** Seal
  is deliberately vaultId-scoped: `useVault(vaultId)` hides vault ownership,
  contract ids, issuer DIDs, and the G.../C... account-vs-smart-wallet
  distinction that the lower-level `@acta-team/credentials` package exposes.
  Reach for that package directly when an integration needs that control.
- **No pagination cursor on `useVaultRead`.** It supports a `search` filter
  only; a vault with a very large credential list has no cursor/page-size
  knob yet.
- **No offline queueing or automatic retry** of a failed prepare/sign/submit
  action — a rejected action is left for the caller to retry.
- **No websocket or live subscription** for credential status changes.
  `useVaultRead`/`useCredential` are refetch-on-demand (mount, dependency
  change, or a same-vault `useVault` write); they don't push updates caused
  by writes from outside the current app instance.
- **No SSR prefetch + hydrate helpers.** The `fetch` override on `ActaConfig`
  makes SSR-safe requests possible, but there's no bundled
  prefetch-on-server/hydrate-on-client utility yet.
- **No built-in wallet adapters** (Freighter, Stellar Wallets Kit, etc.) —
  by design. Seal never imports a wallet library; `signTransaction` is the
  seam every integration wires up itself, which is what keeps Seal
  non-custodial.
