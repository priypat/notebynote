/**
 * The sigil keepsake — a deterministic generative seal from a take's own
 * numbers. Same input, same seal, forever: the image *is* the data, not a
 * decoration of it.
 *
 * Exactly six parameters, so the mapping stays explainable in one sentence:
 * the longest phrase sets the size, mean amplitude decay sets the line
 * weight, mean breath steadiness sets the edge quality (solid vs. broken),
 * phrase count sets the ring count, the song's motif seed sets the hue, and
 * a personal record adds one small gold mark. `seed` (a take's sigilSeed)
 * drives nothing meaningful on its own — it only supplies the organic,
 * hand-carved jitter in each ring's outline, so two takes with identical
 * six-parameter values still don't trace the exact same wobble.
 *
 * Framework-agnostic on purpose: this returns plain geometry (points, not
 * JSX), the same split Ridge.tsx/catmullRom.ts already use, so the seal can
 * be unit-tested and rendered by more than one component.
 */

export type SigilInput = {
  /** A take's sigilSeed. Cosmetic jitter only — never one of the six. */
  seed: number;
  /** The take's longest held phrase, seconds -> overall size. */
  longestHoldSec: number;
  /** Mean amplitude decay slope across attempted phrases -> line weight.
   *  Near zero (well supported) draws a bold line; strongly negative
   *  (fading) draws a fine one. */
  meanDecaySlope: number;
  /** Mean steadiness, 0..1, across attempted phrases -> edge quality. High
   *  steadiness draws a solid edge; low draws a broken one. scoreTake
   *  already averages this from pitch- and amplitude-jitter, so it stands
   *  in for "pitch jitter" without a second stored field. */
  meanSteadiness: number;
  /** One ring per phrase attempted. */
  phraseCount: number;
  /** A song's motifSeed (see lib/types.ts) -> hue. Takes of the same song
   *  share a hue family, the same way their ridges share a family look. */
  hueSeed: number;
  /** One small gold mark, and only one. */
  isPersonalRecord: boolean;
};

export type Point = { x: number; y: number };

export type SigilRing = {
  /** 0..1, fraction of the seal's outer radius. */
  radius: number;
  /** 0..1, fraction of the seal's outer radius. */
  strokeWidth: number;
  /** Dash/gap, in the same 0..1 units as radius — undefined for a solid
   *  edge. The renderer scales these to real units. */
  dash?: { on: number; off: number };
  /** Resolved hex — see PALETTE_STOPS below. */
  color: string;
  /** Points around the ring, already perturbed for a hand-carved edge.
   *  Unit-circle coordinates: roughly -1..1, centered on the origin. */
  points: Point[];
};

export type SigilMark = {
  angleDeg: number;
  /** 0..1, fraction of the seal's outer radius. */
  radius: number;
  color: string;
};

export type SigilSpec = {
  /** 0..1 — how much of the available drawing area the whole seal fills. */
  size: number;
  rings: SigilRing[];
  mark: SigilMark | null;
};

// ---------------------------------------------------------------------------
// palette — mirrors design-tokens.md's atmosphere colors and --mark.
//
// Generative SVG geometry needs actual RGB numbers to interpolate between,
// which a CSS custom property can't give it. Same justified exception
// lib/tokens.ts documents for the browser's theme-color meta tag: this is
// the one other place a hex literal is allowed, because there's no other
// way to do the job.
// ---------------------------------------------------------------------------

const PALETTE_STOPS: { at: number; hex: string }[] = [
  { at: 0, hex: "#F7C59F" }, // --dawn-peach
  { at: 0.52, hex: "#A8D0E6" }, // --dawn-sky
  { at: 1, hex: "#7C6A9C" }, // --dawn-violet
];

const MARK_HEX = "#C08A3E"; // --mark

// ---------------------------------------------------------------------------
// tuning
// ---------------------------------------------------------------------------

const REF_MAX_HOLD_SEC = 12; // a long, well-supported hold
const MAX_DECAY_REF = 0.15; // fully faded, past even fading-9s's authored decay

const MIN_STROKE = 0.006;
const MAX_STROKE = 0.022;

