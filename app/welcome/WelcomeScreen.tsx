"use client";

/**
 * Onboarding: three short screens on what this is and what happens to your
 * voice, then a calibration take. This is where mic permission is first
 * requested — see the "denied" branch below, which must never re-prompt or
 * guilt-trip, and always offers a way to keep going regardless.
 *
 * Framing matters more than the number here: this finds a comfortable
 * starting point, not a test, and there is no wrong result. `baselineMptSec`
 * is never shown next to any population figure, and skipping entirely sets
 * a conservative default rather than blocking onboarding on a microphone.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MotionConfig, motion } from "motion/react";
import {
  breathEngine,
  micSupport,
  type BreathFrame,
  type BreathSource,
  type EngineState,
} from "@/lib/audio/breathEngine";
import { updateProfile } from "@/lib/api";

/** A modest, deliberately low starting point — see design-tokens.md and
 *  API_CONTRACT.md: roughly 8–15s is typical for this audience. Erring low
 *  means an early real hold reads as strong progress, never as falling
 *  short of a number nobody chose. */
const DEFAULT_BASELINE_SEC = 8;

type Step = "intro1" | "intro2" | "intro3" | "calibrate" | "done";
const STEPS: Step[] = ["intro1", "intro2", "intro3", "calibrate", "done"];

type CalPhase =
  | "start"
  | "calibrating"
  | "waiting"
  | "holding"
  | "captured"
  | "saving"
  | "save-error";

