import type { FixtureName } from "@/lib/audio/types";

/**
 * The scripted fixture sequence for demo mode (?demo=1 — see Prompt 11 /
 * README.md). Every phrase but the last replays short-3s — quick and clean,
 * so a live audience isn't watching a static screen for ten seconds per
 * line. The last phrase replays steady-12s, an ~11-12 second hold that
 * comfortably beats any prior take (seeded or real) regardless of how many
 * times the demo has already been run — the personal-record moment is
 * structural, not scripted luck.
 *
 * This only ever chooses a value already valid for BreathSource — demo mode
 * adds no new engine or rendering path, just which fixture plays when.
 */
export function fixtureForDemoPhrase(index: number, phraseCount: number): FixtureName {
  return index >= phraseCount - 1 ? "steady-12s" : "short-3s";
}

/** The fastest song to complete — down the four gentle phrases keeps a
 *  live demo run under a minute. */
export const DEMO_SONG_ID = "song-down-in-the-valley";
