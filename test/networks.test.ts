import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mainNet, testNet, resolveApiKey } from "../src/config/networks";

describe("networks", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.ACTA_API_KEY_MAINNET;
    delete process.env.ACTA_API_KEY_TESTNET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("exports the real ACTA mainnet/testnet base URLs", () => {
    expect(mainNet).toBe("https://production-api.acta.build");
    expect(testNet).toBe("https://sandbox-api.acta.build");
  });

  it("prefers an explicit apiKey over env vars", () => {
    process.env.ACTA_API_KEY_MAINNET = "env-key";
    expect(resolveApiKey(mainNet, "explicit-key")).toBe("explicit-key");
  });

  it("falls back to ACTA_API_KEY_MAINNET for mainNet", () => {
    process.env.ACTA_API_KEY_MAINNET = "main-env-key";
    expect(resolveApiKey(mainNet)).toBe("main-env-key");
  });

  it("falls back to ACTA_API_KEY_TESTNET for testNet", () => {
    process.env.ACTA_API_KEY_TESTNET = "test-env-key";
    expect(resolveApiKey(testNet)).toBe("test-env-key");
  });

  it("does not use the mainnet env var for testNet or vice versa", () => {
    process.env.ACTA_API_KEY_MAINNET = "main-env-key";
    expect(resolveApiKey(testNet)).toBeUndefined();
  });

  it("returns undefined, never throws, when nothing resolves", () => {
    expect(resolveApiKey(mainNet)).toBeUndefined();
    expect(resolveApiKey("https://custom.example.com")).toBeUndefined();
  });
});
