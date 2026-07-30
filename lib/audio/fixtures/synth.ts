/**
 * Breath signal synthesis for fixtures.
 *
 * A fixture produces `{ rms, pitchHz }` per frame — a *signal*, not a finished
 * BreathFrame. It is then pushed through the same FrameBuilder the microphone
 * uses, so the fixture exercises calibration, the onset and release thresholds,
 * and the hysteresis timing exactly as a live voice would. Nothing downstream
 * can tell the difference, and neither can the voicing logic.
 *
 * Every fixture is deterministic: same name, same numbers, forever.
 */

/** Frames per second the fixtures are authored at. Matches the engine. */
export const FIXTURE_FRAME_RATE = 60;

export type FixtureSample = {
  rms: number;
  pitchHz: number | null;
};

export type Dip = {
  /** Seconds into the hold. */
  atSec: number;
  /** How long the dip lasts, trough to trough. */
  durSec: number;
  /** Amplitude multiplier at the bottom. 0.04 puts a normal note under the
   *  release threshold; 0.5 is a wobble that stays comfortably voiced. */
  depth: number;
};

export type SynthSpec = {
  /** Room tone before anything is sung. Must exceed the calibration window. */
  leadInSec: number;
  holdSec: number;
  /** Room tone after the note. */
  tailSec: number;
  /** RMS at the start of the hold. */
  peakRms: number;
  /** Room noise RMS. ~0.0018 is about -55 dBFS. */
  roomRms: number;
  /** 0..1. Drives how much slow drift and frame-to-frame grain there is. */
  steadiness: number;
  /** Fractional amplitude change per second. Negative fades. */
  decayPerSec: number;
  baseHz: number;
  /** Vibrato depth in cents, and its rate. */
  vibratoCents: number;
  vibratoHz: number;
  dips: Dip[];
  seed: number;
};

/** mulberry32. Small, deterministic, and adequate for grain. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 0→1→0 bump, for shaping dips without a corner. */
function bump(x: number): number {
  if (x <= 0 || x >= 1) return 0;
  return Math.sin(Math.PI * x) ** 2;
}

export function synthesize(spec: SynthSpec): FixtureSample[] {
  const rand = prng(spec.seed);
  const dt = 1 / FIXTURE_FRAME_RATE;
  const total = spec.leadInSec + spec.holdSec + spec.tailSec;
  const frameCount = Math.round(total * FIXTURE_FRAME_RATE);

  // Two slow drift components. Breath support wanders over hundreds of
  // milliseconds; it does not chatter. Anything faster than a couple of Hz here
  // would render as a signal trace instead of terrain.
  const unsteady = 1 - spec.steadiness;
  const driftHz1 = 0.4 + rand() * 0.5;
  const driftHz2 = 0.9 + rand() * 0.8;
  const driftPhase1 = rand() * Math.PI * 2;
  const driftPhase2 = rand() * Math.PI * 2;

  const samples: FixtureSample[] = [];

  for (let i = 0; i < frameCount; i++) {
    const t = i * dt;
    const room = spec.roomRms * (0.75 + rand() * 0.5);

    if (t < spec.leadInSec || t >= spec.leadInSec + spec.holdSec) {
      samples.push({ rms: room, pitchHz: null });
      continue;
    }

    const u = t - spec.leadInSec; // seconds into the hold

    // Onset and release ramps, eased. A hard edge would read as a click and,
    // more importantly, would make onset timing trivially easy to detect.
    const onset = Math.min(1, u / 0.12);
    const release = Math.min(1, (spec.holdSec - u) / 0.15);

    const fade = Math.max(0, 1 + spec.decayPerSec * u);

    const drift =
      Math.sin(u * driftHz1 * Math.PI * 2 + driftPhase1) * unsteady * 0.28 +
      Math.sin(u * driftHz2 * Math.PI * 2 + driftPhase2) * unsteady * 0.16;

    // Frame-to-frame grain, small even when ragged — raggedness lives in the
    // slow drift, not in noise.
    const grain = (rand() - 0.5) * 2 * unsteady * 0.05;

    let dipFactor = 1;
    for (const dip of spec.dips) {
      const phase = (u - dip.atSec) / dip.durSec + 0.5;
      const strength = bump(phase);
      if (strength > 0) dipFactor *= 1 - (1 - dip.depth) * strength;
    }

    const rmsRaw =
      spec.peakRms * onset * release * fade * dipFactor * (1 + drift + grain);

    // The room is always there underneath the voice.
    const rms = Math.max(room, rmsRaw);

    const vibrato =
      Math.sin(u * spec.vibratoHz * Math.PI * 2) * spec.vibratoCents;
    const wander = (rand() - 0.5) * 2 * unsteady * 35; // cents
    const cents = vibrato + wander;
    const pitchHz = spec.baseHz * Math.pow(2, cents / 1200);

    samples.push({ rms, pitchHz });
  }

  return samples;
}
