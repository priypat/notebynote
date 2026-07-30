/**
 * Audio engine types. Runtime concerns, deliberately separate from the data
 * model in lib/types.ts — a BreathFrame is never persisted.
 *
 * Fields marked ADDED were not in the original sketch. Each one has a reason.
 */

export type EngineState =
  /** Nothing running. No microphone held, no context open. */
  | "idle"
  /** Microphone permission has been asked for and not yet answered. */
  | "requesting"
  /** Graph built and calibrated-ready, frames not yet flowing. Momentary. */
  | "ready"
  /** Frames are being delivered to subscribers. */
  | "running"
  /** The person said no to the microphone. Not an error — a choice. */
  | "denied"
  /** Something actually broke. See `breathEngine.lastError`. */
  | "error";

/**
 * ADDED (narrowed). The sketch said `{ fixture: string }`. A union of the real
 * fixture names makes a typo a compile error instead of a silent no-op at 2am.
 */
export type FixtureName =
  | "steady-12s"
  | "ragged-7s"
  | "fading-9s"
  | "short-3s"
  | "silence";

export type BreathSource =
  | "mic"
  /** `loop` is ADDED — it keeps a short fixture running while you build. */
  | { fixture: FixtureName; loop?: boolean };

/**
 * One analysis window, delivered at ~60 Hz.
 *
 * Everything here is derived from the microphone in real time and thrown away.
 * No audio is recorded, buffered beyond the analysis window, or transmitted.
 */
export type BreathFrame = {
  /** Seconds since `start()`, from the engine's own clock. Monotonic. */
  t: number;

  /** Linear RMS amplitude of this window, 0..1. */
  rms: number;

  /**
   * `rms` in dBFS, floored at -100. Thresholds are compared in dB rather than
   * linear amplitude because loudness perception and vocal effort are both
   * logarithmic — a linear threshold is far too sensitive when quiet and far
   * too slack when loud.
   */
  db: number;

  /**
   * Fundamental frequency in Hz.
   *
   * ADDED (nullable). Null when unvoiced, and also when the signal is voiced but
   * no confident pitch could be found — breathy or creaky phonation, which this
   * audience produces often. A caller must handle null; a sentinel like 0 or -1
   * would eventually get plotted.
   */
  pitchHz: number | null;

  /**
   * Whether a note is being held right now, after hysteresis. This is the value
   * to build phrase logic on — never compare `db` to a threshold yourself.
   */
  voiced: boolean;

  /**
   * Length of the voiced run in progress, in seconds. 0 when unvoiced.
   *
   * **Freezes during a brief dip** rather than counting through it. If the note
   * wobbles below the release threshold and comes back, this holds steady for
   * the duration of the wobble and then resumes — so the hero counter never
   * jumps backwards, and the value at the moment voicing ends is already the
   * true length of the hold rather than the length plus the release grace.
   */
  elapsedVoicedSec: number;

  /**
   * Seconds since the signal actually fell quiet — not since `voiced` flipped.
   * 0 while voiced. Because voicing only ends after a grace period, this starts
   * at roughly the length of that grace rather than at 0.
   */
  silenceSec: number;

  /**
   * ADDED. Length of the most recently completed voiced run, 0 before the first
   * one ends.
   *
   * Without this, capturing a finished hold means remembering the previous
   * frame's `elapsedVoicedSec` before it resets to 0 — a footgun that would be
   * rediscovered by every screen. Watch this value change instead.
   */
  lastVoicedRunSec: number;

  /**
   * ADDED. True during the opening noise-floor measurement, while voicing
   * detection is not yet meaningful. A screen should not start a phrase, or
   * tell someone to sing, until this goes false.
   */
  calibrating: boolean;
};

export type FrameListener = (frame: BreathFrame) => void;
export type StateListener = (state: EngineState) => void;
