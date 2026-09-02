import type { ActaContextValue } from "../config/context";
import { SealError, SealErrorCode } from "../errors";

interface ApiErrorBody {
  error?: string;
  message?: string;
  request_id?: string;
}

export interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
}

export function isAbortError(err: unknown): boolean {
  // DOMException (the real shape an aborted fetch rejects with) doesn't extend Error in every engine.
  return typeof err === "object" && err !== null && "name" in err && (err as { name?: unknown }).name === "AbortError";
}

/** Low-level ACTA API request. Maps every failure onto a `SealError`; never throws a raw `Error` (aborts pass through unchanged). */
export async function request<T>(ctx: ActaContextValue, path: string, options: RequestOptions = {}): Promise<T> {
  const fetchImpl = ctx.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = {};
  if (ctx.apiKey) headers["X-ACTA-Key"] = ctx.apiKey;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetchImpl(`${ctx.baseURL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new SealError({
      code: SealErrorCode.NETWORK_ERROR,
      message: err instanceof Error ? err.message : "Network request failed",
      cause: err,
    });
  }

  const text = await response.text();
  const parsed: unknown = text ? safeJsonParse(text) : undefined;

  if (!response.ok) {
    const body = (parsed ?? {}) as ApiErrorBody;
    throw new SealError({
      code: body.error ?? `http_${response.status}`,
      message: body.message ?? response.statusText ?? `Request failed with status ${response.status}`,
      httpStatus: response.status,
      requestId: body.request_id,
      details: parsed,
    });
  }

  if (parsed === undefined) return undefined as T;
  if (parsed === null || typeof parsed !== "object") {
    throw new SealError({
      code: SealErrorCode.UNKNOWN_ERROR,
      message: "Received an unexpected response shape from the ACTA API",
      httpStatus: response.status,
      details: parsed,
    });
  }
  return parsed as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
