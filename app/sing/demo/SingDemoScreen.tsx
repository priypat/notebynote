"use client";

/**
 * The sing screen — pure visual prototype.
 *
 * Deliberately ignores lib/audio/breathEngine.ts and lib/api/*. A single
 * fixture's samples are imported directly and replayed on a timer as if they
 * were arriving live, so this prompt's whole effort goes into how the screen
 * looks rather than into plumbing. The real engine gets wired in once this
 * visual is proven — see CLAUDE.md's audio-layer rule this route is
 * temporarily and knowingly not following.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MotionConfig, motion } from "motion/react";
import { getFixture, FIXTURE_FRAME_RATE } from "@/lib/audio/fixtures";
import type { FixtureName } from "@/lib/audio/types";
import { DEMO_LINES } from "./demoContent";
import { Ridge } from "./Ridge";

const INHALE_SEC = 3;
const SETTLE_SEC = 1.8;

type Phase = "inhale" | "sustain" | "settle";

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

/** Drives the inhale → sustain → settle → inhale cycle from one rAF loop. */
function usePhraseCycle(sustainSec: number) {
  const [phase, setPhase] = useState<Phase>("inhale");
  const [phaseElapsed, setPhaseElapsed] = useState(0);

  const phaseRef = useRef<Phase>("inhale");
  const phaseStartRef = useRef<number | null>(null);

  useEffect(() => {
    phaseRef.current = "inhale";
    phaseStartRef.current = null;
    setPhase("inhale");
    setPhaseElapsed(0);

    let raf = 0;
    const durations: Record<Phase, number> = {
      inhale: INHALE_SEC,
      sustain: sustainSec,
      settle: SETTLE_SEC,
    };
    const next: Record<Phase, Phase> = {
      inhale: "sustain",
      sustain: "settle",
      settle: "inhale",
    };

    const tick = (now: number) => {
      if (phaseStartRef.current === null) phaseStartRef.current = now;
      const elapsedSec = (now - phaseStartRef.current) / 1000;
      const duration = durations[phaseRef.current];

      if (elapsedSec >= duration) {
        phaseRef.current = next[phaseRef.current];
        phaseStartRef.current = now;
        setPhase(phaseRef.current);
        setPhaseElapsed(0);
      } else {
        setPhaseElapsed(elapsedSec);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sustainSec]);

  return { phase, phaseElapsed };
}

export function SingDemoScreen({ fixtureName }: { fixtureName: FixtureName }) {
  const reducedMotion = usePrefersReducedMotion();
  const fixture = useMemo(() => getFixture(fixtureName), [fixtureName]);
  const line =
    fixtureName === "ragged-7s" ? DEMO_LINES["ragged-7s"] : DEMO_LINES["steady-12s"];

  const sustainSec = fixture.samples.length / FIXTURE_FRAME_RATE;
  const { phase, phaseElapsed } = usePhraseCycle(sustainSec);

  const ridgeElapsedSec =
    phase === "sustain" ? phaseElapsed : phase === "settle" ? sustainSec : 0;
  const settleAmount = phase === "settle" ? Math.min(1, phaseElapsed / SETTLE_SEC) : 0;
  const counterSec = phase === "inhale" ? 0 : ridgeElapsedSec;
  const holdFillPct =
    phase === "inhale"
      ? 0
      : Math.min(100, (Math.min(ridgeElapsedSec, sustainSec) / sustainSec) * 100);

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
            {fixture.label}
          </p>
        </header>

        {/* ---- lyric + counter, flat cream — never on the live gradient ---- */}
        <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <p className="numeral text-display-md text-ink" aria-live="off">
            {counterSec.toFixed(1)}
          </p>

          <div className="space-y-4 px-2">
            <p className="display text-display-sm leading-tight text-ink">
              {line.lead}{" "}
              <span className="relative inline-block">
                {line.sustained}
                <span
                  className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-rule"
                  style={{ width: `${holdFillPct}%`, transition: "none" }}
                  aria-hidden="true"
                />
              </span>
            </p>
            <p className="text-secondary text-ink-muted">{line.next}</p>
          </div>

          {phase === "inhale" && (
            <motion.div
              key="inhale-cue"
              initial={{ scale: 0.55, opacity: 0.3 }}
              animate={{ scale: 1, opacity: 0.8 }}
              transition={{ duration: INHALE_SEC, ease: [0.33, 0, 0.2, 1] }}
              className="size-16 rounded-full border border-rule bg-dawn-mist"
              aria-hidden="true"
            />
          )}
          {phase !== "inhale" && (
            <p className="text-secondary text-ink-muted">
              {phase === "sustain" ? "Hold, for as long as feels good" : "Rest here"}
            </p>
          )}
        </section>

        {/* ---- the ridge, lower half ---- */}
        <section className="min-h-[42vh] flex-1 overflow-hidden rounded-token-lg">
          <Ridge
            samples={fixture.samples}
            frameRate={FIXTURE_FRAME_RATE}
            elapsedSec={ridgeElapsedSec}
            settleAmount={settleAmount}
            reducedMotion={reducedMotion}
          />
        </section>
      </div>
    </MotionConfig>
  );
}
