/**
 * The only file in this app that touches Web Audio.
 *
 * No component may call `getUserMedia`, construct an `AudioContext`, or reach
 * for an `AnalyserNode`. They subscribe here and receive `BreathFrame`s at about
 * 60 Hz, from a live microphone or from a fixture, with no way to tell which.
 *
 * ## Using it
 *
 * ```ts
 * const off = breathEngine.subscribe((frame) => { ... });
 * await breathEngine.start("mic");            // must be inside a user gesture
 * if (breathEngine.state === "denied") {      // not an exception — a choice
 *   await breathEngine.start({ fixture: "steady-12s" });
 * }
 * // later
 * breathEngine.stop();
 * off();
 * ```
 *
 * ## Two rules that will bite if broken
 *
 * **`start("mic")` must be called synchronously from a real user gesture** — a
 * click or a tap, not a `useEffect`, not a timeout. Mobile Safari will not
 * resume a suspended `AudioContext` outside a gesture, and it does not report an
 * error when it refuses: frames simply arrive as digital silence forever. The
 * context is constructed before the first `await` here for exactly this reason.
 *
 * **`getUserMedia` needs a secure context.** HTTPS or `localhost`; on a plain
 * `http://` LAN address `navigator.mediaDevices` is undefined. See the README
 * for how to run it on a phone.
 *
 * ## Privacy
 *
 * Audio is analysed in a rolling window and discarded. Nothing is recorded, no
 * buffer outlives the frame it produced, and nothing is transmitted. Frames
 * carry derived numbers only. `stop()` releases the microphone track and closes
 * the context — call it, or the recording indicator stays on.
 */

import type {
  BreathFrame,
  BreathSource,
  EngineState,
  FixtureName,
  FrameListener,
  StateListener,
} from "./types";
import { FrameBuilder, VOICING, type Thresholds } from "./frames";
import { PitchDetector, computeRms, toDb } from "./pitch";
import { FIXTURE_FRAME_RATE, getFixture, type FixtureSample } from "./fixtures";

export type { BreathFrame, BreathSource, EngineState, FixtureName };
export { VOICING };
export {
  FIXTURES,
  FIXTURE_LIST,
  FIXTURE_NAMES,
  getFixture,
} from "./fixtures";
export { MIN_PITCH_HZ, MAX_PITCH_HZ } from "./pitch";

/**
 * 2048 samples — about 43 ms at 48 kHz.
 *
 * Long enough to resolve a 70 Hz fundamental (which needs two periods, ~29 ms)
 * and short enough that the RMS still tracks a real amplitude wobble. Windows
 * overlap heavily at 60 fps, which smooths the envelope for free.
 */
const FFT_SIZE = 2048;

const TARGET_FPS = 60;

/**
 * `getFloatTimeDomainData` requires a view backed by a plain ArrayBuffer, not
 * the `ArrayBufferLike` a bare `Float32Array` annotation widens to.
 */
type TimeDomainBuffer = Float32Array<ArrayBuffer>;

type ActiveSource =
  | { kind: "mic" }
  | { kind: "fixture"; name: FixtureName; loop: boolean };

class BreathEngine {
  private currentState: EngineState = "idle";
  private frameListeners = new Set<FrameListener>();
  private stateListeners = new Set<StateListener>();

  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private micNode: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timeBuffer: TimeDomainBuffer | null = null;
  private detector: PitchDetector | null = null;

  private builder = new FrameBuilder();
  private activeSource: ActiveSource | null = null;
  private fixtureSamples: FixtureSample[] | null = null;

  private rafId: number | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private startedAtMs = 0;
  private error: Error | null = null;
  private latest: BreathFrame | null = null;

  // -- introspection --------------------------------------------------------

  get state(): EngineState {
    return this.currentState;
  }

  /** Null until the opening calibration finishes. */
  get thresholds(): Thresholds | null {
    return this.builder.getThresholds();
  }

  /** The most recent frame, for a late subscriber that needs something now. */
  get lastFrame(): BreathFrame | null {
    return this.latest;
  }

  get lastError(): Error | null {
    return this.error;
  }

  get source(): ActiveSource | null {
    return this.activeSource;
  }

  /** Whether a live microphone is possible at all in this browser and context. */
  static get micSupport(): {
    supported: boolean;
    reason: "ok" | "no-window" | "insecure-context" | "no-api";
  } {
    if (typeof window === "undefined") {
      return { supported: false, reason: "no-window" };
    }
    // Order matters: on plain http:// mediaDevices is simply absent, and
    // "your browser doesn't support this" would be the wrong thing to say.
    if (!window.isSecureContext) {
      return { supported: false, reason: "insecure-context" };
    }
    if (!navigator.mediaDevices?.getUserMedia || !audioContextCtor()) {
      return { supported: false, reason: "no-api" };
    }
    return { supported: true, reason: "ok" };
  }

