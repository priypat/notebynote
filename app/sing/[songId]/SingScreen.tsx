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
 *
 * Each completed phrase is scored for real via lib/scoring/breathScore.ts
 * from its own frames, and reaching the end of the song calls
 * lib/api/'s createTake() and redirects to the real /take/[id] it returns.
 * Exiting mid-session via the × does not yet record a "stopped-early" take
 * — that's a real, supported completion per API_CONTRACT.md, just not
 * wired up here yet.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { MotionConfig, motion } from "motion/react";
import {
  breathEngine,
  micSupport,
  type BreathFrame,
  type BreathSource,
  type EngineState,
} from "@/lib/audio/breathEngine";
import type { PhraseResult, Song, TakeDraft } from "@/lib/types";
import { createTake } from "@/lib/api";
import { scorePhrase } from "@/lib/scoring/breathScore";
import { fixtureForDemoPhrase } from "@/lib/demo/script";
import { ensureDemoHistorySeeded } from "@/lib/demo/seed";
import { usePrefersReducedMotion } from "../../useReducedMotion";
import { splitSustained } from "../lyricHelpers";
import { Ridge } from "../Ridge";

/** Rescues a live mic session mid-song without a mouse — see README.md's
 *  "Demo mode" section. Only fires while a real mic session is running. */
const RESCUE_KEY = "f";

const SETTLE_SEC = 1.8;
const PAINT_MS = 60;

type Phase =
  | "calibrating"
  | "waiting"
  | "sustaining"
  | "settling"
  | "saving"
  | "save-error";

