/**
 * Fixture behaviour check. Run with `npm run check:audio`.
 *
 * Pushes every fixture through the real FrameBuilder — the same calibration,
 * thresholds, and hysteresis the microphone goes through — and asserts each one
 * still does what its description claims. Runs synchronously, so a 12-second
 * fixture checks in microseconds.
 *
 * This is the file that catches the failure mode that matters: someone retunes
 * a threshold in frames.ts, every fixture silently stops going voiced, and the
 * sing screen appears broken for reasons that have nothing to do with the sing
 * screen.
 */

import { FIXTURE_LIST, FIXTURE_FRAME_RATE } from "../lib/audio/fixtures";
import { FrameBuilder, VOICING } from "../lib/audio/frames";
import type { BreathFrame } from "../lib/audio/types";

/** Seconds trimmed from each end of a hold before measuring steadiness. */
const TRIM_SEC = 0.3;

const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);

type Run = {
  frames: BreathFrame[];
  /** Every completed voiced run, in order. */
  holds: number[];
  onsetT: number | null;
  peakDb: number;
  noiseFloorDb: number | null;
  onsetDb: number | null;
  /** Frames where the counter went backwards. Must always be zero. */
  counterRegressions: number;
};

function run(samples: { rms: number; pitchHz: number | null }[]): Run {
  const builder = new FrameBuilder();
  const frames: BreathFrame[] = [];
  const holds: number[] = [];

  let onsetT: number | null = null;
  let peakDb = -Infinity;
  let lastRun = 0;
  let prevElapsed = 0;
  let counterRegressions = 0;

  for (let i = 0; i < samples.length; i++) {
    const t = i / FIXTURE_FRAME_RATE;
    const frame = builder.push(t, samples[i].rms, samples[i].pitchHz);
    frames.push(frame);

    peakDb = Math.max(peakDb, frame.db);
    if (frame.voiced && onsetT === null) onsetT = t;
    if (frame.lastVoicedRunSec !== lastRun) {
      holds.push(frame.lastVoicedRunSec);
      lastRun = frame.lastVoicedRunSec;
    }
    // The hero counter must never tick backwards mid-hold.
    if (frame.voiced && frame.elapsedVoicedSec + 1e-9 < prevElapsed) {
      counterRegressions++;
    }
    prevElapsed = frame.voiced ? frame.elapsedVoicedSec : 0;
  }

  const thresholds = builder.getThresholds();
  return {
    frames,
    holds,
    onsetT,
    peakDb,
    noiseFloorDb: thresholds?.noiseFloorDb ?? null,
    onsetDb: thresholds?.onsetDb ?? null,
    counterRegressions,
  };
}

const results = new Map<string, Run>();

for (const fixture of FIXTURE_LIST) {
  const r = run(fixture.samples);
  results.set(fixture.name, r);
  const where = `${fixture.name}`;

  // Universal invariants, true of every fixture.
  if (r.frames.length === 0) fail(`${where}: no frames`);
  if (r.counterRegressions > 0) {
    fail(`${where}: elapsedVoicedSec went backwards on ${r.counterRegressions} frame(s)`);
  }
  if (r.noiseFloorDb === null) {
    fail(`${where}: calibration never completed`);
  }
  const calibratingFrames = r.frames.filter((f) => f.calibrating).length;
  const expectedCalibration = Math.round(
    VOICING.calibrationSec * FIXTURE_FRAME_RATE,
  );
  if (Math.abs(calibratingFrames - expectedCalibration) > 2) {
    fail(
      `${where}: calibrated for ${calibratingFrames} frames, expected ~${expectedCalibration}`,
    );
  }
  if (r.frames.some((f) => f.calibrating && f.voiced)) {
    fail(`${where}: went voiced during calibration`);
  }
  if (r.frames.some((f) => !f.voiced && f.pitchHz !== null)) {
    fail(`${where}: reported a pitch while unvoiced`);
  }
  if (r.frames.some((f) => f.voiced && f.silenceSec !== 0)) {
    fail(`${where}: non-zero silenceSec while voiced`);
  }
}

// --- per-fixture expectations ----------------------------------------------

function expectSingleHold(
  name: string,
  wantSec: number,
  toleranceSec: number,
): void {
  const r = results.get(name)!;
  if (r.holds.length !== 1) {
    fail(`${name}: expected exactly 1 completed hold, got ${r.holds.length} (${r.holds.map((h) => h.toFixed(2)).join(", ")})`);
    return;
  }
  const got = r.holds[0];
  if (Math.abs(got - wantSec) > toleranceSec) {
    fail(`${name}: hold measured ${got.toFixed(2)}s, expected ${wantSec}s ±${toleranceSec}`);
  }
}

