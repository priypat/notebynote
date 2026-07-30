/**
 * Hardcoded home-screen data. Prompt 4: a real screen, a real look, fake data
 * inline — lib/api/ doesn't exist yet, that's Prompt 6. Title/artist/hold
 * numbers are borrowed from lib/mock/songs.ts so the numbers are real even
 * though this page doesn't import that module yet.
 */

import type { Profile, Song } from "@/lib/types";

export const PROFILE: Profile = {
  id: "profile-demo",
  name: "Priya",
  baselineMptSec: 9.5,
  createdAt: "2026-06-02T14:00:00.000Z",
  theme: "auto",
  baselineMptMeasuredAt: "2026-07-14T09:30:00.000Z",
  updatedAt: "2026-07-28T21:10:00.000Z",
};

/** Today's Breath Score and its plain-language read. Hardcoded for now. */
export const TODAYS_SCORE = 58;
export const TODAYS_SCORE_READ =
  "Steady and strong today — right in your usual range.";

export const HOME_SONGS: Song[] = [
  {
    id: "song-down-in-the-valley",
    title: "Down in the Valley",
    artist: "Traditional",
    durationSec: 48,
    longestHoldSec: 4.5,
    key: "G major",
    motifSeed: 0x5ea1e7,
    difficulty: "gentle",
    attribution: "Traditional American folk song. Public domain.",
    audioUrl: null,
    phrases: [],
  },
  {
    id: "song-shenandoah",
    title: "Shenandoah",
    artist: "Traditional",
    durationSec: 72,
    longestHoldSec: 6.5,
    key: "D major",
    motifSeed: 0x1f3a34,
    difficulty: "steady",
    attribution: "Traditional American river song, c. 1800s. Public domain.",
    audioUrl: null,
    phrases: [],
  },
  {
    id: "song-danny-boy",
    title: "Danny Boy",
    artist: "Traditional",
    durationSec: 116,
    longestHoldSec: 10.0,
    key: "E-flat major",
    motifSeed: 0x7c6a9c,
    difficulty: "reaching",
    attribution:
      "Melody: Londonderry Air, traditional Irish. Words: Frederic Weatherly, 1913. Public domain.",
    audioUrl: null,
    phrases: [],
  },
];
