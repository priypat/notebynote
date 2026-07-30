import type { Phrase, Song } from "@/lib/types";

/**
 * Three hand-authored songs, all traditional or public domain so the demo
 * carries no licensing question.
 *
 * Timings were written by singing each line at the tempo noted on the song and
 * marking where the sustained note starts and stops — they are not generated.
 * They assume an unaccompanied, unhurried performance, which is the point: the
 * gaps between phrases are long enough to breathe in without rushing.
 *
 * Song choice is deliberate. Every one of these is an adult song with an adult
 * emotional register — no nursery rhymes. The audience has a lung condition,
 * not a reading age.
 */

/** `holdStartSec` defaults to a hold that runs to the end of the phrase. */
function phrase(
  id: string,
  lyric: string,
  startSec: number,
  endSec: number,
  targetHoldSec: number,
  holdStartSec = endSec - targetHoldSec,
): Phrase {
  return { id, lyric, startSec, endSec, targetHoldSec, holdStartSec };
}

// ---------------------------------------------------------------------------
// Gentle — ~4s holds
// ---------------------------------------------------------------------------

/**
 * Slow 3/4, about 72 bpm. Short lines, a four-beat sustain on each last word,
 * and a full two seconds of rest between lines. This is the first-session song:
 * four phrases and it's over in under a minute.
 */
const downInTheValley: Song = {
  id: "song-down-in-the-valley",
  title: "Down in the Valley",
  artist: "Traditional",
  durationSec: 48,
  longestHoldSec: 4.5,
  key: "G major",
  motifSeed: 0x5ea1e7,
  difficulty: "gentle",
  attribution: "Traditional American folk song. Public domain.",
  audioUrl: null, // TODO(api): backing track
  phrases: [
    phrase("p1", "Down in the valley, valley so low", 2.0, 11.0, 4.0),
    phrase("p2", "Hang your head over, hear the wind blow", 13.0, 22.0, 4.0),
    phrase("p3", "Hear the wind blow, dear, hear the wind blow", 24.0, 33.5, 4.5),
    phrase("p4", "Hang your head over, hear the wind blow", 35.5, 45.0, 4.0),
  ],
};

// ---------------------------------------------------------------------------
// Steady — ~6s holds
// ---------------------------------------------------------------------------

/**
 * Slow and unmetered, about 56 bpm in 4/4. The long legato lines are the whole
 * reason this song is a breath exercise — "hear you" and "Missouri" both sit on
 * a sustain you have to plan for before you start the line.
 */
const shenandoah: Song = {
  id: "song-shenandoah",
  title: "Shenandoah",
  artist: "Traditional",
  durationSec: 72,
  longestHoldSec: 6.5,
  key: "D major",
  motifSeed: 0x1f3a34,
  difficulty: "steady",
  attribution: "Traditional American river song, c. 1800s. Public domain.",
  audioUrl: null, // TODO(api): backing track
  phrases: [
    phrase("p1", "Oh, Shenandoah, I long to hear you", 3.0, 14.0, 6.0),
    phrase("p2", "Away, you rolling river", 16.0, 26.0, 5.5),
    phrase("p3", "Oh, Shenandoah, I long to hear you", 28.0, 39.0, 6.0),
    phrase("p4", "Away, I'm bound away", 41.0, 50.0, 5.0),
    phrase("p5", "'Cross the wide Missouri", 52.0, 64.0, 6.5),
  ],
};

// ---------------------------------------------------------------------------
// Reaching — ~9s holds
// ---------------------------------------------------------------------------

/**
 * Slow 4/4, about 66 bpm, rubato. The classic breath-control song: the last
 * line's "I love you so" is a ten-second sustain at the top of the range, and
 * almost nobody gets it on a first attempt. Rests here are three seconds,
 * because they have to be.
 */
const dannyBoy: Song = {
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
  audioUrl: null, // TODO(api): backing track
  phrases: [
    phrase("p1", "Oh Danny boy, the pipes, the pipes are calling", 4.0, 19.0, 8.0),
    phrase("p2", "From glen to glen, and down the mountain side", 22.0, 37.0, 8.0),
    phrase("p3", "The summer's gone, and all the roses falling", 40.0, 55.5, 8.5),
    phrase("p4", "It's you, it's you must go and I must bide", 58.5, 74.0, 9.0),
    phrase("p5", "But come ye back when summer's in the meadow", 77.0, 92.0, 8.0),
    phrase("p6", "Oh Danny boy, oh Danny boy, I love you so", 95.0, 112.0, 10.0),
  ],
};

/** Ordered gentle → reaching. The song list renders them in this order. */
export const MOCK_SONGS: Song[] = [downInTheValley, shenandoah, dannyBoy];

export const MOCK_SONG_IDS = {
  downInTheValley: downInTheValley.id,
  shenandoah: shenandoah.id,
  dannyBoy: dannyBoy.id,
} as const;