expectSingleHold("steady-12s", 12, 0.4);
expectSingleHold("short-3s", 3, 0.35);

// The whole point of this one: two dips that go under the release threshold and
// recover inside the release hold. One unbroken phrase, not three.
expectSingleHold("ragged-7s", 7, 0.5);
{
  const r = results.get("ragged-7s")!;
  const releaseDb = (r.onsetDb ?? 0) - VOICING.hysteresisDb;
  const dipped = r.frames.filter((f) => f.voiced && f.db < releaseDb).length;
  if (dipped === 0) {
    fail("ragged-7s: no frame dipped below the release threshold — the hysteresis path is untested");
  }
  // The counter should freeze during those dips rather than counting through.
  const frozen = r.frames.filter(
    (f, i) => i > 0 && f.voiced && f.elapsedVoicedSec === r.frames[i - 1].elapsedVoicedSec,
  ).length;
  if (frozen === 0) {
    fail("ragged-7s: elapsedVoicedSec never froze — the dip handling isn't firing");
  }
  const steadiest = results.get("steady-12s")!;
  const ragged = spread(r);
  const steady = spread(steadiest);
  if (ragged <= steady * 1.5) {
    fail(`ragged-7s: amplitude spread ${ragged.toFixed(1)}dB is not meaningfully rougher than steady-12s (${steady.toFixed(1)}dB)`);
  }
}

// Voicing must end on its own as the note fades, without the signal being cut.
expectSingleHold("fading-9s", 9, 0.6);
{
  const r = results.get("fading-9s")!;
  const voicedFrames = r.frames.filter((f) => f.voiced);
  const first = voicedFrames[0];
  const last = voicedFrames[voicedFrames.length - 1];
  if (!first || !last) {
    fail("fading-9s: never went voiced");
  } else if (first.db - last.db < 15) {
    fail(`fading-9s: only faded ${(first.db - last.db).toFixed(1)}dB across the hold — not a fade`);
  }
}

// Nothing may ever go voiced on room tone.
{
  const r = results.get("silence")!;
  if (r.onsetT !== null) {
    fail(`silence: went voiced at ${r.onsetT.toFixed(2)}s — false positive`);
  }
  if (r.holds.length > 0) fail("silence: produced a completed hold");
  const finalSilence = r.frames[r.frames.length - 1].silenceSec;
  if (finalSilence < 3) {
    fail(`silence: silenceSec only reached ${finalSilence.toFixed(1)}s`);
  }
}

/**
 * Standard deviation of dB across the *sustained body* of the hold — a proxy for
 * raggedness.
 *
 * The onset and release ramps are excluded. They span the full dynamic range of
 * the note in a fraction of a second, so including them swamps the measurement:
 * the deliberately glass-smooth steady-12s fixture scores 4.9 dB with the ramps
 * in and 0.4 dB without them. Steadiness is a property of the sustain, not of
 * how the note starts and stops.
 */
function spread(r: Run): number {
  const voicedIdx = r.frames
    .map((f, i) => (f.voiced ? i : -1))
    .filter((i) => i >= 0);
  if (voicedIdx.length === 0) return 0;

  const trim = Math.round(TRIM_SEC * FIXTURE_FRAME_RATE);
  const from = voicedIdx[0] + trim;
  const to = voicedIdx[voicedIdx.length - 1] - trim;
  if (to <= from) return 0;

  const dbs = r.frames.slice(from, to + 1).map((f) => f.db);
  const mean = dbs.reduce((a, b) => a + b, 0) / dbs.length;
  return Math.sqrt(dbs.reduce((a, b) => a + (b - mean) ** 2, 0) / dbs.length);
}

// --- report ----------------------------------------------------------------

if (problems.length > 0) {
  console.error(`✗ ${problems.length} audio fixture problem(s):\n`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}

console.log("✓ audio fixtures behave as described\n");
const pad = (s: string, n: number) => s.padEnd(n);
console.log(
  `  ${pad("fixture", 12)} ${pad("floor", 8)} ${pad("onset", 8)} ${pad("peak", 8)} ${pad("holds", 18)} spread`,
);
for (const fixture of FIXTURE_LIST) {
  const r = results.get(fixture.name)!;
  console.log(
    `  ${pad(fixture.name, 12)} ` +
      `${pad(`${r.noiseFloorDb?.toFixed(0)}dB`, 8)} ` +
      `${pad(`${r.onsetDb?.toFixed(0)}dB`, 8)} ` +
      `${pad(`${r.peakDb.toFixed(0)}dB`, 8)} ` +
      `${pad(r.holds.length ? r.holds.map((h) => `${h.toFixed(2)}s`).join(", ") : "—", 18)} ` +
      `${spread(r).toFixed(1)}dB`,
  );
}