  // -- subscription ---------------------------------------------------------

  /** Returns an unsubscribe function. Safe to call after `stop()`. */
  subscribe(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /**
   * State changes. Not in the original sketch, but a screen has to react to
   * `denied` and `error` somehow, and polling `state` at 60 Hz is not that.
   */
  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  // -- lifecycle ------------------------------------------------------------

  /**
   * Start producing frames.
   *
   * Resolves once frames are flowing, or once the attempt has settled into
   * `denied` or `error`. **It does not reject on permission denial** — saying no
   * to a microphone is an ordinary choice, not an exception, and a rejection
   * here would push every caller into a try/catch that then has to distinguish
   * "declined" from "broken". Check `state` afterwards.
   */
  async start(source: BreathSource): Promise<void> {
    this.stop();
    this.error = null;
    this.builder.reset();
    this.latest = null;

    if (typeof source === "object") {
      return this.startFixture(source.fixture, source.loop ?? false);
    }
    return this.startMic();
  }

  /**
   * Release everything. Idempotent, and safe to call from a cleanup function.
   *
   * Stopping the MediaStreamTrack is the part that matters: closing the
   * AudioContext alone leaves the track live and the browser's recording
   * indicator on, which for an app about breathing is an unacceptable thing to
   * leave running.
   */
  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;

    this.micNode?.disconnect();
    this.micNode = null;
    this.analyser?.disconnect();
    this.analyser = null;

    if (this.ctx && this.ctx.state !== "closed") {
      void this.ctx.close().catch(() => {
        // Already closing. Nothing useful to do.
      });
    }
    this.ctx = null;

    this.timeBuffer = null;
    this.detector = null;
    this.fixtureSamples = null;
    this.activeSource = null;

    if (this.currentState !== "denied" && this.currentState !== "error") {
      this.setState("idle");
    }
  }

  // -- microphone -----------------------------------------------------------

