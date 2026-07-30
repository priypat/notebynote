"use client";

/**
 * Side-by-side comparison surface for the three candidate home screens.
 * Dev-only; 404s in production like every other /dev/* page.
 *
 * The mode toggle is the important control here — the brief was that the
 * dark theme specifically read as a sleep app, so each option needs judging
 * in dusk as much as dawn.
 */

import { useState } from "react";
import { MOCK_SONGS } from "@/lib/mock";
import { OptionA, OptionB, OptionC, type DemoData } from "./variants";

const DATA: DemoData = {
  name: "Ada",
  greeting: "Good morning",
  score: 59,
  sentence: "Your longest hold yet — 5.4 seconds. That's new ground.",
  lastSongTitle: "Danny Boy",
  songs: MOCK_SONGS,
  sessionCount: 9,
  bestHoldSec: 5.4,
};

const OPTIONS = [
  { id: "a", label: "A · Warm Signal", blurb: "Evolution. Warm neutrals, one coral action color, amber highlights." },
  { id: "b", label: "B · Color Blocks", blurb: "Biggest departure. Saturated song tiles, no gradient, near-black dusk." },
  { id: "c", label: "C · Citrus Sunrise", blurb: "Most energetic. Vivid hero, stat pills, deep-teal dusk instead of purple." },
] as const;

type OptionId = (typeof OPTIONS)[number]["id"];
type Mode = "dawn" | "dusk";

export function HomeOptions() {
  const [option, setOption] = useState<OptionId>("a");
  const [mode, setMode] = useState<Mode>("dawn");

  const current = OPTIONS.find((o) => o.id === option)!;

  return (
    <main className="space-y-5 pb-16">
      <header className="space-y-2">
        <p className="text-secondary uppercase tracking-[0.14em] text-ink-muted">Dev</p>
        <h1 className="display text-display-sm">Home screen options</h1>
        <p className="text-body text-ink-muted">
          Same data, same accessibility floors, three directions. Check each in
          both modes.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setOption(o.id)}
            aria-pressed={option === o.id}
            className={`flex min-h-tap flex-col items-start justify-center rounded-token border px-4 py-3 text-left ${
              option === o.id ? "border-action bg-surface" : "border-rule bg-surface"
            }`}
          >
            <span className="text-body text-ink">
              {option === o.id ? "● " : ""}
              {o.label}
            </span>
            <span className="text-secondary text-ink-muted">{o.blurb}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-1 rounded-token border border-rule bg-surface p-1">
        {(["dawn", "dusk"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`flex min-h-tap flex-1 items-center justify-center rounded-token text-body capitalize ${
              mode === m ? "bg-action text-on-action" : "text-ink-muted"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* The preview. data-ui repoints the tokens; data-mode picks the
          dawn/dusk variant of that option. Everything inside is built from
          ordinary token utilities. */}
      <div
        data-ui={option}
        data-mode={mode}
        className="overflow-hidden rounded-token-lg border border-rule bg-bg p-4 text-ink"
      >
        {option === "a" && <OptionA data={DATA} />}
        {option === "b" && <OptionB data={DATA} />}
        {option === "c" && <OptionC data={DATA} />}
      </div>

      <p className="text-secondary text-ink-muted">
        Now showing: <strong className="text-ink">{current.label}</strong> in {mode}.
      </p>
    </main>
  );
}
