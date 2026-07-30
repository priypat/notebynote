/**
 * YIN pitch detection. Pure math on a Float32Array — no Web Audio, no imports.
 *
 * YIN rather than plain autocorrelation because raw autocorrelation picks the
 * octave below embarrassingly often on a voice with strong harmonics, and an
 * octave error in a hero readout is worse than no reading at all. The cumulative
 * mean normalized difference function is the part of YIN that fixes it, and it's
 * about fifteen lines.
 *
 * Reference: de Cheveigné & Kawahara, "YIN, a fundamental frequency estimator
 * for speech and music" (2002).
 */

/**
 * Audio is decimated to roughly this rate before analysis.
 *
 * The cost of YIN is window × lag-count, and both scale with sample rate — at
 * 48 kHz a full-rate pass is ~750k multiply-adds per frame, which is not
 * affordable 60 times a second on a phone that is also animating a gradient.
 * Decimating by 4 costs a factor of 16 and loses nothing that matters here:
 * we only need the fundamental, and the fundamental of a sung note is below
 * 1 kHz.
 */
const TARGET_RATE_HZ = 12_000;

/**
 * 70 Hz to 900 Hz — roughly D2 to A5.
 *
 * Deliberately not the full range of human singing. Below 70 Hz is a lorry
 * outside, not a person; above 900 Hz the decimated resolution gets coarse, and
 * nobody in this app is sustaining a whistle-register note as a breath
 * exercise. Narrowing the range is also what keeps the lag search cheap.
 */
export const MIN_PITCH_HZ = 70;
export const MAX_PITCH_HZ = 900;

/** Below this CMNDF value a lag counts as a confident period. YIN's default. */
const YIN_THRESHOLD = 0.15;

/**
 * Minimum clarity (`1 - cmndf`) to report a pitch at all.
 *
 * Set low-ish on purpose. Breathy and creaky phonation is common in this
 * audience and genuinely has a weaker periodicity; refusing to report anything
 * below textbook clarity would blank the pitch readout for exactly the people
 * the app is for.
 */
const MIN_CLARITY = 0.55;

export type PitchReading = {
  /** Hz, or null if nothing periodic enough was found. */
  hz: number | null;
  /** 0..1. How periodic the window was. Reported even when `hz` is null. */
  clarity: number;
};

const NO_PITCH: PitchReading = { hz: null, clarity: 0 };

/**
 * Holds its scratch buffers across calls.
 *
 * Allocating two typed arrays per frame is 120 allocations a second, which is
 * exactly the kind of steady garbage that turns into visible jank in an
 * animation that is supposed to read as calm.
 */
export class PitchDetector {
  /** Effective sample rate after decimation. */
  readonly rate: number;

  private readonly factor: number;
  private readonly tauMin: number;
  private readonly tauMax: number;
  /** Comparison window length, in decimated samples. */
  private readonly window: number;
  private readonly x: Float32Array;
  private readonly cmndf: Float32Array;

  constructor(sampleRate: number, bufferSize: number) {
    this.factor = Math.max(1, Math.round(sampleRate / TARGET_RATE_HZ));
    this.rate = sampleRate / this.factor;

    const decimatedLength = Math.floor(bufferSize / this.factor);
    this.tauMin = Math.max(2, Math.floor(this.rate / MAX_PITCH_HZ));
    this.tauMax = Math.min(
      decimatedLength - 2,
      Math.ceil(this.rate / MIN_PITCH_HZ),
    );
    this.window = decimatedLength - this.tauMax;

    this.x = new Float32Array(decimatedLength);
    this.cmndf = new Float32Array(this.tauMax + 1);
  }

  /** True if the buffer is long enough to resolve MIN_PITCH_HZ at all. */
  get isUsable(): boolean {
    return this.window > 0 && this.tauMax > this.tauMin;
  }

  detect(input: Float32Array): PitchReading {
    if (!this.isUsable) return NO_PITCH;

    this.decimate(input);

    const { x, cmndf, window: w, tauMin, tauMax } = this;

    // YIN step 2: the difference function, and step 3: cumulative mean
    // normalization, fused into one pass so `d` never has to be materialized.
    let runningSum = 0;
    cmndf[0] = 1;
    for (let tau = 1; tau <= tauMax; tau++) {
      let d = 0;
      for (let i = 0; i < w; i++) {
        const delta = x[i] - x[i + tau];
        d += delta * delta;
      }
      runningSum += d;
      // A silent window makes this 0/0. Report no pitch rather than NaN.
      cmndf[tau] = runningSum > 1e-12 ? (d * tau) / runningSum : 1;
    }

    // YIN step 4: the *first* dip below threshold, not the global minimum.
    // Taking the global minimum is what reintroduces octave errors, because a
    // period of 2T scores nearly as well as T on a steady note.
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (cmndf[t] < YIN_THRESHOLD) {
        // Descend to the bottom of this dip.
        while (t + 1 <= tauMax && cmndf[t + 1] < cmndf[t]) t++;
        tau = t;
        break;
      }
    }

    // Nothing cleared the threshold. Fall back to the best lag available and
    // let MIN_CLARITY decide — this is the breathy-voice path.
    if (tau === -1) {
      let best = tauMin;
      for (let t = tauMin + 1; t <= tauMax; t++) {
        if (cmndf[t] < cmndf[best]) best = t;
      }
      tau = best;
    }

    const clarity = Math.min(1, Math.max(0, 1 - cmndf[tau]));
    if (clarity < MIN_CLARITY) return { hz: null, clarity };

    const hz = this.rate / this.refine(tau);
    if (hz < MIN_PITCH_HZ || hz > MAX_PITCH_HZ) return { hz: null, clarity };
    return { hz, clarity };
  }

  /**
   * Decimate by box-averaging, removing DC as we go.
   *
   * A box average is a crude anti-aliasing filter, but its first null sits at
   * the decimated rate, which is well above any fundamental we care about. DC
   * removal matters more than it looks: some phone mics carry a noticeable
   * offset, and an offset inflates the difference function uniformly and drags
   * clarity down across the board.
   */
  private decimate(input: Float32Array): void {
    const { x, factor } = this;
    let sum = 0;
    for (let i = 0; i < x.length; i++) {
      let acc = 0;
      const base = i * factor;
      for (let k = 0; k < factor; k++) acc += input[base + k];
      const v = acc / factor;
      x[i] = v;
      sum += v;
    }
    const mean = sum / x.length;
    if (mean !== 0) {
      for (let i = 0; i < x.length; i++) x[i] -= mean;
    }
  }

  /**
   * Parabolic interpolation across the three CMNDF values around `tau`.
   *
   * Without this, pitch is quantized to integer lags — at 12 kHz that's ~4 Hz
   * steps at 220 Hz and ~90 Hz steps at 900 Hz, which would render as a visibly
   * stepping readout on a perfectly steady note.
   */
  private refine(tau: number): number {
    if (tau <= 0 || tau >= this.tauMax) return tau;
    const prev = this.cmndf[tau - 1];
    const here = this.cmndf[tau];
    const next = this.cmndf[tau + 1];
    const denom = 2 * (2 * here - prev - next);
    if (denom === 0) return tau;
    const shift = (next - prev) / denom;
    // Guard against a degenerate fit throwing the estimate into a neighbour.
    return Math.abs(shift) < 1 ? tau + shift : tau;
  }
}

/** Root mean square of a time-domain window, 0..1. */
export function computeRms(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

/** Linear amplitude to dBFS, floored at -100 so silence isn't -Infinity. */
export function toDb(rms: number): number {
  return rms <= 1e-5 ? -100 : Math.max(-100, 20 * Math.log10(rms));
}
