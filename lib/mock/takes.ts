import type { PhraseResult, Take, TakeCompletion } from "@/lib/types";
import { MOCK_SONG_IDS } from "./songs";
import { synthEnvelope } from "./envelope";

/**
 * A seeded three-week history: nine takes, real improvement, two off days.
 *
 * The shape is deliberate, because a fixture that only goes up teaches the
 * progress screen to lie. What's encoded here:
 *
 *  - Holds get shorter within every single take. Breath support fatigues over a
 *    session; a take where the last phrase beats the first would be fiction.
 *  - Two off days (#4 and #7) where everything regresses. Both are evening
 *    sessions, and both were stopped partway. That is what a bad day looks like.
 *  - The last take scores *lower* than the one before it (56 vs 58) while
 *    setting a new longest hold, because it's a first attempt at the hardest
 *    song. The progress screen has to handle this without reading as a setback.
 *  - Personal records at #1, #3, #5, #8, #9 — five in nine. Frequent enough to
 *    feel achievable, rare enough to mean something.
 *
 * TODO(api): breathScore is hand-set here. Once lib/scoring/breathScore.ts
 * exists, derive it from `phrases` so this fixture cannot drift away from the
 * real algorithm.
 */

const pr = (
  phraseId: string,
  heldSec: number,
  steadiness: number,
  decaySlope: number,
  recoverySec: number,
): PhraseResult => ({ phraseId, heldSec, steadiness, decaySlope, recoverySec });

/** Adds seconds to an ISO timestamp, for authoring endedAt readably. */
const plus = (iso: string, sec: number): string =>
  new Date(new Date(iso).getTime() + sec * 1000).toISOString();

type Seeded = {
  id: string;
  songId: string;
  startedAt: string;
  /** Wall-clock length of the session, including rests between phrases. */
  sessionSec: number;
  completion: TakeCompletion;
  breathScore: number;
  isPersonalRecord: boolean;
  sigilSeed: number;
  phrases: PhraseResult[];
};

const { downInTheValley: DV, shenandoah: SH, dannyBoy: DB } = MOCK_SONG_IDS;

