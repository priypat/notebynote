/**
 * Lyric pairing for the two fixtures this prototype demos.
 *
 * Borrowed from real phrases in lib/mock/songs.ts so the screen reads as an
 * actual moment in a song rather than placeholder copy, even though the
 * fixture's hold length doesn't line up with the song's original timing —
 * this route hardcodes fixture data on purpose (see the file header in
 * SingDemoScreen.tsx) and rewires to real song data once the visual is right.
 */

import type { FixtureName } from "@/lib/audio/types";

export type DemoLine = {
  /** Everything before the sustained word. */
  lead: string;
  /** The word carried into the hold. */
  sustained: string;
  /** The next line, shown dimmed beneath — for layout only, never advances. */
  next: string;
};

export const DEMO_LINES: Record<"steady-12s" | "ragged-7s", DemoLine> = {
  "steady-12s": {
    lead: "Oh, Shenandoah, I long to hear",
    sustained: "you",
    next: "Away, you rolling river",
  },
  "ragged-7s": {
    lead: "The summer's gone, and all the roses",
    sustained: "falling",
    next: "It's you, it's you must go and I must bide",
  },
};

export function resolveDemoFixture(param: string | undefined): FixtureName {
  return param === "ragged-7s" ? "ragged-7s" : "steady-12s";
}
