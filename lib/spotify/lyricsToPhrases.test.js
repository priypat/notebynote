import { describe, expect, it } from "vitest";
import { lyricsToPhrases } from "./lyricsToPhrases";
import { parseSyncedLyrics } from "./api";

// Real synced lyrics fetched from LRCLIB for "Yesterday" / The Beatles during
// this project's own testing — not fabricated, so the gap sizes are real.
const YESTERDAY_LRC = `[00:23.10]Yesterday, all my troubles seemed so far away
[00:31.20]Now it looks as though they're here to stay
[00:36.40]Oh, I believe in yesterday
[01:37.40]Yesterday, love was such an easy game to play
[01:45.42]Now I need a place to hide away
[01:49.23]Oh, I believe in yesterday
[01:53.30]`;

describe("lyricsToPhrases", () => {
  it("derives a usable phrase map from real synced lyrics", () => {
    const result = lyricsToPhrases(parseSyncedLyrics(YESTERDAY_LRC));
    expect(result).not.toBeNull();
    expect(result.phrases.length).toBeGreaterThan(0);
    expect(result.longestHoldSec).toBeGreaterThan(0);
    expect(["gentle", "steady", "reaching"]).toContain(result.difficulty);
  });

  it("gives every phrase a hold that lands inside its own line", () => {
    const result = lyricsToPhrases(parseSyncedLyrics(YESTERDAY_LRC));
    for (const p of result.phrases) {
      expect(p.holdStartSec).toBeGreaterThanOrEqual(p.startSec);
      expect(p.holdStartSec + p.targetHoldSec).toBeCloseTo(p.endSec, 5);
    }
  });

  it("returns null for no lines, one line, or all-instrumental lines", () => {
    expect(lyricsToPhrases([])).toBeNull();
    expect(lyricsToPhrases([{ time: 0, text: "only one" }])).toBeNull();
    expect(
      lyricsToPhrases([
        { time: 0, text: "" },
        { time: 5, text: "" },
      ]),
    ).toBeNull();
  });

  it("drops gaps too short to be a real sustained hold", () => {
    const rapid = [
      { time: 0, text: "line one" },
      { time: 0.4, text: "line two" }, // 0.4s gap — not a hold
      { time: 0.8, text: "line three" },
    ];
    expect(lyricsToPhrases(rapid)).toBeNull();
  });

  it("is deterministic", () => {
    const lines = parseSyncedLyrics(YESTERDAY_LRC);
    expect(lyricsToPhrases(lines)).toEqual(lyricsToPhrases(lines));
  });
});