/** Oldest first, for readability. The API returns newest first. */
const SEEDED: Seeded[] = [
  {
    id: "take-0001",
    songId: DV,
    startedAt: "2026-07-08T08:12:00.000Z",
    sessionSec: 95,
    completion: "finished",
    breathScore: 41,
    isPersonalRecord: true, // first take ever
    sigilSeed: 0x2a71c4,
    phrases: [
      pr("p1", 3.2, 0.61, -0.09, 4.2),
      pr("p2", 3.6, 0.58, -0.11, 4.8),
      pr("p3", 3.1, 0.52, -0.14, 5.5),
      pr("p4", 2.9, 0.47, -0.16, 6.0),
    ],
  },
  {
    id: "take-0002",
    songId: DV,
    startedAt: "2026-07-10T08:31:00.000Z",
    sessionSec: 101,
    completion: "finished",
    breathScore: 39,
    isPersonalRecord: false,
    sigilSeed: 0x8b3f19,
    phrases: [
      pr("p1", 3.4, 0.55, -0.12, 4.6),
      pr("p2", 3.0, 0.51, -0.15, 5.2),
      pr("p3", 2.8, 0.44, -0.18, 6.1),
      pr("p4", 2.7, 0.42, -0.19, 6.4),
    ],
  },
  {
    id: "take-0003",
    songId: DV,
    startedAt: "2026-07-13T07:58:00.000Z",
    sessionSec: 92,
    completion: "finished",
    breathScore: 47,
    isPersonalRecord: true,
    sigilSeed: 0x4c9e52,
    phrases: [
      pr("p1", 3.8, 0.66, -0.08, 3.9),
      pr("p2", 4.2, 0.69, -0.07, 4.1),
      pr("p3", 3.9, 0.62, -0.1, 4.6),
      pr("p4", 3.5, 0.57, -0.12, 5.0),
    ],
  },
  {
    // Off day. Evening, first attempt at a harder song, stopped after three.
    id: "take-0004",
    songId: SH,
    startedAt: "2026-07-15T19:44:00.000Z",
    sessionSec: 74,
    completion: "stopped-early",
    breathScore: 38,
    isPersonalRecord: false,
    sigilSeed: 0xd15a7e,
    phrases: [
      pr("p1", 3.9, 0.48, -0.17, 6.3),
      pr("p2", 3.2, 0.41, -0.21, 7.1),
      pr("p3", 2.6, 0.35, -0.25, 8.0),
    ],
  },
  {
    id: "take-0005",
    songId: SH,
    startedAt: "2026-07-18T08:05:00.000Z",
    sessionSec: 138,
    completion: "finished",
    breathScore: 52,
    isPersonalRecord: true,
    sigilSeed: 0x6f2b90,
    phrases: [
      pr("p1", 4.1, 0.71, -0.07, 4.0),
      pr("p2", 4.4, 0.73, -0.06, 4.2),
      pr("p3", 4.0, 0.68, -0.09, 4.7),
      pr("p4", 3.7, 0.64, -0.1, 5.1),
      pr("p5", 3.9, 0.66, -0.09, 5.4),
    ],
  },
  {
    id: "take-0006",
    songId: SH,
    startedAt: "2026-07-21T08:20:00.000Z",
    sessionSec: 141,
    completion: "finished",
    breathScore: 51,
    isPersonalRecord: false,
    sigilSeed: 0x1e7d33,
    phrases: [
      pr("p1", 4.0, 0.7, -0.08, 4.1),
      pr("p2", 4.3, 0.72, -0.07, 4.3),
      pr("p3", 3.8, 0.66, -0.1, 4.9),
      pr("p4", 3.6, 0.63, -0.11, 5.2),
      pr("p5", 3.7, 0.65, -0.1, 5.3),
    ],
  },
  {
    // Second off day. Late at night, stopped after three.
    id: "take-0007",
    songId: SH,
    startedAt: "2026-07-24T21:10:00.000Z",
    sessionSec: 71,
    completion: "stopped-early",
    breathScore: 43,
    isPersonalRecord: false,
    sigilSeed: 0xa04c61,
    phrases: [
      pr("p1", 3.8, 0.53, -0.15, 5.9),
      pr("p2", 3.1, 0.46, -0.19, 6.8),
      pr("p3", 2.7, 0.39, -0.23, 7.6),
    ],
  },
  {
    id: "take-0008",
    songId: SH,
    startedAt: "2026-07-27T08:02:00.000Z",
    sessionSec: 134,
    completion: "finished",
    breathScore: 58,
    isPersonalRecord: true,
    sigilSeed: 0x35b8da,
    phrases: [
      pr("p1", 4.7, 0.77, -0.05, 3.6),
      pr("p2", 5.1, 0.79, -0.04, 3.8),
      pr("p3", 4.6, 0.74, -0.06, 4.2),
      pr("p4", 4.3, 0.71, -0.08, 4.6),
      pr("p5", 4.5, 0.73, -0.07, 4.8),
    ],
  },
  {
    // First reach at the hardest song. New longest hold, lower score — the
    // targets here are 8–10s and they got about half. That's a good day.
    id: "take-0009",
    songId: DB,
    startedAt: "2026-07-29T08:16:00.000Z",
    sessionSec: 212,
    completion: "finished",
    breathScore: 56,
    isPersonalRecord: true,
    sigilSeed: 0xc7e284,
    phrases: [
      pr("p1", 5.0, 0.75, -0.06, 4.4),
      pr("p2", 5.4, 0.76, -0.05, 4.5),
      pr("p3", 4.8, 0.71, -0.08, 5.0),
      pr("p4", 4.4, 0.67, -0.1, 5.5),
      pr("p5", 4.6, 0.69, -0.09, 5.3),
      pr("p6", 4.1, 0.62, -0.12, 6.2),
    ],
  },
];

function build(s: Seeded, withEnvelopes: boolean): Take {
  return {
    id: s.id,
    songId: s.songId,
    startedAt: s.startedAt,
    endedAt: plus(s.startedAt, s.sessionSec),
    completion: s.completion,
    breathScore: s.breathScore,
    longestHoldSec: Math.max(...s.phrases.map((p) => p.heldSec)),
    isPersonalRecord: s.isPersonalRecord,
    sigilSeed: s.sigilSeed,
    phrases: withEnvelopes
      ? s.phrases.map((p, i) => ({
          ...p,
          envelope: synthEnvelope(
            s.sigilSeed + i,
            p.heldSec,
            p.steadiness,
            p.decaySlope,
          ),
        }))
      : s.phrases,
  };
}

/**
 * Oldest first. Envelopes are attached only to the most recent take, mirroring
 * the real API: list responses omit them, single-take reads include them.
 */
export const MOCK_TAKES: Take[] = SEEDED.map((s, i) =>
  build(s, i === SEEDED.length - 1),
);

/** Full-fidelity read of one seeded take, envelopes included. */
export function mockTakeWithEnvelopes(id: string): Take | undefined {
  const s = SEEDED.find((t) => t.id === id);
  return s ? build(s, true) : undefined;
}
