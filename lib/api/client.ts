/**
 * The only module in this app that calls `fetch`. See API_CONTRACT.md.
 *
 * Every function in lib/api/* has the signature a real client would have, and
 * branches once at the top: mocks, or HTTP. Nothing above this layer knows
 * which is running, so switching the flag is the whole migration.
 */

import type { ApiErrorBody } from "@/lib/types";

/**
 * Mocks are ON unless NEXT_PUBLIC_USE_MOCKS is explicitly "false".
 *
 * Defaulting on is deliberate: there is no backend yet, so an unset or
 * misspelled variable should leave the demo working rather than blank every
 * screen. Once a real API exists, flip this default.
 */
export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== "false";

/** TODO(api): point at the real service. */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/**
 * Thrown by every function in lib/api/*. Carries the HTTP status and the
 * machine-readable code from API_CONTRACT.md so screens can branch on the
 * cause, plus a message already safe to show a person.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  /** True for the cases worth offering a "try again" button for. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

/**
 * Artificial latency, so loading states are exercised in development instead of
 * being discovered in production. Randomized within a band because a fixed
 * delay hides layout shift that a variable one surfaces.
 */
export function delay(minMs = 220, maxMs = 560): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The real client path. Unused while USE_MOCKS is true. */
export async function http<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      // TODO(api): attach auth once the session scheme is decided.
      credentials: "include",
    });
  } catch {
    // Offline, DNS failure, CORS rejection — no HTTP status exists.
    throw new ApiError(
      0,
      "network_unreachable",
      "Can't reach the internet right now.",
    );
  }

  if (!res.ok) {
    let parsed: Partial<ApiErrorBody> = {};
    try {
      parsed = (await res.json()) as Partial<ApiErrorBody>;
    } catch {
      // Non-JSON error body; fall through to the generic message.
    }
    throw new ApiError(
      res.status,
      parsed.code ?? "unknown",
      parsed.message ?? "Something went wrong on our end.",
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// localStorage — where mock writes go
// ---------------------------------------------------------------------------

export const STORAGE_KEYS = {
  takes: "lung-tunes.takes.v1",
  profile: "lung-tunes.profile.v1",
} as const;

/**
 * Reads JSON from localStorage, returning null on absence, on unavailability
 * (SSR, Safari private mode), or on corruption. A malformed value must never
 * throw a screen away — the seeded fixture is a fine fallback.
 */
export function readStore<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Writes JSON to localStorage. Silent on quota errors — a failed write must
 *  not lose the take that is currently on screen. */
export function writeStore(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // TODO(api): once takes persist server-side, surface this instead.
  }
}
