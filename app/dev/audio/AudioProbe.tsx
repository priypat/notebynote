"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  breathEngine,
  micSupport,
  FIXTURE_LIST,
  VOICING,
  type BreathFrame,
  type EngineState,
  type FixtureName,
} from "@/lib/audio/breathEngine";

/**
 * Raw engine readout. Dev-only — this is a probe, not product UI.
 *
 * Frames arrive at 60 Hz. React is re-rendered at 12 Hz from a ref instead,
 * because 60 re-renders a second would both be unreadable and measure the
 * probe's overhead rather than the engine's. The measured FPS below is counted
 * from actual frame arrivals, so it still tells you whether the engine is
 * really running at rate.
 */

type Hold = { index: number; sec: number };

const ROW_KEYS = [
  "t",
  "rms",
  "db",
  "pitchHz",
  "voiced",
  "elapsedVoicedSec",
  "silenceSec",
  "lastVoicedRunSec",
  "calibrating",
] as const;

export function AudioProbe() {
  const [state, setState] = useState<EngineState>(breathEngine.state);
  const [frame, setFrame] = useState<BreathFrame | null>(null);
  const [fps, setFps] = useState(0);
  const [count, setCount] = useState(0);
  const [peakDb, setPeakDb] = useState(-100);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [active, setActive] = useState<string | null>(null);

  const latest = useRef<BreathFrame | null>(null);
  const arrivals = useRef<number[]>([]);
  const total = useRef(0);
  const peak = useRef(-100);
  const lastRun = useRef(0);

  useEffect(() => {
    const offState = breathEngine.onStateChange(setState);
    const offFrames = breathEngine.subscribe((f) => {
      latest.current = f;
      total.current += 1;
      if (f.db > peak.current) peak.current = f.db;

      const now = performance.now();
      arrivals.current.push(now);
      while (arrivals.current.length > 0 && now - arrivals.current[0] > 1000) {
        arrivals.current.shift();
      }

      // A completed hold. This is the value a real screen would capture.
      if (f.lastVoicedRunSec !== lastRun.current) {
        lastRun.current = f.lastVoicedRunSec;
        setHolds((prev) => [
          ...prev,
          { index: prev.length + 1, sec: f.lastVoicedRunSec },
        ]);
      }
    });

    const paint = setInterval(() => {
      setFrame(latest.current);
      setFps(arrivals.current.length);
      setCount(total.current);
      setPeakDb(peak.current);
    }, 80);

    return () => {
      offState();
      offFrames();
      clearInterval(paint);
      // Never leave the microphone open because a page unmounted.
      breathEngine.stop();
    };
  }, []);

  const reset = useCallback(() => {
    latest.current = null;
    arrivals.current = [];
    total.current = 0;
    peak.current = -100;
    lastRun.current = 0;
    setFrame(null);
    setFps(0);
    setCount(0);
    setPeakDb(-100);
    setHolds([]);
  }, []);

  const startMic = useCallback(async () => {
    reset();
    setActive("mic");
    // Called straight from the click. Do not move this into an effect.
    await breathEngine.start("mic");
  }, [reset]);

  const startFixture = useCallback(
    async (name: FixtureName) => {
      reset();
      setActive(name);
      await breathEngine.start({ fixture: name, loop: false });
    },
    [reset],
  );

  const stop = useCallback(() => {
    breathEngine.stop();
    setActive(null);
  }, []);

  const support = micSupport();
  const thresholds = breathEngine.thresholds;
  const running = state === "running" || state === "requesting";

  return (
    <main className="space-y-8 pb-16">
      <header className="space-y-3">
        <p className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
          Dev probe
        </p>
        <h1 className="display text-display-sm">Breath engine</h1>
        <p className="text-secondary text-ink-muted">
          Raw frames from <code>lib/audio/breathEngine.ts</code>. Fixtures need
          no microphone and no HTTPS.
        </p>
      </header>

      {/* ---- source switcher ---- */}
      <section className="space-y-4 border-t border-rule pt-6">
        <h2 className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
          Source
        </h2>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={startMic}
            disabled={!support.supported}
            className="min-h-tap rounded-token bg-action px-5 py-3 text-body text-on-action disabled:opacity-45"
          >
            {active === "mic" ? "● Microphone" : "Microphone"}
          </button>
          <button
            type="button"
            onClick={stop}
            disabled={!running}
            className="min-h-tap rounded-token border border-rule bg-surface px-5 py-3 text-body text-ink disabled:opacity-45"
          >
            Stop
          </button>
        </div>

        {!support.supported && (
          <p className="text-secondary text-ink-muted">
            {support.reason === "insecure-context"
              ? "Microphone needs HTTPS or localhost. Fixtures work here regardless."
              : "This browser can't open a microphone. Fixtures work here regardless."}
          </p>
        )}

        <div className="grid gap-3">
          {FIXTURE_LIST.map((f) => (
            <button
              key={f.name}
              type="button"
              onClick={() => startFixture(f.name)}
              className={`min-h-tap rounded-token border px-5 py-3 text-left ${
                active === f.name
                  ? "border-action bg-surface"
                  : "border-rule bg-surface"
              }`}
            >
              <span className="block text-body text-ink">
                {active === f.name ? "● " : ""}
                {f.label}
                <span className="text-ink-muted">
                  {" "}
                  · {f.durationSec.toFixed(1)}s
                </span>
              </span>
              <span className="mt-1 block text-secondary text-ink-muted">
                {f.description}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ---- permission denied ---- */}
      {state === "denied" && (
        <section className="space-y-3 rounded-token-lg border border-rule bg-surface p-5">
          <p className="text-body text-ink">
            No microphone, no problem. Nothing was recorded.
          </p>
          <p className="text-secondary text-ink-muted">
            You can turn it back on in your browser settings whenever you like —
            or carry on with a fixture below. Everything works the same.
          </p>
          <button
            type="button"
            onClick={() => startFixture("steady-12s")}
            className="min-h-tap rounded-token bg-action px-5 py-3 text-body text-on-action"
          >
            Use a fixture instead
          </button>
        </section>
      )}

      {state === "error" && (
        <section className="rounded-token-lg border border-rule bg-surface p-5">
          <p className="text-body text-ink">Engine error</p>
          <p className="mt-2 font-mono text-secondary text-ink-muted">
            {breathEngine.lastError?.message ?? "unknown"}
          </p>
        </section>
      )}

      {/* ---- engine ---- */}
      <section className="space-y-4 border-t border-rule pt-6">
        <h2 className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
          Engine
        </h2>
        <Grid
          rows={[
            ["state", state],
            ["fps", `${fps}`],
            ["frames", `${count}`],
            ["peak db", peakDb === -100 ? "—" : peakDb.toFixed(1)],
            [
              "noise floor",
              thresholds ? `${thresholds.noiseFloorDb.toFixed(1)} dB` : "—",
            ],
            [
              "onset / release",
              thresholds
                ? `${thresholds.onsetDb.toFixed(1)} / ${thresholds.releaseDb.toFixed(1)} dB`
                : "—",
            ],
            ["release hold", `${VOICING.releaseHoldSec * 1000} ms`],
          ]}
        />
      </section>

      {/* ---- frame ---- */}
      <section className="space-y-4 border-t border-rule pt-6">
        <h2 className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
          Latest frame
        </h2>

        {frame ? (
          <>
            <Grid rows={ROW_KEYS.map((k) => [k, format(frame, k)])} />
            {/* A bare amplitude bar — enough to see a wobble, not a waveform. */}
            <div
              className="h-2 w-full overflow-hidden rounded-token bg-dawn-mist"
              aria-hidden="true"
            >
              <div
                className="h-full bg-ink transition-[width] duration-75"
                style={{ width: `${Math.min(100, frame.rms * 900)}%` }}
              />
            </div>
            <p className="text-secondary text-ink-muted">
              rms, linear, ×9 for visibility. Not a product visualization.
            </p>
          </>
        ) : (
          <p className="text-secondary text-ink-muted">
            No frames yet. Pick a source above.
          </p>
        )}
      </section>

      {/* ---- completed holds ---- */}
      <section className="space-y-4 border-t border-rule pt-6">
        <h2 className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
          Completed holds
        </h2>
        {holds.length === 0 ? (
          <p className="text-secondary text-ink-muted">
            None yet. Each finished voiced run lands here — this is what a phrase
            result would capture.
          </p>
        ) : (
          <Grid
            rows={holds.map((h) => [`hold ${h.index}`, `${h.sec.toFixed(2)} s`])}
          />
        )}
      </section>
    </main>
  );
}

function Grid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-rule border-y border-rule">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between py-2.5">
          <dt className="text-secondary text-ink-muted">{label}</dt>
          <dd className="font-mono text-secondary text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function format(frame: BreathFrame, key: (typeof ROW_KEYS)[number]): string {
  const v = frame[key];
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v === null) return "null";
  if (key === "rms") return v.toFixed(5);
  if (key === "pitchHz") return `${v.toFixed(1)} Hz`;
  return v.toFixed(3);
}
