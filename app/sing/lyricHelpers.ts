import { FIXTURE_NAMES, type BreathSource, type FixtureName } from "@/lib/audio/breathEngine";

/**
 * `?source=fixture:steady-12s` etc., kept alive alongside real mic input so
 * a screen can be checked without a microphone. Anything unrecognized falls
 * back to the real thing rather than silently misbehaving.
 */
export function parseSource(param: string | undefined): BreathSource {
  if (!param || param === "mic") return "mic";
  const match = /^fixture:(.+)$/.exec(param);
  const name = match?.[1];
  if (name && (FIXTURE_NAMES as readonly string[]).includes(name)) {
    return { fixture: name as FixtureName, loop: false };
  }
  return "mic";
}

/**
 * The word carried into the phrase's sustained hold. Every phrase in
 * lib/mock/songs.ts ends its lyric on that word, so the last word is it —
 * this is a display heuristic, not a schema field, and stays that way until
 * a phrase actually needs to mark a mid-line sustain.
 */
export function splitSustained(lyric: string): { lead: string; sustained: string } {
  const words = lyric.trim().split(/\s+/);
  const sustained = words.pop() ?? "";
  return { lead: words.join(" "), sustained: sustained.replace(/[.,!?;:]+$/, "") };
}