export function WelcomeScreen({ source }: { source: BreathSource }) {
  const [step, setStep] = useState<Step>("intro1");
  const [calPhase, setCalPhase] = useState<CalPhase>("start");
  const [engineState, setEngineState] = useState<EngineState>("idle");
  const [counterSec, setCounterSec] = useState(0);
  const [capturedSec, setCapturedSec] = useState(0);
  const [saveErrorMessage, setSaveErrorMessage] = useState("");
  const [usedDefault, setUsedDefault] = useState(false);

  const sourceRef = useRef<BreathSource>(source);
  const calPhaseRef = useRef<CalPhase>("start");
  const capturedSecRef = useRef(0);
  const latestFrameRef = useRef<BreathFrame | null>(null);

  useEffect(() => {
    if (sourceRef.current === "mic" && !micSupport().supported) {
      sourceRef.current = { fixture: "steady-12s", loop: false };
    }
  }, []);

  async function saveBaseline(sec: number, { skipped = false } = {}) {
    calPhaseRef.current = "saving";
    setCalPhase("saving");
    breathEngine.stop();
    try {
      await updateProfile({ baselineMptSec: sec });
      setCapturedSec(sec);
      setUsedDefault(skipped);
      setStep("done");
    } catch (err) {
      calPhaseRef.current = "save-error";
      setCalPhase("save-error");
      setSaveErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function handleSkip() {
    void saveBaseline(DEFAULT_BASELINE_SEC, { skipped: true });
  }

  function handleBeginCalibration() {
    setStep("calibrate");
    calPhaseRef.current = "calibrating";
    setCalPhase("calibrating");
    void breathEngine.start(sourceRef.current);
  }

  function handleTryAgain() {
    calPhaseRef.current = "calibrating";
    setCalPhase("calibrating");
    void breathEngine.start(sourceRef.current);
  }

  function handleUseThis() {
    void saveBaseline(capturedSecRef.current);
  }

  useEffect(() => {
    if (step !== "calibrate") return;

    const offFrames = breathEngine.subscribe((frame) => {
      latestFrameRef.current = frame;

      if (frame.calibrating) {
        calPhaseRef.current = "calibrating";
        return;
      }
      if (calPhaseRef.current === "calibrating") calPhaseRef.current = "waiting";

      if (calPhaseRef.current === "waiting" && frame.voiced) {
        calPhaseRef.current = "holding";
      } else if (calPhaseRef.current === "holding" && !frame.voiced) {
        capturedSecRef.current = frame.lastVoicedRunSec;
        calPhaseRef.current = "captured";
        breathEngine.stop();
      }
    });

    const offState = breathEngine.onStateChange(setEngineState);

    const paint = setInterval(() => {
      const frame = latestFrameRef.current;
      setCounterSec(
        calPhaseRef.current === "holding" ? (frame?.elapsedVoicedSec ?? 0) : 0,
      );
      setCalPhase(calPhaseRef.current);
      if (calPhaseRef.current === "captured") setCapturedSec(capturedSecRef.current);
    }, 60);

    return () => {
      offFrames();
      offState();
      clearInterval(paint);
      breathEngine.stop();
    };
  }, [step]);

  const stepIndex = STEPS.indexOf(step);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-[calc(100dvh-2.5rem)] min-h-[560px] flex-col">
        <header className="flex items-center justify-end">
          {step !== "done" && (
            <button
              type="button"
              onClick={handleSkip}
              className="flex min-h-tap items-center text-secondary text-ink-muted underline"
            >
              Skip for now
            </button>
          )}
        </header>

        <section className="flex flex-1 flex-col items-center justify-center gap-6 px-2 text-center">
          {step === "intro1" && (
            <>
              <p className="display text-display-md text-ink">Breathe out a melody.</p>
              <p className="max-w-[24rem] text-body text-ink-muted">
                Sing along to real songs, and watch your breath draw a
                landscape as you go. This is a practice, not a performance —
                there&rsquo;s no wrong way to do it.
              </p>
              <button
                type="button"
                onClick={() => setStep("intro2")}
                className="mt-4 flex min-h-tap items-center justify-center rounded-token bg-action px-8 py-4 text-body font-medium text-on-action"
              >
                Continue
              </button>
            </>
          )}

          {step === "intro2" && (
            <>
              <p className="display text-display-md text-ink">
                Audio only. No camera, ever.
              </p>
              <p className="max-w-[24rem] text-body text-ink-muted">
                We listen through your microphone while you sing — that&rsquo;s
                it. There&rsquo;s no camera, and there never will be.
              </p>
              <button
                type="button"
                onClick={() => setStep("intro3")}
                className="mt-4 flex min-h-tap items-center justify-center rounded-token bg-action px-8 py-4 text-body font-medium text-on-action"
              >
                Continue
              </button>
            </>
          )}

          {step === "intro3" && (
            <>
              <p className="display text-display-md text-ink">Nothing is recorded.</p>
              <p className="max-w-[24rem] text-body text-ink-muted">
                Your voice is analyzed in the moment and then it&rsquo;s gone.
                We keep two numbers from each note — how long you held it, and
                how steady it was — never audio, never a transcript.
              </p>
              <button
                type="button"
                onClick={() => setStep("calibrate")}
                className="mt-4 flex min-h-tap items-center justify-center rounded-token bg-action px-8 py-4 text-body font-medium text-on-action"
              >
                Continue
              </button>
            </>
          )}

          {step === "calibrate" && (
            <CalibrateStep
              phase={calPhase}
              engineState={engineState}
              counterSec={counterSec}
              capturedSec={capturedSec}
              saveErrorMessage={saveErrorMessage}
              onBegin={handleBeginCalibration}
              onTryAgain={handleTryAgain}
              onUseThis={handleUseThis}
              onSkip={handleSkip}
            />
          )}

          {step === "done" && (
            <>
              <p className="display text-display-md text-ink">
                {usedDefault ? "All set." : "Got it."}
              </p>
              <p className="max-w-[24rem] text-body text-ink-muted">
                {usedDefault
                  ? "We've set a comfortable starting point for you. You can measure for real anytime — nothing here is permanent."
                  : `${formatSec(capturedSec)} seconds feels like a good place to start. You can always redo this later — nothing here is permanent.`}
              </p>
              <Link
                href="/"
                className="mt-4 flex min-h-tap items-center justify-center rounded-token bg-action px-8 py-4 text-body font-medium text-on-action"
              >
                Start singing
              </Link>
            </>
          )}
        </section>

        {/* ---- progress dots ---- */}
        <div className="flex items-center justify-center gap-2 pb-2" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`size-2 rounded-full ${i === stepIndex ? "bg-action" : "bg-rule"}`}
            />
          ))}
        </div>
      </div>
    </MotionConfig>
  );
}

