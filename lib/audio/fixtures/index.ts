/**
 * The five breath fixtures.
 *
 * These exist so the sing screen can be built, demoed, and regression-tested
 * without anyone singing out loud — at 2am, on a train, in an open-plan office,
 * or in CI. They are also the deterministic test input: the same fixture always
 * produces the same frames, so a screen's behaviour is reproducible.
 *
 * Every fixture opens with room tone longer than the calibration window, so the
 * noise floor is measured from the fixture exactly as it would be from a room.
 * The numbers below are tuned against the thresholds in frames.ts — see
 * `npm run check:audio`, which asserts each fixture still behaves as described.
 */

import type { FixtureName } from "../types";
import { synthesize, type FixtureSample, FIXTURE_FRAME_RATE } from "./synth";

export { FIXTURE_FRAME_RATE };
export type { FixtureSample };

/** ~-55 dBFS. A quiet room with something humming in it. */
const ROOM = 0.0018;

/** ~-21 dBFS. Comfortable, unforced singing into a phone held at chest height. */
const COMFORTABLE = 0.09;

export type BreathFixture = {
  name: FixtureName;
  /** Shown in the source switcher. */
  label: string;
  /** What this fixture is for — which behaviour it puts under test. */
  description: string;
  durationSec: number;
  samples: FixtureSample[];
};

function fixture(
  name: FixtureName,
  label: string,
  description: string,
  spec: Parameters<typeof synthesize>[0],
): BreathFixture {
  const samples = synthesize(spec);
  return {
    name,
    label,
    description,
    durationSec: samples.length / FIXTURE_FRAME_RATE,
    samples,
  };
}

const STEADY_12S = fixture(
  "steady-12s",
  "Steady, 12s",
  "A long, well-supported hold. The reference case: smooth rolling crests, evenly spaced contours.",
  {
    leadInSec: 0.8,
    holdSec: 12,
    tailSec: 1.2,
    peakRms: COMFORTABLE,
    roomRms: ROOM,
    steadiness: 0.95,
    decayPerSec: -0.004, // barely fades — this is what good support looks like
    baseHz: 196, // G3
    vibratoCents: 16,
    vibratoHz: 5,
    dips: [],
    seed: 0x51ead1,
  },
);

const RAGGED_7S = fixture(
  "ragged-7s",
  "Ragged, 7s",
  "Uneven support with two dips that fall under the release threshold and recover. Both are shorter than the 250ms release hold, so the phrase must survive them — this is the hysteresis test.",
  {
    leadInSec: 0.8,
    holdSec: 7,
    tailSec: 1.4,
    peakRms: 0.075,
    roomRms: ROOM,
    steadiness: 0.32,
    decayPerSec: -0.022,
    baseHz: 220, // A3
    vibratoCents: 26,
    vibratoHz: 4.2,
    dips: [
      { atSec: 2.1, durSec: 0.12, depth: 0.03 }, // 120ms — must survive
      { atSec: 4.4, durSec: 0.18, depth: 0.03 }, // 180ms — must survive
    ],
    seed: 0x2a66ed,
  },
);

const FADING_9S = fixture(
  "fading-9s",
  "Fading, 9s",
  "Starts supported and fades to nothing. Voicing should end on its own around 9s, without the person stopping — this is what running out of breath actually looks like.",
  {
    leadInSec: 0.8,
    holdSec: 9.6,
    tailSec: 1.4,
    peakRms: 0.085,
    roomRms: ROOM,
    steadiness: 0.7,
    // Tuned so the signal crosses the release threshold at about 9.0s.
    decayPerSec: -0.106,
    baseHz: 175, // F3
    vibratoCents: 20,
    vibratoHz: 4.6,
    dips: [],
    seed: 0xfad19c,
  },
);

const SHORT_3S = fixture(
  "short-3s",
  "Short, 3s",
  "Clean and well-supported but brief. Someone with real limitation on a good day — the app must never render this as a failure.",
  {
    leadInSec: 0.8,
    holdSec: 3,
    tailSec: 1.4,
    peakRms: 0.07,
    roomRms: ROOM,
    steadiness: 0.82,
    decayPerSec: -0.03,
    baseHz: 165, // E3
    vibratoCents: 14,
    vibratoHz: 5.2,
    dips: [],
    seed: 0x5407,
  },
);

const SILENCE = fixture(
  "silence",
  "Silence",
  "Room tone only. Nothing should ever go voiced — this is the false-positive test, and the one to reach for when a screen seems to be inventing phrases.",
  {
    leadInSec: 4,
    holdSec: 0,
    tailSec: 0,
    peakRms: 0,
    roomRms: ROOM,
    steadiness: 1,
    decayPerSec: 0,
    baseHz: 0,
    vibratoCents: 0,
    vibratoHz: 0,
    dips: [],
    seed: 0x51ff,
  },
);

export const FIXTURES: Record<FixtureName, BreathFixture> = {
  "steady-12s": STEADY_12S,
  "ragged-7s": RAGGED_7S,
  "fading-9s": FADING_9S,
  "short-3s": SHORT_3S,
  silence: SILENCE,
};

/** Ordered for the dev switcher: easiest to reason about first. */
export const FIXTURE_LIST: BreathFixture[] = [
  STEADY_12S,
  SHORT_3S,
  RAGGED_7S,
  FADING_9S,
  SILENCE,
];

export const FIXTURE_NAMES = FIXTURE_LIST.map((f) => f.name);

export function getFixture(name: FixtureName): BreathFixture {
  return FIXTURES[name];
}
