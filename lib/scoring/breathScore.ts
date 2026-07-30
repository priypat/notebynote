/**
 * Breath Score — the one hero metric: how long, and how steadily, you sustain.
 *
 * INVARIANT: zero imports. This file must stay a pure function of its inputs so
 * it can move server-side unchanged, and so the same take always produces the
 * same score (and therefore the same terrain). The `import type`s below compile
 * away entirely — there is no runtime dependency on anything.
 */

import type { BreathFrame } from "../audio/types";
import type { PhraseResult, Profile, Seed, Take } from "../types";

// ---------------------------------------------------------------------------
// scorePhrase
// ---------------------------------------------------------------------------

/** Matches the normalization Ridge.tsx uses to turn rms into a 0..1 envelope. */
const REF_PEAK_RMS = 0.1;

/** A jitter this large (cents, frame to frame) counts as fully unsteady pitch. */
const PITCH_JITTER_REF_CENTS = 40;

/** A frame-to-frame amplitude change this large (relative to the mean) counts
 *  as fully unsteady loudness. */
const AMP_JITTER_REF = 0.35;

/**
 * Score one held phrase from its frames.
 *
 * `frames` should span the phrase's voiced hold, plus whatever trailing
 * unvoiced frames the caller wants counted toward `recoverySec` — this
 * function doesn't care where the segment came from, a live mic or a
 * fixture push through the exact same math.
 */
export function scorePhrase(frames: BreathFrame[], phraseId: string): PhraseResult {
  const voiced = frames.filter((f) => f.voiced);

  if (voiced.length === 0) {
    return {
      phraseId,
      heldSec: 0,
      steadiness: 0,
      decaySlope: 0,
      recoverySec: trailingSilence(frames),
    };
  }

  // elapsedVoicedSec is monotonic through the hold and frozen through a dip,
  // so the last voiced frame already carries the true hold length.
  const heldSec = voiced[voiced.length - 1].elapsedVoicedSec;

  const steadiness = clamp((pitchSteadiness(voiced) + ampSteadiness(voiced)) / 2, 0, 1);
  const decaySlope = decaySlopeOf(voiced);
  const recoverySec = trailingSilence(frames);
  const envelope = downsampleEnvelope(voiced.map((f) => f.rms));

  return { phraseId, heldSec, steadiness, decaySlope, recoverySec, envelope };
}

function pitchSteadiness(voiced: BreathFrame[]): number {
  const deltas: number[] = [];
  for (let i = 1; i < voiced.length; i++) {
    const a = voiced[i - 1].pitchHz;
    const b = voiced[i].pitchHz;
    if (a && b) deltas.push(Math.abs(1200 * Math.log2(b / a)));
  }
  const jitter = deltas.length ? mean(deltas) : 0;
  return clamp(1 - jitter / PITCH_JITTER_REF_CENTS, 0, 1);
}

function ampSteadiness(voiced: BreathFrame[]): number {
  const rms = voiced.map((f) => f.rms);
  const meanRms = mean(rms) || 1e-9;
  const deltas: number[] = [];
  for (let i = 1; i < rms.length; i++) deltas.push(Math.abs(rms[i] - rms[i - 1]));
  const jitter = deltas.length ? mean(deltas) / meanRms : 0;
  return clamp(1 - jitter / AMP_JITTER_REF, 0, 1);
}

/** Linear fit of amplitude (relative to the hold's onset) against time —
 *  fractional change per second, negative when fading. */
function decaySlopeOf(voiced: BreathFrame[]): number {
  const onsetRms = voiced[0].rms || 1e-9;
  const points = voiced.map((f) => ({ x: f.elapsedVoicedSec, y: f.rms / onsetRms }));
  return linregSlope(points);
}

/** Seconds of silence already elapsed by the end of the given frames — 0 if
 *  the segment ends still voiced (the caller didn't capture the release). */
function trailingSilence(frames: BreathFrame[]): number {
  if (frames.length === 0) return 0;
  const last = frames[frames.length - 1];
  return last.voiced ? 0 : last.silenceSec;
}

/** ~10Hz, 0..1 — matches the shape lib/mock/envelope.ts hand-authors. */
function downsampleEnvelope(rms: number[]): number[] {
  const bucket = 6; // ~60Hz frames -> 10Hz
  const out: number[] = [];
  for (let i = 0; i < rms.length; i += bucket) {
    out.push(clamp(mean(rms.slice(i, i + bucket)) / REF_PEAK_RMS, 0, 1));
  }
  return out;
}

// ---------------------------------------------------------------------------
// scoreTake
// ---------------------------------------------------------------------------

export type TakeScore = {
  /** 0..100. Half how close the longest hold came to the personal baseline,
   *  half how steady breath was across the phrases attempted — see below. */
  breathScore: number;
  longestHoldSec: number;
  isPersonalRecord: boolean;
  sigilSeed: Seed;
};

/**
 * Score a whole take.
 *
 * Breath Score, in one sentence: half how close your longest hold came to
 * your personal baseline, half how steady your breath was across the phrases
 * you attempted. No third term, no hidden weighting — if it can't be said in
 * that one sentence, it doesn't belong in the formula.
 *
 * `previousBestHoldSec` is the longest hold from every prior take (0 for a
 * first-ever session) — a personal record is beating that, not the baseline.
 * The baseline instead caps how far a single hold can push the score, since
 * it's the one number this app actually knows about someone's lungs.
 */