export function SingScreen({
  song,
  source,
  demo = false,
}: {
  song: Song;
  source: BreathSource;
  /** ?demo=1 — see README.md. Scripts each phrase's fixture and auto-starts;
   *  every other code path (state machine, scoring, createTake, redirect,
   *  rendering) is identical to a real take. */
  demo?: boolean;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const router = useRouter();

  const [started, setStarted] = useState(false);
  const [engineState, setEngineState] = useState<EngineState>("idle");
  const [phase, setPhase] = useState<Phase>("calibrating");
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [settleProgress, setSettleProgress] = useState(0);
  const [envelopeTick, setEnvelopeTick] = useState(0);
  const [counterSec, setCounterSec] = useState(0);
  const [saveErrorMessage, setSaveErrorMessage] = useState("");

  const sourceRef = useRef<BreathSource>(source);
  const phaseRef = useRef<Phase>("calibrating");
  const phraseIdxRef = useRef(0);
  const envelopeRef = useRef<number[]>([]);
  const assumedTotalRef = useRef(240);
  const settleStartMsRef = useRef<number | null>(null);
  const latestFrameRef = useRef<BreathFrame | null>(null);
  /** Every frame of the current phrase's hold, plus the settle-period tail —
   *  what scorePhrase needs to compute a real PhraseResult. */
  const phraseFramesRef = useRef<BreathFrame[]>([]);
  /** One real, scored PhraseResult per phrase completed this session. */
  const resultsRef = useRef<PhraseResult[]>([]);
  const startedAtRef = useRef<string>("");

  useEffect(() => {
    // Fixtures don't need HTTPS or a mic; only fall back for a genuine mic
    // request in a browser that can't make one.
    if (sourceRef.current === "mic" && !micSupport().supported) {
      sourceRef.current = { fixture: "steady-12s", loop: false };
    }
  }, []);

  async function finishTake() {
    phaseRef.current = "saving";
    setPhase("saving");
    breathEngine.stop();

    // finishTake only runs once every phrase has settled, so this is always
    // "finished" today — exiting mid-session via the × doesn't yet record a
    // "stopped-early" take (see SingScreen's file comment).
    const draft: TakeDraft = {
      songId: song.id,
      startedAt: startedAtRef.current,
      endedAt: new Date().toISOString(),
      completion: "finished",
      phrases: resultsRef.current,
    };

    try {
      const take = await createTake(draft);
      router.push(`/take/${take.id}`);
    } catch (err) {
      phaseRef.current = "save-error";
      setPhase("save-error");
      setSaveErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function advanceToPhrase(idx: number) {
    phraseIdxRef.current = idx;
    envelopeRef.current = [];
    if (idx >= song.phrases.length) {
      void finishTake();
      return;
    }
    if (typeof sourceRef.current === "object") {
      // A fixture is one hold-shaped clip — replay it fresh for each phrase.
      // Demo mode additionally scripts *which* fixture per phrase.
      if (demo) {
        sourceRef.current = {
          fixture: fixtureForDemoPhrase(idx, song.phrases.length),
          loop: false,
        };
      }
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
    phraseFramesRef.current = [];
    resultsRef.current = [];
    startedAtRef.current = new Date().toISOString();
    phaseRef.current = "calibrating";
    if (demo) {
      sourceRef.current = {
        fixture: fixtureForDemoPhrase(0, song.phrases.length),
        loop: false,
      };
    }
    void breathEngine.start(sourceRef.current);
  }

  /** The keyboard rescue and demo mode both land here: keep the current
   *  phrase and everything already scored, just swap the input source. */
  function handleSwitchToFixture() {
    if (typeof sourceRef.current === "object") return; // already on a fixture
    sourceRef.current = { fixture: "steady-12s", loop: false };
    phaseRef.current = "calibrating";
    setPhase("calibrating");
    envelopeRef.current = [];
    phraseFramesRef.current = [];
    void breathEngine.start(sourceRef.current);
  }

  // Demo mode: seed a few months of history behind /progress, then start
  // immediately — fixtures need no gesture, so there's nothing to tap.
  useEffect(() => {
    if (!demo) return;
    void ensureDemoHistorySeeded();
    handleBegin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);

  // A mic failure on stage is recoverable in one keystroke.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== RESCUE_KEY) return;
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) {
        return;
      }
      if (!started || typeof sourceRef.current === "object") return;
      handleSwitchToFixture();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [started]);

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
          phraseFramesRef.current = [];
          const phrase = song.phrases[phraseIdxRef.current];
          assumedTotalRef.current = Math.max(
            120,
            Math.round((phrase?.targetHoldSec ?? 4) * 60 * 1.4),
          );
        }
      } else if (phaseRef.current === "sustaining") {
        envelopeRef.current.push(frame.rms);
        phraseFramesRef.current.push(frame);
        if (envelopeRef.current.length > assumedTotalRef.current) {
          assumedTotalRef.current = Math.round(envelopeRef.current.length * 1.15);
        }
        if (!frame.voiced) {
          // Voicing stopped — reached the target or not, this is a soft
          // settle, never an interruption.
          phaseRef.current = "settling";
          settleStartMsRef.current = performance.now();
        }
      } else if (phaseRef.current === "settling") {
        // A little trailing silence, so scorePhrase has something real to
        // measure recoverySec from.
        phraseFramesRef.current.push(frame);
      }
    });

    const offState = breathEngine.onStateChange(setEngineState);

    const paint = setInterval(() => {
      if (phaseRef.current === "settling" && settleStartMsRef.current !== null) {
        const elapsed = (performance.now() - settleStartMsRef.current) / 1000;
        setSettleProgress(Math.min(1, elapsed / SETTLE_SEC));
        if (elapsed >= SETTLE_SEC) {
          settleStartMsRef.current = null;
          const finishedPhrase = song.phrases[phraseIdxRef.current];
          if (finishedPhrase) {
            resultsRef.current.push(
              scorePhrase(phraseFramesRef.current, finishedPhrase.id),
            );
          }
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
        ) : phase === "saving" ? (
          <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="display text-display-sm text-ink">Nicely sung.</p>
            <div className="size-12 animate-pulse rounded-full bg-dawn-mist" />
            <p className="text-secondary text-ink-muted">Saving your session&hellip;</p>
          </section>
        ) : phase === "save-error" ? (
          <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="display text-display-sm text-ink">Nicely sung.</p>
            <p className="text-body text-ink">Couldn&rsquo;t save this session.</p>
            <p className="text-secondary text-ink-muted">{saveErrorMessage}</p>
            <button
              type="button"
              onClick={() => void finishTake()}
              className="mt-2 flex min-h-tap items-center justify-center rounded-token bg-action px-6 py-3 text-body text-on-action"
            >
              Try again
            </button>
            <Link
              href="/"
              className="flex min-h-tap items-center justify-center rounded-token border border-rule bg-surface px-6 py-3 text-body text-ink"
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
