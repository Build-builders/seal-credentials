import type { ReactNode } from "react";
import { vi } from "vitest";
import { ActaConfig } from "../src/config/ActaConfig";
import type { SignTransaction } from "../src/types";

export function jsonResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  } as Response;
}

/** A `vi.fn()`-backed fetch mock, keyed on the request URL as a plain string. */
export function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init));
}

export interface WrapperOptions {
  baseURL?: string;
  apiKey?: string;
  fetch: typeof fetch;
  signTransaction?: SignTransaction;
}

export function makeWrapper({ baseURL = "https://api.example.com", apiKey, fetch, signTransaction }: WrapperOptions) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ActaConfig baseURL={baseURL} apiKey={apiKey} fetch={fetch} signTransaction={signTransaction}>
        {children}
      </ActaConfig>
    );
  };
}

/** Small delay to let a mocked async fetch stay in-flight across a couple of ticks. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
