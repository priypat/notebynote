"use client";

/**
 * The results screen. One restrained moment for a personal record — a gold
 * pip and a single settling animation, never confetti — and otherwise the
 * same calm register as the rest of the app.
 *
 * Fetches through lib/api/* rather than reading lib/mock/* directly — the
 * mock layer's writes (a take just recorded, a profile edit) live in
 * localStorage, which only a client-side fetch can see. See API_CONTRACT.md.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MotionConfig, motion } from "motion/react";
import type { Take } from "@/lib/types";
import { ApiError, getSong, getTake, getTakes } from "@/lib/api";
import { describeTake } from "@/lib/scoring/breathScore";
import { generateSigil } from "@/lib/sigil/generate";
import { BROWSER_CHROME } from "@/lib/tokens";
import { Sigil } from "@/components/Sigil";
import { usePrefersReducedMotion } from "../../useReducedMotion";
import { Ridge, REF_PEAK_RMS } from "../../sing/Ridge";

function formatSec(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Standalone-exports the sigil's SVG as a PNG. The SVG already resolves
 *  every color to a literal hex (see lib/sigil/generate.ts), so it renders
 *  correctly outside the page's own stylesheet — no CSS custom property to
 *  lose along the way. */
function exportSigilPng(svg: SVGSVGElement, filename: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const size = 1000;
  clone.setAttribute("width", String(size));
  clone.setAttribute("height", String(size));

  const bbox = svg.viewBox.baseVal;
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", String(bbox.x));
  bg.setAttribute("y", String(bbox.y));
  bg.setAttribute("width", String(bbox.width));
  bg.setAttribute("height", String(bbox.height));
  bg.setAttribute("fill", BROWSER_CHROME.dawn);
  clone.insertBefore(bg, clone.firstChild);

  const svgString = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(
    new Blob([svgString], { type: "image/svg+xml;charset=utf-8" }),
  );

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    URL.revokeObjectURL(url);
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, size, size);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    }, "image/png");
  };
  img.src = url;
}

type LoadState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      take: Take;
      sentence: string;
      songTitle: string;
      hueSeed: number;
    };

function useResults(takeId: string): LoadState {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    async function load() {
      try {
        const [take, history] = await Promise.all([
          getTake(takeId),
          getTakes({ limit: 100 }),
        ]);
        if (cancelled) return;

        const previous = history.filter(
          (t) => t.id !== take.id && t.startedAt < take.startedAt,
        );
        const sentence = describeTake(take, previous);

        let songTitle = "";
        let hueSeed = 0;
        try {
          const song = await getSong(take.songId);
          songTitle = song.title;
          hueSeed = song.motifSeed;
        } catch {
          // The song was withdrawn since this take was recorded — the take
          // itself still stands, just without a title or a hue family.
        }
        if (cancelled) return;

        setState({ status: "ready", take, sentence, songTitle, hueSeed });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: "not-found" });
        } else {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Something went wrong.",
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [takeId]);

  return state;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-8 pb-10">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          aria-label="Back home"
          className="flex min-h-tap min-w-tap items-center justify-center rounded-token text-display-sm text-ink-muted"
        >
          <span aria-hidden="true">&times;</span>
        </Link>
      </header>
      {children}
    </div>
  );
}

export function ResultsScreen({ takeId }: { takeId: string }) {
  const state = useResults(takeId);

  if (state.status === "loading") {
    return (
      <Shell>
        <section className="flex flex-1 flex-col items-center justify-center gap-4 pt-16 text-center">
          <div className="size-40 animate-pulse rounded-full bg-dawn-mist" />
          <p className="text-secondary text-ink-muted">Finding your results&hellip;</p>
        </section>
      </Shell>
    );
  }

  if (state.status === "not-found") {
    return (
      <Shell>
        <section className="flex flex-1 flex-col items-center justify-center gap-4 pt-16 text-center">
          <p className="text-body text-ink">We couldn&rsquo;t find that session.</p>
          <p className="text-secondary text-ink-muted">
            It may have been on another device, or never saved.
          </p>
          <Link
            href="/"
            className="mt-2 flex min-h-tap items-center justify-center rounded-token bg-action px-6 py-3 text-body text-on-action"
          >
            Back home
          </Link>
        </section>
      </Shell>
    );
  }

  if (state.status === "error") {
    return (
      <Shell>
        <section className="flex flex-1 flex-col items-center justify-center gap-4 pt-16 text-center">
          <p className="text-body text-ink">Couldn&rsquo;t load this session.</p>
          <p className="text-secondary text-ink-muted">{state.message}</p>
          <Link
            href="/"
            className="mt-2 flex min-h-tap items-center justify-center rounded-token border border-rule bg-surface px-6 py-3 text-body text-ink"
          >
            Back home
          </Link>
        </section>
      </Shell>
    );
  }

  return (
    <ResultsContent
      take={state.take}
      sentence={state.sentence}
      songTitle={state.songTitle}
      hueSeed={state.hueSeed}
    />
  );
}

function ResultsContent({
  take,
  sentence,
  songTitle,
  hueSeed,
}: {
  take: Take;
  sentence: string;
  songTitle: string;
  /** The song's motifSeed — see lib/sigil/generate.ts. */
  hueSeed: number;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const sigilSvgRef = useRef<SVGSVGElement>(null);

  // Every phrase's stored envelope is already 0..1 — rescale back to the
  // rms-like units Ridge expects, then lay every phrase end to end for one
  // whole-session landscape.
  const fullEnvelope = useMemo(
    () => take.phrases.flatMap((p) => (p.envelope ?? []).map((v) => v * REF_PEAK_RMS)),
    [take.phrases],
  );

  const sigilSpec = useMemo(() => {
    const attempted = take.phrases.filter((p) => p.heldSec > 0);
    return generateSigil({
      seed: take.sigilSeed,
      longestHoldSec: take.longestHoldSec,
      meanDecaySlope: mean(attempted.map((p) => p.decaySlope)),
      meanSteadiness: mean(attempted.map((p) => p.steadiness)),
      phraseCount: take.phrases.length,
      hueSeed,
      isPersonalRecord: take.isPersonalRecord,
    });
  }, [take, hueSeed]);

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

        <section className="flex flex-col items-center gap-4">
          <div className="size-40">
            <Sigil ref={sigilSvgRef} spec={sigilSpec} animate />
          </div>
          <button
            type="button"
            onClick={() =>
              sigilSvgRef.current &&
              exportSigilPng(sigilSvgRef.current, `lung-tunes-sigil-${take.id}.png`)
            }
            className="flex min-h-tap items-center justify-center rounded-token border border-rule bg-surface px-5 py-2.5 text-secondary text-ink"
          >
            Save this seal
          </button>
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
          href="/progress"
          className="flex min-h-tap items-center justify-center rounded-token border border-rule bg-surface px-6 py-3 text-body text-ink"
        >
          See your progress
        </Link>

        <Link
          href="/"
          className="flex min-h-tap items-center justify-center text-secondary text-ink-muted underline"
        >
          Back home
        </Link>
      </div>
    </MotionConfig>
  );
}
