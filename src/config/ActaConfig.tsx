import { useMemo } from "react";
import type { ActaConfigProps } from "../types";
import { ActaContext, type ActaContextValue } from "./context";
import { resolveApiKey } from "./networks";

/**
 * Wraps your app once and configures every Seal hook beneath it.
 *
 * @example
 * <ActaConfig baseURL={mainNet} signTransaction={signTransaction}>
 *   <App />
 * </ActaConfig>
 */
export function ActaConfig({ baseURL, apiKey, signTransaction, fetch, children }: ActaConfigProps) {
  const value = useMemo<ActaContextValue>(
    () => ({
      baseURL,
      apiKey: resolveApiKey(baseURL, apiKey),
      signTransaction,
      fetch,
    }),
    [baseURL, apiKey, signTransaction, fetch],
  );

  return <ActaContext.Provider value={value}>{children}</ActaContext.Provider>;
}
