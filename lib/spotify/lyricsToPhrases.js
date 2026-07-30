// lib/spotify/lyricsToPhrases.js
//
// The bridge: synced lyrics -> the same Phrase[] shape lib/types.ts already
// runs breath coaching on. An LRC file is just timestamped lines; the gap
// between one line ending and the next starting is where a person breathes,
// and a long gap is a sustained note. This is a pure function on purpose —
// same input, same phrase map, always, and it's testable with no network.
//
// Heuristic, stated plainly because it IS a heuristic: a line's sustained
// hold is estimated as the back portion of the gap before the next line
// starts (SUSTAIN_FRACTION of it, capped at MAX_HOLD_SEC). Real melody data
// would be better; lyrics timestamps are what's actually available.

const MIN_GAP_SEC = 1.5; // shorter gaps aren't a "hold" worth coaching
const MAX_HOLD_SEC = 9; // matches the app's existing "reaching" ceiling
const SUSTAIN_FRACTION = 0.45;

/**
 * @param {{time: number, text: string}[]} lines  parsed synced lyrics
 *   (parseSyncedLyrics() in lib/spotify/api.js produces exactly this)
 * @returns {{
 *   phrases: Array<{id:string, lyric:string, startSec:number, endSec:number,
 *                    holdStartSec:number, targetHoldSec:number}>,
 *   longestHoldSec: number,
 *   difficulty: 'gentle'|'steady'|'reaching',
 * } | null}  null means "no usable phrase map" — not every song sustains
 *   anything long enough to coach breath on.
 */
export function lyricsToPhrases(lines) {
  if (!Array.isArray(lines) || lines.length < 2) return null;

  const usable = lines.filter((l) => l.text && l.text.trim().length > 0);
  const phrases = [];

  for (let i = 0; i < usable.length - 1; i++) {
    const line = usable[i];
    const next = usable[i + 1];
    const gap = next.time - line.time;
    if (gap < MIN_GAP_SEC) continue;

    // Round first, then derive holdStartSec from the rounded value — not the
    // other way around — so holdStartSec + targetHoldSec === endSec exactly,
    // which is the invariant lib/types.ts documents for Phrase.holdStartSec.
    const targetHoldSec = Math.round(Math.min(MAX_HOLD_SEC, gap * SUSTAIN_FRACTION) * 10) / 10;
    const endSec = next.time;
    const holdStartSec = endSec - targetHoldSec;

    phrases.push({
      id: `p${phrases.length + 1}`,
      lyric: line.text.trim(),
      startSec: line.time,
      endSec,
      holdStartSec,
      targetHoldSec,
    });
  }

  if (phrases.length === 0) return null; // nothing sustained long enough

  const longestHoldSec = Math.max(...phrases.map((p) => p.targetHoldSec));
  const difficulty =
    longestHoldSec < 4.5 ? 'gentle' : longestHoldSec < 7 ? 'steady' : 'reaching';

  return { phrases, longestHoldSec: Math.round(longestHoldSec * 10) / 10, difficulty };
}
