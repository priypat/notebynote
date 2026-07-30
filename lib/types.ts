/**
 * The data model. Shared by the UI, the mock layer, and (eventually) the real
 * backend — see API_CONTRACT.md for the wire format of each of these.
 *
 * Fields marked ADDED were not in the original sketch. Each one has a reason.
 */

/** ISO 8601, always UTC, milliseconds included. `2026-07-29T08:14:03.000Z` */
export type IsoDateTime = string;

/** A normalized 0..1 measure. Never a percentage, never 0..100. */
export type Unit = number;

/**
 * Seed for the deterministic terrain generator. The same seed always draws the
 * same landscape, on any device, forever — that promise is why these are
 * persisted rather than derived at render time from a random source.
 * Unsigned 32-bit.
 */
export type Seed = number;

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * ADDED (renamed). The sketch said `'morning' | 'evening'`. These are named for
 * the two themes in globals.css instead, because the value is written straight
 * onto `<html data-theme>` — `data-theme="evening"` silently matches no CSS and
 * would fail as a no-op rather than an error. `auto` follows the OS.
 */
export type ThemePreference = "auto" | "dawn" | "dusk";

export type Profile = {
  id: string;
  name: string;
  /**
   * Maximum phonation time, in seconds: the longest the person can sustain a
   * single tone, measured during onboarding. Used to pick a starting song and
   * to scale the Breath Score, never shown as a clinical figure.
   */
  baselineMptSec: number;
  createdAt: IsoDateTime;
  theme: ThemePreference;

  /**
   * ADDED. When baselineMptSec was last measured, or null if it was estimated
   * rather than measured. Breath capacity moves — the progress screen needs to
   * know whether it is comparing against a fresh number or a stale one, and
   * settings needs to offer "measure again" at the right time.
   */
  baselineMptMeasuredAt: IsoDateTime | null;

  /** ADDED. Standard optimistic-update / cache-invalidation bookkeeping. */
  updatedAt: IsoDateTime;
};

/** Everything a client is allowed to change about a profile. */
export type ProfilePatch = Partial<
  Pick<Profile, "name" | "theme" | "baselineMptSec">
>;

// ---------------------------------------------------------------------------
// Songs
// ---------------------------------------------------------------------------

/**
 * ADDED. A sortable, human-facing difficulty band for the song list. Derivable
 * from targetHoldSec in principle, but the label is editorial — the wording is
 * deliberately effort-based, not ability-based ("reaching", never "hard" or
 * "advanced"), and that judgement shouldn't be recomputed in the UI.
 */
export type SongDifficulty = "gentle" | "steady" | "reaching";

export type Phrase = {
  id: string;
  /** One singable line, as it should appear on screen. Sentence case. */
  lyric: string;
  /** Offset from the start of the track when the line begins, seconds. */
  startSec: number;
  /** Offset when the line — including its sustained tail — ends. */
  endSec: number;
  /** How long the sustained note at the end of this line is meant to run. */
  targetHoldSec: number;

  /**
   * ADDED. Offset when the sustained note begins. The sing screen has to know
   * when to start measuring, and it cannot infer this: `endSec -
   * targetHoldSec` is only correct when the hold runs right up to the end of
   * the phrase, which is not true for lines with a short tail after the sustain.
   */
  holdStartSec: number;
};

export type Song = {
  id: string;
  title: string;
  /** "Traditional" for the public-domain catalogue. */
  artist: string;
  durationSec: number;
  /** The longest targetHoldSec in `phrases`. Denormalized for list sorting. */
  longestHoldSec: number;
  /** Concert key, e.g. "G major". Display and future transposition. */
  key: string;
  /** Seeds this song's baseline terrain, so its ridges share a family look. */
  motifSeed: Seed;
  phrases: Phrase[];

  difficulty: SongDifficulty; // ADDED — see SongDifficulty
  /**
   * ADDED. Provenance line, shown on the song. Every song in the demo is public
   * domain or traditional and we say so — it is both a licensing record and,
   * for this audience, a reason to trust the app.
   */
  attribution: string;
  /**
   * ADDED. Backing track. Null while the demo runs unaccompanied.
   * TODO(api): serve a signed, range-request-capable URL.
   */
  audioUrl: string | null;
};

// ---------------------------------------------------------------------------
// Takes
// ---------------------------------------------------------------------------

/**
 * ADDED. Whether the person reached the end of the song or stopped partway.
 * Stopping early is normal and completely fine — but a take with three of six
 * phrases must not be plotted as though it were a full one, or the progress
 * chart lies. The UI never labels this as a failure.
 */
export type TakeCompletion = "finished" | "stopped-early";

export type PhraseResult = {
  phraseId: string;
  /** How long the note was actually sustained, seconds. 0 if not attempted. */
  heldSec: number;
  /**
   * How even the breath was across the hold, 0..1. 1 is glass-smooth. This is
   * the value the ridge silhouette is drawn from — high steadiness gives smooth
   * rolling crests, low gives broken ones. Never mapped to a hue.
   */
  steadiness: Unit;
  /**
   * Rate of loudness fade across the hold, normalized amplitude per second.
   * Negative means fading (the usual case); ~0 means fully supported.
   */
  decaySlope: number;
  /** Seconds between the end of the hold and breath being ready again. */
  recoverySec: number;

  /**
   * ADDED, optional. Breath envelope over the hold, downsampled to 10 Hz,
   * each value 0..1. This is what lets a past take redraw its exact ridge
   * instead of an approximation.
   *
   * Omitted by list endpoints — at 10 Hz a nine-second hold is 90 floats, and
   * a history of 200 takes would make GET /api/takes megabytes. Present on
   * single-take reads and on the response to a just-created take.
   */
  envelope?: number[];
};

export type Take = {
  id: string;
  songId: string;
  startedAt: IsoDateTime;
  phrases: PhraseResult[];
  /** The hero metric. 0..100, integer. Server-computed — never client-sent. */
  breathScore: number;
  /** The longest heldSec in `phrases`. The number people actually remember. */
  longestHoldSec: number;
  /** True if longestHoldSec beat every prior take. Server-computed. */
  isPersonalRecord: boolean;
  /** Seeds this take's terrain. Server-computed, then immutable. */
  sigilSeed: Seed;

  /**
   * ADDED. Wall-clock end of the session. Needed for "you practised for six
   * minutes" and to order same-day takes; not derivable from the song duration
   * once resting between phrases is allowed, which it always is.
   */
  endedAt: IsoDateTime;
  completion: TakeCompletion; // ADDED — see TakeCompletion
};

/**
 * What a client sends to record a take. Deliberately excludes breathScore,
 * longestHoldSec, isPersonalRecord, and sigilSeed: those are the server's to
 * compute, so a score cannot be forged and so re-scoring old takes with an
 * improved algorithm stays possible.
 */
export type TakeDraft = {
  songId: string;
  startedAt: IsoDateTime;
  endedAt: IsoDateTime;
  completion: TakeCompletion;
  phrases: PhraseResult[];
};

export type GetTakesOptions = {
  /** Newest first. Server default 20, maximum 100. */
  limit?: number;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * The error body every non-2xx response returns. `code` is the stable,
 * machine-readable discriminant the UI branches on; `message` is human-readable
 * but is treated as developer-facing — screens map `code` to their own copy,
 * because server strings are not written in this product's voice.
 */
export type ApiErrorBody = {
  code: string;
  message: string;
  /** Optional per-field validation detail, keyed by field path. */
  fields?: Record<string, string>;
};