function formatSec(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

function CalibrateStep({
  phase,
  engineState,
  counterSec,
  capturedSec,
  saveErrorMessage,
  onBegin,
  onTryAgain,
  onUseThis,
  onSkip,
}: {
  phase: CalPhase;
  engineState: EngineState;
  counterSec: number;
  capturedSec: number;
  saveErrorMessage: string;
  onBegin: () => void;
  onTryAgain: () => void;
  onUseThis: () => void;
  onSkip: () => void;
}) {
  if (engineState === "denied") {
    return (
      <>
        <p className="text-body text-ink">No microphone, no problem.</p>
        <p className="max-w-[24rem] text-secondary text-ink-muted">
          Nothing was recorded. You can turn it back on in your browser
          settings whenever you like — for now, we&rsquo;ll start you at a
          comfortable default.
        </p>
        <button
          type="button"
          onClick={onSkip}
          className="mt-2 flex min-h-tap items-center justify-center rounded-token bg-action px-6 py-3 text-body text-on-action"
        >
          Continue with a default
        </button>
      </>
    );
  }

  if (engineState === "error") {
    return (
      <>
        <p className="text-body text-ink">Something didn&rsquo;t start right.</p>
        <button
          type="button"
          onClick={onSkip}
          className="mt-2 flex min-h-tap items-center justify-center rounded-token bg-action px-6 py-3 text-body text-on-action"
        >
          Continue with a default
        </button>
      </>
    );
  }

  if (phase === "save-error") {
    return (
      <>
        <p className="text-body text-ink">Couldn&rsquo;t save that just now.</p>
        <p className="text-secondary text-ink-muted">{saveErrorMessage}</p>
        <button
          type="button"
          onClick={onUseThis}
          className="mt-2 flex min-h-tap items-center justify-center rounded-token bg-action px-6 py-3 text-body text-on-action"
        >
          Try again
        </button>
      </>
    );
  }

  if (phase === "start") {
    return (
      <>
        <p className="display text-display-sm text-ink">
          Let&rsquo;s find a comfortable starting point.
        </p>
        <p className="max-w-[24rem] text-body text-ink-muted">
          Not a test — there&rsquo;s no wrong number here. Sing a comfortable
          &ldquo;ahh&rdquo; and hold it for as long as feels easy, then just
          stop.
        </p>
        <button
          type="button"
          onClick={onBegin}
          className="mt-4 flex min-h-tap items-center justify-center rounded-token bg-action px-8 py-4 text-body font-medium text-on-action"
        >
          Begin
        </button>
      </>
    );
  }

  if (phase === "captured") {
    return (
      <>
        <p className="numeral text-display-lg text-ink">{formatSec(capturedSec)}</p>
        <p className="text-body text-ink-muted">Nicely done.</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onUseThis}
            className="flex min-h-tap items-center justify-center rounded-token bg-action px-6 py-3 text-body text-on-action"
          >
            Use this
          </button>
          <button
            type="button"
            onClick={onTryAgain}
            className="flex min-h-tap items-center justify-center rounded-token border border-rule bg-surface px-6 py-3 text-body text-ink"
          >
            Try again
          </button>
        </div>
      </>
    );
  }

  if (phase === "saving") {
    return (
      <>
        <div className="size-12 animate-pulse rounded-full bg-dawn-mist" />
        <p className="text-secondary text-ink-muted">Saving&hellip;</p>
      </>
    );
  }

  // calibrating / waiting / holding
  return (
    <>
      <p className="numeral text-display-md text-ink" aria-live="off">
        {counterSec.toFixed(1)}
      </p>
      {phase === "calibrating" && (
        <p className="text-secondary text-ink-muted">Getting ready&hellip;</p>
      )}
      {phase === "waiting" && (
        <>
          <motion.div
            key="waiting-cue"
            animate={{ scale: [0.85, 1, 0.85], opacity: [0.4, 0.75, 0.4] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="size-16 rounded-full border border-rule bg-dawn-mist"
            aria-hidden="true"
          />
          <p className="text-secondary text-ink-muted">
            Sing &ldquo;ahh&rdquo; whenever you&rsquo;re ready
          </p>
        </>
      )}
      {phase === "holding" && (
        <p className="text-secondary text-ink-muted">Hold, for as long as feels good</p>
      )}
    </>
  );
}
