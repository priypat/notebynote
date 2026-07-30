"use client";

/**
 * The real sing screen. Same ridge, same lyric layout, same phrase-cycle
 * feel as the Prompt 3 prototype — now driven by breathEngine.subscribe()
 * instead of a hardcoded fixture replay, and by a real song's phrases
 * instead of one looped demo line.
 *
 * `?source=fixture:steady-12s` (etc.) keeps the fixture path alive alongside
 * `mic` so this screen can be checked without a microphone — see
 * lib/audio/breathEngine.ts. Both paths push through the same render code
 * below; nothing here branches on which one is active.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MotionConfig, motion } from "motion/react";
import {
  breathEngine,
  micSupport,
  type BreathFrame,
  type BreathSource,
  type EngineState,
} from "@/lib/audio/breathEngine";
import type { Song } from "@/lib/types";
import { splitSustained } from "../lyricHelpers";
import { Ridge } from "../Ridge";

const SETTLE_SEC = 1.8;
const PAINT_MS = 60;

type Phase = "calibrating" | "waiting" | "sustaining" | "settling" | "done";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function SingScreen({ song, source }: { song: Song; source: BreathSource }) {
  const reducedMotion = usePrefersReducedMotion();

  const [started, setStarted] = useState(false);
  const [engineState, setEngineState] = useState<EngineState>("idle");
  const [phase, setPhase] = useState<Phase>("calibrating");
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [settleProgress, setSettleProgress] = useState(0);
  const [envelopeTick, setEnvelopeTick] = useState(0);
  const [counterSec, setCounterSec] = useState(0);

  const sourceRef = useRef<BreathSource>(source);
  const phaseRef = useRef<Phase>("calibrating");
  const phraseIdxRef = useRef(0);
  const envelopeRef = useRef<number[]>([]);
  const assumedTotalRef = useRef(240);
  const settleStartMsRef = useRef<number | null>(null);
  const latestFrameRef = useRef<BreathFrame | null>(null);

  useEffect(() => {
    // Fixtures don't need HTTPS or a mic; only fall back for a genuine mic
    // request in a browser that can't make one.
    if (sourceRef.current === "mic" && !micSupport().supported) {
      sourceRef.current = { fixture: "steady-12s", loop: false };
    }
  }, []);

  function advanceToPhrase(idx: number) {
    phraseIdxRef.current = idx;
    envelopeRef.current = [];
    if (idx >= song.phrases.length) {
      phaseRef.current = "done";
      breathEngine.stop();
      return;
    }
    if (typeof sourceRef.current === "object") {
      // A fixture is one hold-shaped clip — replay it fresh for each phrase.
      phaseRef.current = "calibrating";
      void breathEngine.start(sourceRef.current);
    } else {
      // The mic session just keeps running; only the phrase we're
      // listening against changes.
      phaseRef.current = "waiting";
    }
  }

  function handleBegin() {
    setStarted(true);
    phraseIdxRef.current = 0;
    envelopeRef.current = [];
    phaseRef.current = "calibrating";
    void breathEngine.start(sourceRef.current);
  }

  function handleUseFixtureInstead() {
    sourceRef.current = { fixture: "steady-12s", loop: false };
    handleBegin();
  }

  useEffect(() => {
    if (!started) return;

    const offFrames = breathEngine.subscribe((frame) => {
      latestFrameRef.current = frame;

      if (frame.calibrating) {
        phaseRef.current = "calibrating";
        return;
      }
      if (phaseRef.current === "calibrating") phaseRef.current = "waiting";

      if (phaseRef.current === "waiting") {
        if (frame.voiced) {
          phaseRef.current = "sustaining";
          envelopeRef.current = [];
          const phrase = song.phrases[phraseIdxRef.current];
          assumedTotalRef.current = Math.max(
            120,
            Math.round((phrase?.targetHoldSec ?? 4) * 60 * 1.4),
          );
        }
      } else if (phaseRef.current === "sustaining") {
        envelopeRef.current.push(frame.rms);
        if (envelopeRef.current.length > assumedTotalRef.current) {
          assumedTotalRef.current = Math.round(envelopeRef.current.length * 1.15);
        }
        if (!frame.voiced) {
          // Voicing stopped — reached the target or not, this is a soft
          // settle, never an interruption.
          phaseRef.current = "settling";
          settleStartMsRef.current = performance.now();
        }
      }
    });

    const offState = breathEngine.onStateChange(setEngineState);

    const paint = setInterval(() => {
      if (phaseRef.current === "settling" && settleStartMsRef.current !== null) {
        const elapsed = (performance.now() - settleStartMsRef.current) / 1000;
        setSettleProgress(Math.min(1, elapsed / SETTLE_SEC));
        if (elapsed >= SETTLE_SEC) {
          settleStartMsRef.current = null;
          advanceToPhrase(phraseIdxRef.current + 1);
        }
      } else if (phaseRef.current !== "settling") {
        setSettleProgress(0);
      }

      const frame = latestFrameRef.current;
      setCounterSec(
        phaseRef.current === "sustaining"
          ? (frame?.elapsedVoicedSec ?? 0)
          : phaseRef.current === "settling"
            ? (frame?.lastVoicedRunSec ?? 0)
            : 0,
      );

      setPhase(phaseRef.current);
      setPhraseIdx(phraseIdxRef.current);
      setEnvelopeTick((v) => v + 1);
    }, PAINT_MS);

    return () => {
      offFrames();
      offState();
      clearInterval(paint);
      breathEngine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, song]);

  const phrase = song.phrases[phraseIdx];
  const nextPhrase = song.phrases[phraseIdx + 1];
  const { lead, sustained } = useMemo(
    () => splitSustained(phrase?.lyric ?? ""),
    [phrase],
  );

  const envelope = useMemo(
    () => envelopeRef.current.slice(),
    // envelopeTick is the intentional trigger — the ref mutates in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [envelopeTick],
  );

  const settleAmount =
    phase === "waiting" ? 1 : phase === "settling" ? settleProgress : 0;

  const holdFillPct = phrase
    ? Math.min(100, (counterSec / phrase.targetHoldSec) * 100)
    : 0;

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-[calc(100dvh-2.5rem)] min-h-[560px] flex-col">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            aria-label="Exit singing"
            className="flex min-h-tap min-w-tap items-center justify-center rounded-token text-display-sm text-ink-muted"
          >
            <span aria-hidden="true">&times;</span>
          </Link>
          <p className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
            {song.title}
          </p>
        </header>

        {!started ? (
          <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            <p className="display text-display-sm text-ink">{song.title}</p>
            <p className="text-body text-ink-muted">{song.attribution}</p>
            <button
              type="button"
              onClick={handleBegin}
              className="mt-4 flex min-h-tap items-center justify-center rounded-token bg-action px-8 py-4 text-body font-medium text-on-action"
            >
              Begin singing
            </button>
          </section>
        ) : engineState === "denied" ? (
          <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="text-body text-ink">No microphone, no problem.</p>
            <p className="text-secondary text-ink-muted">
              Nothing was recorded. You can turn it back on in your browser
              settings whenever you like.
            </p>
            <button
              type="button"
              onClick={handleUseFixtureInstead}
              className="mt-2 flex min-h-tap items-center justify-center rounded-token bg-action px-6 py-3 text-body text-on-action"
            >
              Use a sample breath instead
            </button>
          </section>
        ) : engineState === "error" ? (
          <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="text-body text-ink">Something didn&rsquo;t start right.</p>
            <Link
              href="/"
              className="mt-2 flex min-h-tap items-center justify-center rounded-token border border-rule bg-surface px-6 py-3 text-body text-ink"
            >
              Back home
            </Link>
          </section>
        ) : phase === "done" ? (
          <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="display text-display-sm text-ink">Nicely sung.</p>
            <p className="text-body text-ink-muted">
              Take all the rest you like.
            </p>
            <Link
              href="/"
              className="mt-4 flex min-h-tap items-center justify-center rounded-token bg-action px-6 py-3 text-body text-on-action"
            >
              Back home
            </Link>
          </section>
        ) : (
          <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            <p className="numeral text-display-md text-ink" aria-live="off">
              {counterSec.toFixed(1)}
            </p>

            <div className="space-y-4 px-2">
              <p className="display text-display-sm leading-tight text-ink">
                {lead}{" "}
                <span className="relative inline-block">
                  {sustained}
                  <span
                    className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-rule"
                    style={{ width: `${holdFillPct}%` }}
                    aria-hidden="true"
                  />
                </span>
              </p>
              {nextPhrase && (
                <p className="text-secondary text-ink-muted">{nextPhrase.lyric}</p>
              )}
            </div>

            {phase === "calibrating" && (
              <p className="text-secondary text-ink-muted">Getting ready&hellip;</p>
            )}
            {phase === "waiting" && (
              <motion.div
                key="waiting-cue"
                animate={{ scale: [0.85, 1, 0.85], opacity: [0.4, 0.75, 0.4] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="size-16 rounded-full border border-rule bg-dawn-mist"
                aria-hidden="true"
              />
            )}
            {phase === "waiting" && (
              <p className="text-secondary text-ink-muted">Sing when you&rsquo;re ready</p>
            )}
            {phase === "sustaining" && (
              <p className="text-secondary text-ink-muted">
                Hold, for as long as feels good
              </p>
            )}
            {phase === "settling" && (
              <p className="text-secondary text-ink-muted">Rest here</p>
            )}
          </section>
        )}

        <section className="min-h-[42vh] flex-1 overflow-hidden rounded-token-lg">
          <Ridge
            envelope={envelope}
            assumedTotalFrames={assumedTotalRef.current}
            settleAmount={settleAmount}
            reducedMotion={reducedMotion}
          />
        </section>
      </div>
    </MotionConfig>
  );
}
