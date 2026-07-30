import type { GetTakesOptions, Take, TakeDraft } from "@/lib/types";
import { MOCK_TAKES, mockTakeWithEnvelopes } from "@/lib/mock";
import { scoreTake } from "@/lib/scoring/breathScore";
import {
  ApiError,
  STORAGE_KEYS,
  USE_MOCKS,
  delay,
  http,
  readStore,
  writeStore,
} from "./client";
import { getProfile } from "./profile";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * GET /api/takes?limit=n
 *
 * Newest first. Phrase envelopes are omitted — see PhraseResult.envelope.
 */
export async function getTakes(options: GetTakesOptions = {}): Promise<Take[]> {
  const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  if (!USE_MOCKS) return http<Take[]>("GET", `/api/takes?limit=${limit}`);

  await delay();
  return allTakesNewestFirst()
    .slice(0, limit)
    .map(stripEnvelopes);
}

/**
 * GET /api/takes/:id
 *
 * Full fidelity, envelopes included — this is what the summary screen and any
 * "revisit this take" view read, because they redraw the actual ridge.
 */
export async function getTake(id: string): Promise<Take> {
  if (!USE_MOCKS) return http<Take>("GET", `/api/takes/${encodeURIComponent(id)}`);

  await delay();
  const stored = storedTakes().find((t) => t.id === id);
  const take = stored ?? mockTakeWithEnvelopes(id);
  if (!take) {
    throw new ApiError(404, "take_not_found", `No take with id "${id}".`);
  }
  return take;
}

/**
 * POST /api/takes
 *
 * The client sends what it measured; the server decides what it means.
 * breathScore, longestHoldSec, isPersonalRecord, and sigilSeed are all computed
 * here and returned — never accepted from the caller. See API_CONTRACT.md for
 * why that split matters.
 */
export async function createTake(draft: TakeDraft): Promise<Take> {
  if (!USE_MOCKS) return http<Take>("POST", "/api/takes", draft);

  await delay(340, 780); // a write, so a little slower than a read

  if (draft.phrases.length === 0) {
    throw new ApiError(
      422,
      "empty_take",
      "A take needs at least one phrase result.",
    );
  }

  const history = allTakesNewestFirst();
  const previousBestHoldSec = history.reduce((m, t) => Math.max(m, t.longestHoldSec), 0);
  const profile = await getProfile();
  const { breathScore, longestHoldSec, isPersonalRecord, sigilSeed } = scoreTake(
    draft.phrases,
    profile,
    previousBestHoldSec,
  );

  const take: Take = {
    // No colons — a raw ISO timestamp in the id makes a URL path segment
    // that some client-side navigations round-trip through inconsistently
    // (Next.js's dynamic route params have been observed re-encoding a
    // literal ":" but never decoding it back, corrupting the lookup key).
    id: `take-local-${history.length + 1}-${Date.parse(draft.startedAt)}`,
    songId: draft.songId,
    startedAt: draft.startedAt,
    endedAt: draft.endedAt,
    completion: draft.completion,
    phrases: draft.phrases,
    longestHoldSec,
    breathScore,
    isPersonalRecord,
    sigilSeed,
  };

  writeStore(STORAGE_KEYS.takes, [...storedTakes(), take]);
  return take;
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function storedTakes(): Take[] {
  const stored = readStore<Take[]>(STORAGE_KEYS.takes);
  return Array.isArray(stored) ? stored : [];
}

/** Seeded history plus anything recorded on this device, newest first. */
function allTakesNewestFirst(): Take[] {
  return [...MOCK_TAKES, ...storedTakes()].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
}

function stripEnvelopes(take: Take): Take {
  return {
    ...take,
    phrases: take.phrases.map(({ envelope: _envelope, ...rest }) => rest),
  };
}
