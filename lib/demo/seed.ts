/**
 * Pre-seeds a few months of history behind demo mode's collection wall
 * (?demo=1 — see README.md), so /progress has more than one month to show
 * off during a live run. Goes through createTake() — the exact same write
 * path a real session uses — so this is genuinely a few more takes, not a
 * shortcut that only looks like one.
 *
 * Idempotent: running the demo twice in the same browser doesn't pile up a
 * second copy of the backdrop. The seeded/not-yet-seeded flag is its own
 * localStorage key, separate from lib/api/client.ts's STORAGE_KEYS — this
 * is presentation tooling, not part of the documented data contract.
 */

import type { PhraseResult, TakeDraft } from "@/lib/types";
import { MOCK_SONG_IDS } from "@/lib/mock";
import { synthEnvelope } from "@/lib/mock/envelope";
import { createTake } from "@/lib/api";

const SEEDED_FLAG_KEY = "lung-tunes.demo-seeded.v1";

type SeedSpec = {
  songId: string;
  startedAt: string;
  /** heldSec/steadiness/decaySlope/recoverySec per phrase, oldest song
   *  phrase first. */
  phrases: [number, number, number, number][];
  seed: number;
};

function monthsAgoIso(months: number): string {
  const d = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

const { downInTheValley: DV, shenandoah: SH } = MOCK_SONG_IDS;

/** Oldest first — seeded in this order so each take's isPersonalRecord is
 *  computed against a correctly-accumulated history, same as any real
 *  sequence of sessions. */
const SEED_SPECS: SeedSpec[] = [
  {
    songId: DV,
    startedAt: monthsAgoIso(3),
    phrases: [
      [3.0, 0.55, -0.12, 4.0],
      [3.2, 0.57, -0.11, 4.1],
      [2.8, 0.5, -0.14, 4.6],
      [2.6, 0.48, -0.15, 4.9],
    ],
    seed: 0x51e7a1,
  },
  {
    songId: DV,
    startedAt: monthsAgoIso(2.5),
    phrases: [
      [3.4, 0.6, -0.1, 3.8],
      [3.6, 0.62, -0.09, 3.9],
      [3.1, 0.56, -0.12, 4.3],
      [3.0, 0.54, -0.13, 4.4],
    ],
    seed: 0x2f9b3c,
  },
  {
    songId: SH,
    startedAt: monthsAgoIso(2),
    phrases: [
      [3.8, 0.64, -0.09, 4.0],
      [4.0, 0.66, -0.08, 4.1],
      [3.6, 0.6, -0.11, 4.5],
      [3.4, 0.58, -0.12, 4.7],
      [3.7, 0.61, -0.1, 4.6],
    ],
    seed: 0x7c3d81,
  },
  {
    songId: SH,
    startedAt: monthsAgoIso(1),
    phrases: [
      [4.2, 0.69, -0.07, 3.7],
      [4.4, 0.71, -0.06, 3.8],
      [3.9, 0.65, -0.09, 4.2],
      [3.7, 0.63, -0.1, 4.4],
      [4.0, 0.66, -0.08, 4.3],
    ],
    seed: 0xa15e26,
  },
];

function toDraft(spec: SeedSpec): TakeDraft {
  const phrases: PhraseResult[] = spec.phrases.map(
    ([heldSec, steadiness, decaySlope, recoverySec], i) => ({
      phraseId: `p${i + 1}`,
      heldSec,
      steadiness,
      decaySlope,
      recoverySec,
      envelope: synthEnvelope(spec.seed + i, heldSec, steadiness, decaySlope),
    }),
  );
  const sessionSec = phrases.reduce((sum, p) => sum + p.heldSec + p.recoverySec, 0);
  return {
    songId: spec.songId,
    startedAt: spec.startedAt,
    endedAt: new Date(new Date(spec.startedAt).getTime() + sessionSec * 1000).toISOString(),
    completion: "finished",
    phrases,
  };
}

export async function ensureDemoHistorySeeded(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(SEEDED_FLAG_KEY) === "true") return;

  for (const spec of SEED_SPECS) {
    await createTake(toDraft(spec));
  }

  window.localStorage.setItem(SEEDED_FLAG_KEY, "true");
}