export function scoreTake(
  phrases: PhraseResult[],
  profile: Profile,
  previousBestHoldSec = 0,
): TakeScore {
  const attempted = phrases.filter((p) => p.heldSec > 0);
  const longestHoldSec = phrases.reduce((max, p) => Math.max(max, p.heldSec), 0);

  const holdRatio =
    profile.baselineMptSec > 0 ? clamp(longestHoldSec / profile.baselineMptSec, 0, 1) : 0;
  const meanSteadiness = attempted.length ? mean(attempted.map((p) => p.steadiness)) : 0;

  const breathScore = Math.round(50 * holdRatio + 50 * meanSteadiness);
  const isPersonalRecord = longestHoldSec > previousBestHoldSec;
  const sigilSeed = seedFrom(phrases, breathScore);

  return { breathScore, longestHoldSec, isPersonalRecord, sigilSeed };
}

function seedFrom(phrases: PhraseResult[], breathScore: number): Seed {
  let str = `${breathScore}`;
  for (const p of phrases) {
    str += `|${p.phraseId}:${p.heldSec.toFixed(2)}:${p.steadiness.toFixed(3)}`;
  }
  return hashString(str);
}

// ---------------------------------------------------------------------------
// describeTake
// ---------------------------------------------------------------------------

const FIRST_SESSION_TEMPLATES = [
  (t: Take) =>
    `You just drew your first ridge — ${formatSec(t.longestHoldSec)} seconds of breath, right there.`,
  (t: Take) =>
    `That's your first session in the books. ${formatSec(t.longestHoldSec)} seconds, start to finish.`,
];

const PERSONAL_RECORD_TEMPLATES = [
  (t: Take) => `Your longest hold yet — ${formatSec(t.longestHoldSec)} seconds. That's new ground.`,
  (t: Take) => `You just beat your own best: ${formatSec(t.longestHoldSec)} seconds held steady.`,
];

const IMPROVED_TEMPLATES = [
  (word: string, delta: string) => `You held the ${word} line ${delta} seconds longer than last time.`,
  (word: string, delta: string) =>
    `Longer breath today — the ${word} line stretched ${delta} seconds past your last go.`,
  (word: string, delta: string) =>
    `Your ${word} line held ${delta} seconds longer than it did last time. Small gains add up.`,
];

const STEADY_TEMPLATES = [
  (t: Take) =>
    `Steady as last time — ${formatSec(t.longestHoldSec)} seconds, same as always. Nothing to prove today.`,
];

/** Deliberately doesn't mention "shorter" or "less" as a problem to solve. */
const SHORTER_TEMPLATES = [
  () => `A shorter session today, and that's completely fine — you still sang the whole thing.`,
  () => `Not your longest today. Some days are just like that, and you still showed up.`,
];

/**
 * One plain-language sentence about a take, warm and specific, never
 * clinical. `previous` doesn't need to be sorted — the most recent prior
 * take (by startedAt) is found here.
 */
export function describeTake(take: Take, previous: Take[]): string {
  const prior = mostRecent(previous);
  const pick = (n: number) => hashString(take.id) % n;

  if (!prior) {
    return FIRST_SESSION_TEMPLATES[pick(FIRST_SESSION_TEMPLATES.length)](take);
  }

  if (take.isPersonalRecord) {
    return PERSONAL_RECORD_TEMPLATES[pick(PERSONAL_RECORD_TEMPLATES.length)](take);
  }

  const holdDelta = take.longestHoldSec - prior.longestHoldSec;
  const scoreDelta = take.breathScore - prior.breathScore;

  if (holdDelta >= 1 || scoreDelta >= 3) {
    const { index, delta } = biggestPhraseGain(take, prior);
    const word = phraseWord(index, take.phrases.length);
    const template = IMPROVED_TEMPLATES[pick(IMPROVED_TEMPLATES.length)];
    return template(word, formatSec(Math.max(0.1, delta)));
  }

  if (Math.abs(holdDelta) < 1 && Math.abs(scoreDelta) < 3) {
    return STEADY_TEMPLATES[pick(STEADY_TEMPLATES.length)](take);
  }

  return SHORTER_TEMPLATES[pick(SHORTER_TEMPLATES.length)]();
}

function mostRecent(takes: Take[]): Take | null {
  if (takes.length === 0) return null;
  return takes.reduce((latest, t) => (t.startedAt > latest.startedAt ? t : latest));
}

function biggestPhraseGain(take: Take, prior: Take): { index: number; delta: number } {
  let index = 0;
  let delta = -Infinity;
  take.phrases.forEach((p, i) => {
    const match = prior.phrases.find((pp) => pp.phraseId === p.phraseId);
    const d = p.heldSec - (match?.heldSec ?? 0);
    if (d > delta) {
      delta = d;
      index = i;
    }
  });
  return { index, delta: delta === -Infinity ? 0 : delta };
}

const ORDINAL_WORDS = ["opening", "second", "third", "fourth", "fifth", "sixth", "seventh"];

function phraseWord(index: number, total: number): string {
  if (total > 1 && index === total - 1) return "closing";
  return ORDINAL_WORDS[index] ?? `phrase ${index + 1}`;
}

// ---------------------------------------------------------------------------
// small pure helpers
// ---------------------------------------------------------------------------

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function linregSlope(points: { x: number; y: number }[]): number {
  if (points.length < 2) return 0;
  const mx = mean(points.map((p) => p.x));
  const my = mean(points.map((p) => p.y));
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function formatSec(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

/** FNV-1a, 32-bit. Deterministic and dependency-free — used to pick a
 *  template variant and to seed a take's terrain, never for anything that
 *  needs to be unguessable. */
function hashString(s: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
