/**
 * Noise-floor calibration, voicing hysteresis, and frame assembly.
 *
 * Pure state machine — no Web Audio, no timers. Both the microphone path and the
 * fixture path push through this identical code, which is the whole reason a
 * fixture is indistinguishable from a live mic downstream: the fixture supplies
 * a signal, not a finished frame, and the voicing logic is exercised either way.
 */

import type { BreathFrame } from "./types";
import { toDb } from "./pitch";

export const VOICING = {
  /**
   * How long the opening silence measurement runs.
   *
   * Every room is different and every phone mic has a different gain. A fixed
   * threshold would work in one kitchen and nowhere else.
   */
  calibrationSec: 0.5,

  /**
   * How far above the measured noise floor counts as singing.
   *
   * 12 dB is roughly "four times the amplitude of the room" — comfortably above
   * a fridge or a fan, comfortably below any actual phonation.
   */
  onsetMarginDb: 12,

  /**
   * How much quieter than the onset threshold counts as stopping.
   *
   * A 5 dB gap is the hysteresis. Without it, a note sitting right at the
   * threshold flickers voiced/unvoiced dozens of times a second.
   */
  hysteresisDb: 5,

  /**
   * An onset must persist this long to count.
   *
   * Stops a door closing or a cough from opening a phrase, without adding
   * latency a person would notice at the start of a note.
   */
  onsetHoldSec: 0.05,

  /**
   * A drop must persist this long to end a phrase. **This is the important one.**
   *
   * 250 ms is chosen to sit above the things that are not the end of a note — a
   * voice crack, the trough of a wide vibrato, a consonant in the middle of a
   * sustained word, a moment of lost support that gets recovered — and below the
   * shortest real breath. Someone whose note wobbles has not run out of breath,
   * and telling them they have would be both wrong and unkind.
   */
  releaseHoldSec: 0.25,

  /**
   * The onset threshold never goes below this, however quiet the room.
   *
   * In a very quiet room the measured floor can be -75 dBFS, which would put the
   * onset threshold at -63 — low enough that the sound of breathing in reads as
   * singing.
   */
  minOnsetDb: -55,

  /**
   * The measured floor is clamped to at most this.
   *
   * Protects the case where someone starts singing during calibration: without
   * the clamp the floor lands around -25 dBFS, the onset threshold lands at -13,
   * and the app appears completely deaf for the rest of the session.
   */
  maxNoiseFloorDb: -42,

  /**
   * Percentile of the calibration window used as the floor.
   *
   * Not the mean, which a single thump drags upward, and not the minimum, which
   * lands in the gap between two cycles of a fan. The 75th percentile is a
   * deliberately pessimistic estimate of the room — over-estimating the noise
   * costs a little sensitivity, under-estimating it produces phantom phrases.
   */
  floorPercentile: 0.75,
} as const;

export type Thresholds = {
  noiseFloorDb: number;
  onsetDb: number;
  releaseDb: number;
};

export class FrameBuilder {
  private calibrationDb: number[] = [];
  private thresholds: Thresholds | null = null;

  private voiced = false;
  /** When the current voiced run began — back-dated to the onset crossing. */
  private voicedStartT: number | null = null;
  /** When the signal first rose above onset, pending confirmation. */
  private aboveSinceT: number | null = null;
  /** When the signal first fell below release, pending confirmation. */
  private belowSinceT: number | null = null;
  /** When the signal last actually went quiet. */
  private quietSinceT = 0;
  private lastVoicedRunSec = 0;

  reset(): void {
    this.calibrationDb = [];
    this.thresholds = null;
    this.voiced = false;
    this.voicedStartT = null;
    this.aboveSinceT = null;
    this.belowSinceT = null;
    this.quietSinceT = 0;
    this.lastVoicedRunSec = 0;
  }

  /** Null until calibration finishes. */
  getThresholds(): Thresholds | null {
    return this.thresholds;
  }

  /**
   * Fold one analysis window into a frame.
   *
   * `pitchHz` is what the detector found, or null. It is suppressed in the
   * output whenever the frame is unvoiced, so a subscriber never sees a pitch
   * for a silence.
   */
  push(t: number, rms: number, pitchHz: number | null): BreathFrame {
    const db = toDb(rms);

    if (this.thresholds === null) {
      this.calibrationDb.push(db);
      if (t < VOICING.calibrationSec) {
        return this.frame(t, rms, db, null, true);
      }
      this.thresholds = deriveThresholds(this.calibrationDb);
      this.calibrationDb = [];
      this.quietSinceT = t;
    }

    const { onsetDb, releaseDb } = this.thresholds;

    if (!this.voiced) {
      if (db >= onsetDb) {
        if (this.aboveSinceT === null) this.aboveSinceT = t;
        if (t - this.aboveSinceT >= VOICING.onsetHoldSec) {
          this.voiced = true;
          // Back-date to the crossing, not to now — otherwise every hold is
          // reported 50 ms short.
          this.voicedStartT = this.aboveSinceT;
          this.aboveSinceT = null;
          this.belowSinceT = null;
        }
      } else {
        this.aboveSinceT = null;
      }
    } else {
      if (db < releaseDb) {
        if (this.belowSinceT === null) this.belowSinceT = t;
        if (t - this.belowSinceT >= VOICING.releaseHoldSec) {
          // The hold ended when the signal dropped, not when we confirmed it.
          this.lastVoicedRunSec = Math.max(
            0,
            this.belowSinceT - (this.voicedStartT ?? this.belowSinceT),
          );
          this.voiced = false;
          this.voicedStartT = null;
          this.quietSinceT = this.belowSinceT;
          this.belowSinceT = null;
          this.aboveSinceT = null;
        }
      } else {
        // Recovered. The dip never happened as far as the phrase is concerned.
        this.belowSinceT = null;
      }
    }

    return this.frame(t, rms, db, pitchHz, false);
  }

  private frame(
    t: number,
    rms: number,
    db: number,
    pitchHz: number | null,
    calibrating: boolean,
  ): BreathFrame {
    // Freeze the counter through a dip: if the signal is currently below the
    // release threshold, the run is measured to where it dropped.
    const runEnd = this.belowSinceT ?? t;
    const elapsedVoicedSec =
      this.voiced && this.voicedStartT !== null
        ? Math.max(0, runEnd - this.voicedStartT)
        : 0;

    return {
      t,
      rms,
      db,
      pitchHz: this.voiced ? pitchHz : null,
      voiced: this.voiced,
      elapsedVoicedSec,
      silenceSec: this.voiced ? 0 : Math.max(0, t - this.quietSinceT),
      lastVoicedRunSec: this.lastVoicedRunSec,
      calibrating,
    };
  }
}

function deriveThresholds(samples: number[]): Thresholds {
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(sorted.length * VOICING.floorPercentile)),
  );
  const measured = sorted.length > 0 ? sorted[index] : VOICING.minOnsetDb;

  const noiseFloorDb = Math.min(measured, VOICING.maxNoiseFloorDb);
  const onsetDb = Math.max(
    noiseFloorDb + VOICING.onsetMarginDb,
    VOICING.minOnsetDb,
  );

  return { noiseFloorDb, onsetDb, releaseDb: onsetDb - VOICING.hysteresisDb };
}