  private async startMic(): Promise<void> {
    const support = BreathEngine.micSupport;
    if (!support.supported) {
      this.fail(
        new Error(
          support.reason === "insecure-context"
            ? "The microphone needs HTTPS. Open this over https:// or on localhost."
            : "This browser can't open a microphone.",
        ),
      );
      return;
    }

    this.setState("requesting");

    // Constructed before the first await so we are still inside the user
    // gesture. Safari will not resume it otherwise.
    const Ctor = audioContextCtor();
    if (!Ctor) {
      this.fail(new Error("This browser can't open a microphone."));
      return;
    }
    const ctx = new Ctor();
    this.ctx = ctx;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // All three of these must be off. They are designed to make speech
          // intelligible on a call, and they do it by flattening exactly the
          // amplitude envelope this app measures — automatic gain control would
          // turn a fading note into a steady one, and noise suppression would
          // gate the quiet tail of a hold into silence.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
        video: false, // audio only, always
      });
    } catch (err) {
      // Clean up the context we optimistically opened.
      void ctx.close().catch(() => {});
      this.ctx = null;

      if (isPermissionDenial(err)) {
        this.setState("denied");
      } else {
        this.fail(asError(err));
      }
      return;
    }

    this.stream = stream;

    try {
      // Safari suspends new contexts; without this frames are silent.
      if (ctx.state === "suspended") await ctx.resume();

      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      // We read the time domain, which is never smoothed — but a non-zero value
      // here would smooth any future frequency-domain read, so pin it.
      analyser.smoothingTimeConstant = 0;

      const micNode = ctx.createMediaStreamSource(stream);
      // Deliberately NOT connected to ctx.destination. An AnalyserNode is a
      // pass-through, so connecting it would play the microphone back through
      // the speakers and immediately feed back.
      micNode.connect(analyser);

      this.micNode = micNode;
      this.analyser = analyser;
      this.timeBuffer = new Float32Array(analyser.fftSize);
      this.detector = new PitchDetector(ctx.sampleRate, analyser.fftSize);
      this.activeSource = { kind: "mic" };

      this.setState("ready");
      this.beginLoop();
    } catch (err) {
      this.fail(asError(err));
    }
  }

  private readMicFrame(t: number): BreathFrame {
    const analyser = this.analyser!;
    const buffer = this.timeBuffer!;
    analyser.getFloatTimeDomainData(buffer);

    const rms = computeRms(buffer);

    // Skip pitch detection when the window is clearly below anything that could
    // be voiced. It is the expensive half of the frame and the answer would be
    // discarded anyway.
    const thresholds = this.builder.getThresholds();
    const worthAnalysing =
      thresholds === null || toDb(rms) >= thresholds.releaseDb;
    const pitch = worthAnalysing ? this.detector!.detect(buffer).hz : null;

    return this.builder.push(t, rms, pitch);
  }

  // -- fixtures -------------------------------------------------------------

  private async startFixture(name: FixtureName, loop: boolean): Promise<void> {
    const fixture = getFixture(name);
    if (!fixture) {
      this.fail(new Error(`No fixture named "${name}".`));
      return;
    }

    // No AudioContext, no permission, no secure context needed. This path works
    // on http://, in Node, and in CI.
    this.fixtureSamples = fixture.samples;
    this.activeSource = { kind: "fixture", name, loop };

    this.setState("ready");
    this.beginLoop();
  }

  private readFixtureFrame(t: number): BreathFrame | null {
    const samples = this.fixtureSamples!;
    const source = this.activeSource as {
      kind: "fixture";
      name: FixtureName;
      loop: boolean;
    };

    // Indexed by elapsed wall-clock time rather than by a frame counter, so a
    // dropped frame skips ahead instead of stretching the fixture out. A 12
    // second hold has to take 12 seconds even on a struggling device, or the
    // measured durations stop meaning anything.
    const index = Math.round(t * FIXTURE_FRAME_RATE);

    if (index >= samples.length) {
      if (!source.loop) return null;
      // Restart from the top: reset the clock and the voicing state so
      // calibration re-runs and `t` stays meaningful instead of climbing
      // forever. The next tick reads index 0 normally.
      this.startedAtMs = now();
      this.builder.reset();
      const first = samples[0];
      return this.builder.push(0, first.rms, first.pitchHz);
    }

    const sample = samples[index];
    return this.builder.push(t, sample.rms, sample.pitchHz);
  }

  // -- the loop -------------------------------------------------------------

  private beginLoop(): void {
    this.startedAtMs = now();
    this.setState("running");

    const tick = () => {
      if (this.currentState !== "running") return;

      const t = (now() - this.startedAtMs) / 1000;
      let frame: BreathFrame | null;

      try {
        frame =
          this.activeSource?.kind === "mic"
            ? this.readMicFrame(t)
            : this.readFixtureFrame(t);
      } catch (err) {
        this.fail(asError(err));
        return;
      }

      // A fixture that has run out. Stop cleanly rather than emitting silence.
      if (frame === null) {
        this.stop();
        return;
      }

      this.latest = frame;
      for (const listener of this.frameListeners) {
        try {
          listener(frame);
        } catch {
          // A broken subscriber must not take the engine down with it, and must
          // not stop the other subscribers from getting their frame.
        }
      }

      schedule();
    };

    // requestAnimationFrame keeps analysis on the same cadence as painting, so
    // a frame is never analysed twice for one rendered ridge. setInterval is the
    // fallback for Node and for anywhere rAF is missing.
    const schedule =
      typeof requestAnimationFrame === "function"
        ? () => {
            this.rafId = requestAnimationFrame(tick);
          }
        : () => {
            /* interval already running */
          };

    if (typeof requestAnimationFrame === "function") {
      schedule();
    } else {
      this.intervalId = setInterval(tick, 1000 / TARGET_FPS);
    }
  }

  // -- state ----------------------------------------------------------------

  private setState(next: EngineState): void {
    if (this.currentState === next) return;
    this.currentState = next;
    for (const listener of this.stateListeners) {
      try {
        listener(next);
      } catch {
        // As above — one bad listener shouldn't break the rest.
      }
    }
  }

  private fail(err: Error): void {
    this.error = err;
    this.setState("error");
  }
}

// ---------------------------------------------------------------------------

function audioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  );
}

/**
 * A denial can arrive as any of these depending on the browser. `SecurityError`
 * is Safari's, and `DOMException` name checks are more reliable than message
 * matching across versions.
 */
function isPermissionDenial(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === "NotAllowedError" ||
    err.name === "PermissionDeniedError" ||
    err.name === "SecurityError"
  );
}

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Module singleton. There is one microphone, so there is one engine — two
 * instances would race for the device and the second would get silence.
 */
export const breathEngine = new BreathEngine();

/** Static support probe, re-exported so callers don't need the class. */
export const micSupport = () => BreathEngine.micSupport;
