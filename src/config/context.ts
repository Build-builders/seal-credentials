import { createContext, useContext } from "react";
import type { FetchLike, SignTransaction } from "../types";

export interface ActaContextValue {
  baseURL: string;
  apiKey?: string;
  signTransaction?: SignTransaction;
  fetch?: FetchLike;
}

export const ActaContext = createContext<ActaContextValue | null>(null);

/** Reads the `ActaConfig` context, throwing if the calling hook is mounted outside it. */
export function useActaConfigContext(hookName: string): ActaContextValue {
  const ctx = useContext(ActaContext);
  if (!ctx) throw new Error(`${hookName} must be used within <ActaConfig>`);
  return ctx;
}