const INNER_RADIUS = 0.22;
const RING_GAP = 0.11;
const MAX_RADIUS = 0.98;

const POINTS_PER_RING = 72; // 5° steps — dense enough to read as a clean edge
const SOLID_EDGE_THRESHOLD = 0.6;

export function generateSigil(input: SigilInput): SigilSpec {
  const rand = prng(input.seed >>> 0);

  const size = clamp(0.5 + 0.5 * clamp(input.longestHoldSec / REF_MAX_HOLD_SEC, 0, 1), 0.5, 1);

  const strokeFactor = clamp(1 - Math.abs(input.meanDecaySlope) / MAX_DECAY_REF, 0, 1);
  const strokeWidth = lerp(MIN_STROKE, MAX_STROKE, strokeFactor);

  const solid = input.meanSteadiness >= SOLID_EDGE_THRESHOLD;
  const brokenness = clamp(1 - input.meanSteadiness, 0, 1);
  const wobble = 0.015 + brokenness * 0.05;

  const ringCount = Math.max(1, Math.min(8, Math.round(input.phraseCount)));
  const basePos = (((input.hueSeed % 1000) + 1000) % 1000) / 1000;

  const rings: SigilRing[] = Array.from({ length: ringCount }, (_, i) => {
    const radius = Math.min(MAX_RADIUS, INNER_RADIUS + i * RING_GAP);
    const huePos = (basePos + (i / ringCount) * 0.4) % 1;
    const color = sampleGradient(huePos);
    const rotation = rand() * Math.PI * 2;
    const points = ringPoints(radius, rotation, wobble, rand);
    const dash = solid ? undefined : dashFor(radius, brokenness, rand);
    return { radius, strokeWidth, dash, color, points };
  });

  const outer = rings.length ? Math.max(...rings.map((r) => r.radius)) : INNER_RADIUS;
  const mark: SigilMark | null = input.isPersonalRecord
    ? { angleDeg: -90, radius: Math.min(1.05, outer + 0.08), color: MARK_HEX }
    : null;

  return { size, rings, mark };
}

function ringPoints(
  radius: number,
  rotation: number,
  wobbleAmt: number,
  rand: () => number,
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= POINTS_PER_RING; i++) {
    const angle = (i / POINTS_PER_RING) * Math.PI * 2 + rotation;
    const wobbleFactor = 1 + (rand() - 0.5) * 2 * wobbleAmt;
    const r = radius * wobbleFactor;
    points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  return points;
}

function dashFor(radius: number, brokenness: number, rand: () => number): { on: number; off: number } {
  const circumference = 2 * Math.PI * radius;
  const segments = Math.max(6, Math.round(10 + brokenness * 18));
  const period = circumference / segments;
  const onFraction = lerp(0.75, 0.35, brokenness);
  const jitter = 1 + (rand() - 0.5) * 0.3 * brokenness;
  return { on: period * onFraction * jitter, off: period * (1 - onFraction) };
}

// ---------------------------------------------------------------------------
// gradient sampling
// ---------------------------------------------------------------------------

function sampleGradient(pos: number): string {
  const p = ((pos % 1) + 1) % 1;
  for (let i = 0; i < PALETTE_STOPS.length - 1; i++) {
    const a = PALETTE_STOPS[i];
    const b = PALETTE_STOPS[i + 1];
    if (p >= a.at && p <= b.at) {
      const t = (p - a.at) / (b.at - a.at || 1);
      const ac = hexToRgb(a.hex);
      const bc = hexToRgb(b.hex);
      return rgbToHex([lerp(ac[0], bc[0], t), lerp(ac[1], bc[1], t), lerp(ac[2], bc[2], t)]);
    }
  }
  return PALETTE_STOPS[PALETTE_STOPS.length - 1].hex;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb: [number, number, number]): string {
  const c = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

// ---------------------------------------------------------------------------
// small pure helpers
// ---------------------------------------------------------------------------

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** mulberry32 — same small deterministic PRNG used throughout lib/audio and
 *  lib/mock, for the same reason: fast, good enough, reproducible forever. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
