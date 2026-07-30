"use client";

/**
 * The results screen. One restrained moment for a personal record — a gold
 * pip and a single settling animation, never confetti — and otherwise the
 * same calm register as the rest of the app.
 */

import Link from "next/link";
import { useMemo } from "react";
import { MotionConfig, motion } from "motion/react";
import type { Take } from "@/lib/types";
import { usePrefersReducedMotion } from "../../useReducedMotion";
import { Ridge, REF_PEAK_RMS } from "../../sing/Ridge";

function formatSec(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

export function ResultsScreen({
  take,
  sentence,
  songTitle,
}: {
  take: Take;
  sentence: string;
  songTitle: string;
}) {
  const reducedMotion = usePrefersReducedMotion();

  // Every phrase's stored envelope is already 0..1 — rescale back to the
  // rms-like units Ridge expects, then lay every phrase end to end for one
  // whole-session landscape.
  const fullEnvelope = useMemo(
    () => take.phrases.flatMap((p) => (p.envelope ?? []).map((v) => v * REF_PEAK_RMS)),
    [take.phrases],
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-8 pb-10">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            aria-label="Back home"
            className="flex min-h-tap min-w-tap items-center justify-center rounded-token text-display-sm text-ink-muted"
          >
            <span aria-hidden="true">&times;</span>
          </Link>
          <p className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
            {songTitle}
          </p>
        </header>

        <section className="flex flex-col items-center gap-3 text-center">
          {take.isPersonalRecord && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.9, ease: [0.33, 0, 0.2, 1] }}
              className="size-3 rounded-full bg-mark"
              aria-hidden="true"
            />
          )}
          <p className="numeral text-display-lg text-ink">{take.breathScore}</p>
          <p className="max-w-[26rem] text-body text-ink-muted">{sentence}</p>
        </section>

        <section className="h-40 overflow-hidden rounded-token-lg">
          <Ridge
            envelope={fullEnvelope}
            assumedTotalFrames={Math.max(2, fullEnvelope.length)}
            settleAmount={0}
            reducedMotion={reducedMotion}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
            Held, phrase by phrase
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {take.phrases.map((p, i) => (
              <div
                key={p.phraseId}
                className="flex min-w-[4.5rem] flex-col items-center gap-1 rounded-token border border-rule bg-surface px-3 py-2"
              >
                <p className="numeral text-display-sm text-ink">{formatSec(p.heldSec)}</p>
                <p className="text-secondary text-ink-muted">Line {i + 1}</p>
              </div>
            ))}
          </div>
        </section>

        <Link
          href="/"
          className="flex min-h-tap items-center justify-center rounded-token border border-rule bg-surface px-6 py-3 text-body text-ink"
        >
          Back home
        </Link>
      </div>
    </MotionConfig>
  );
}
