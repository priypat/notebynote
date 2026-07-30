import type { GetTakesOptions, Take, TakeDraft } from "@/lib/types";
import { MOCK_TAKES, mockTakeWithEnvelopes } from "@/lib/mock";
import {
  ApiError,
  STORAGE_KEYS,
  USE_MOCKS,
  delay,
  http,
  readStore,
  writeStore,
} from "./client";

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
  const longestHoldSec = Math.max(...draft.phrases.map((p) => p.heldSec));
  const bestSoFar = history.reduce((m, t) => Math.max(m, t.longestHoldSec), 0);

  const take: Take = {
    id: `take-local-${history.length + 1}-${draft.startedAt}`,
    songId: draft.songId,
    startedAt: draft.startedAt,
    endedAt: draft.endedAt,
    completion: draft.completion,
    phrases: draft.phrases,
    longestHoldSec,
    // TODO(api): replace with breathScore() from lib/scoring/breathScore.ts
    // once it exists. This placeholder is a stand-in, not the algorithm.
    breathScore: placeholderScore(draft),
    isPersonalRecord: longestHoldSec > bestSoFar,
    sigilSeed: deriveSigilSeed(draft),
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

/**
 * Placeholder until lib/scoring/breathScore.ts lands. Length against target,
 * weighted by steadiness. Deliberately simple and deliberately not the real
 * thing — do not tune this, replace it.
 */
function placeholderScore(draft: TakeDraft): number {
  const n = draft.phrases.length;
  const mean =
    draft.phrases.reduce((sum, p) => sum + p.heldSec * p.steadiness, 0) / n;
  return Math.round(Math.min(100, mean * 12));
}

/**
 * A stable 32-bit seed derived from the take's own contents, so the same take
 * draws the same terrain on every device without the server and client having
 * to agree on anything but this function. FNV-1a.
 *
 * TODO(api): the server must return sigilSeed; if it ever computes one
 * differently, the server's value wins and this is dead code.
 */
function deriveSigilSeed(draft: TakeDraft): number {
  const input = [
    draft.songId,
    draft.startedAt,
    ...draft.phrases.map(
      (p) => `${p.phraseId}:${p.heldSec}:${p.steadiness}:${p.decaySlope}`,
    ),
  ].join("|");

  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
