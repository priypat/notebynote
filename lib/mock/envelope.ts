/**
 * Seeded breath-envelope synthesis, for fixture data only.
 *
 * Real envelopes come from lib/audio/breathEngine.ts. This exists so a seeded
 * take can carry a plausible envelope without 90 hand-typed floats per phrase,
 * and so it renders identically every reload — a take's terrain must never
 * change between two viewings of the same take.
 */

/** mulberry32 — small, fast, good enough, and deterministic. */
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

/**
 * A breath envelope at 10 Hz, values 0..1.
 *
 * Shape: a quick eased onset, a body that wobbles inversely with `steadiness`,
 * a linear fade set by `decaySlope`, and a release at the end. The wobble is
 * low-frequency on purpose — breath support drifts over hundreds of
 * milliseconds, it does not chatter. Anything faster than this would render as
 * a signal trace rather than terrain.
 */
export function synthEnvelope(
  seed: number,
  heldSec: number,
  steadiness: number,
  decaySlope: number,
): number[] {
  const rand = prng(seed);
  const n = Math.max(1, Math.round(heldSec * 10));

  // Two slow drifting components; less steady breath gets more of both.
  const wobble = (1 - steadiness) * 0.34;
  const f1 = 0.55 + rand() * 0.5; // Hz
  const f2 = 1.15 + rand() * 0.7;
  const phase1 = rand() * Math.PI * 2;
  const phase2 = rand() * Math.PI * 2;

  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / 10;
    const progress = i / (n - 1 || 1);

    const onset = Math.min(1, t / 0.35);
    const release = Math.min(1, (heldSec - t) / 0.3);
    const fade = 1 + decaySlope * t;

    const drift =
      Math.sin(t * f1 * Math.PI * 2 + phase1) * wobble * 0.6 +
      Math.sin(t * f2 * Math.PI * 2 + phase2) * wobble * 0.4;

    // A ragged breath frays most near the end, when support runs out.
    const fray = (1 - steadiness) * 0.12 * progress * (rand() - 0.5) * 2;

    const v = 0.82 * onset * release * fade + drift * onset * release + fray;
    out.push(Math.min(1, Math.max(0, Number(v.toFixed(4)))));
  }
  return out;
}
