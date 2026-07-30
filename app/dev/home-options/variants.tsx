"use client";

/**
 * Three candidate home screens (Prompt: "make it less meditation-app").
 *
 * All three render the SAME data and use the SAME token utilities — the only
 * thing that differs between them is layout, density, type scale, and which
 * palette the wrapper's [data-ui] attribute points the tokens at. That's
 * deliberate: whichever wins gets promoted by copying its JSX and its token
 * block, with no per-option special-casing to unpick.
 *
 * Constraints held in all three (these are not the part that felt sleepy):
 *   - body >= 17px, prefer 18px          - tap targets >= 48px
 *   - AA+ contrast, verified in           - no streaks, no failure framing,
 *     scripts/check-contrast.ts             no red-as-alarm
 */

import type { Song } from "@/lib/types";

export type DemoData = {
  name: string;
  greeting: string;
  score: number;
  sentence: string;
  lastSongTitle: string;
  songs: Song[];
  sessionCount: number;
  bestHoldSec: number;
};

function formatHold(sec: number): string {
  return Number.isInteger(sec) ? `${sec}s` : `${sec.toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Option A — Warm Signal
// Evolution of what's there. Warm neutrals, one confident coral action color,
// an amber highlight. Keeps the gradient but makes it warm and directional
// rather than a soft vertical wash.
// ---------------------------------------------------------------------------

export function OptionA({ data }: { data: DemoData }) {
  return (
    <div className="space-y-7 pb-8">
      <div
        className="relative overflow-hidden rounded-token-lg p-6"
        style={{ background: "var(--hero)" }}
      >
        {/* Text sits on a solid chip, never straight on the gradient. */}
        <div className="inline-block rounded-token bg-surface px-4 py-3">
          <p className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
            {data.greeting}
          </p>
          <p className="display text-display-sm text-ink">{data.name}</p>
        </div>
      </div>

      <section className="rounded-token-lg border border-rule bg-surface p-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
            {data.lastSongTitle}
          </p>
          <span className="rounded-full bg-accent-soft px-3 py-1 text-secondary text-ink">
            {formatHold(data.bestHoldSec)} best
          </span>
        </div>
        <p className="numeral text-display-lg text-ink">{data.score}</p>
        <p className="mt-1 text-body text-ink-muted">{data.sentence}</p>
      </section>

      <button
        type="button"
        className="flex min-h-tap w-full items-center justify-center rounded-full bg-action px-6 py-4 text-body font-semibold text-on-action"
      >
        Start singing
      </button>

      <section className="space-y-3">
        <h2 className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
          Your songs
        </h2>
        {data.songs.map((song, i) => (
          <div
            key={song.id}
            className="flex items-center gap-4 rounded-token-lg border border-rule bg-surface p-4"
          >
            <span
              className="h-12 w-1.5 shrink-0 rounded-full"
              style={{ background: [`var(--card-a)`, `var(--card-b)`, `var(--card-c)`][i % 3] }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="display text-display-sm leading-tight text-ink">{song.title}</p>
              <p className="text-secondary text-ink-muted">
                {song.artist} · longest hold {formatHold(song.longestHoldSec)}
              </p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Option B — Color Blocks
// Biggest departure. No gradient at all. Each song is a saturated tile with
// near-black ink on it; the score is its own bold block. Near-black dusk so
// the colors actually pop instead of muddying.
// ---------------------------------------------------------------------------

export function OptionB({ data }: { data: DemoData }) {
  const fills = ["var(--card-a)", "var(--card-b)", "var(--card-c)"];

  return (
    <div className="space-y-6 pb-8">
      <header className="pt-2">
        <p className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
          {data.greeting}
        </p>
        <h1 className="display text-display-md leading-none text-ink">{data.name}</h1>
      </header>

      <section
        className="rounded-token-lg p-6"
        style={{ background: "var(--accent)" }}
      >
        <p
          className="text-secondary uppercase tracking-[0.14em]"
          style={{ color: "var(--on-accent)", opacity: 0.75 }}
        >
          {data.lastSongTitle}
        </p>
        <p className="numeral text-display-lg" style={{ color: "var(--on-accent)" }}>
          {data.score}
        </p>
        <p className="mt-1 text-body" style={{ color: "var(--on-accent)" }}>
          {data.sentence}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-token-lg border border-rule bg-surface p-4">
          <p className="numeral text-display-sm text-ink">{data.sessionCount}</p>
          <p className="text-secondary text-ink-muted">sessions</p>
        </div>
        <div className="rounded-token-lg border border-rule bg-surface p-4">
          <p className="numeral text-display-sm text-ink">{formatHold(data.bestHoldSec)}</p>
          <p className="text-secondary text-ink-muted">longest yet</p>
        </div>
      </div>

      <button
        type="button"
        className="flex min-h-tap w-full items-center justify-center rounded-token bg-action px-6 py-4 text-body font-semibold text-on-action"
      >
        Start singing
      </button>

      <section className="space-y-3">
        <h2 className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
          Your songs
        </h2>
        {data.songs.map((song, i) => (
          <div
            key={song.id}
            className="rounded-token-lg p-5"
            style={{ background: fills[i % 3] }}
          >
            {/* Dark ink on every fill — all three verified >= 8:1. */}
            <p className="display text-display-sm leading-tight" style={{ color: "#1a1a1a" }}>
              {song.title}
            </p>
            <p className="text-secondary" style={{ color: "#1a1a1a", opacity: 0.75 }}>
              {song.artist}
            </p>
            <p className="mt-3 text-secondary font-semibold" style={{ color: "#1a1a1a" }}>
              longest hold {formatHold(song.longestHoldSec)}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Option C — Citrus Sunrise
// Most energetic. Vivid gradient hero the score sits inside (on a solid card),
// a stat row, pill everything. Dusk is deep teal — deliberately not purple,
// since the purple is what read as "sleep app".
// ---------------------------------------------------------------------------

export function OptionC({ data }: { data: DemoData }) {
  return (
    <div className="space-y-6 pb-8">
      <section
        className="rounded-token-lg p-5"
        style={{ background: "var(--hero)" }}
      >
        {/* on-hero flips with the mode — the dusk hero is dark green, so
            dark ink here would be invisible. */}
        <p
          className="text-secondary uppercase tracking-[0.14em]"
          style={{ color: "var(--on-hero)", opacity: 0.85 }}
        >
          {data.greeting}
        </p>
        <p className="display text-display-md leading-none" style={{ color: "var(--on-hero)" }}>
          {data.name}
        </p>

        <div className="mt-5 rounded-token bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
              {data.lastSongTitle}
            </p>
          </div>
          <p className="numeral text-display-lg text-ink">{data.score}</p>
          <p className="mt-1 text-body text-ink-muted">{data.sentence}</p>
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <span className="shrink-0 rounded-full bg-accent-soft px-4 py-2 text-secondary text-ink">
          {formatHold(data.bestHoldSec)} longest
        </span>
        <span className="shrink-0 rounded-full bg-accent-soft px-4 py-2 text-secondary text-ink">
          {data.sessionCount} sessions
        </span>
        <span className="shrink-0 rounded-full bg-accent-soft px-4 py-2 text-secondary text-ink">
          calm after
        </span>
      </div>

      <button
        type="button"
        className="flex min-h-tap w-full items-center justify-center rounded-full bg-action px-6 py-4 text-body font-semibold text-on-action"
      >
        Start singing
      </button>

      <section className="space-y-3">
        <h2 className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
          Your songs
        </h2>
        {data.songs.map((song, i) => (
          <div
            key={song.id}
            className="flex items-center gap-4 rounded-token-lg border border-rule bg-surface p-4"
          >
            <span
              className="flex size-12 shrink-0 items-center justify-center rounded-full"
              style={{
                background: ["var(--card-a)", "var(--card-b)", "var(--card-c)"][i % 3],
              }}
              aria-hidden="true"
            >
              <span className="numeral text-body" style={{ color: "#14302e" }}>
                {formatHold(song.longestHoldSec)}
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="display text-display-sm leading-tight text-ink">{song.title}</p>
              <p className="text-secondary text-ink-muted">{song.artist}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
