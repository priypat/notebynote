/**
 * WCAG contrast checker for the token palette. Run with `npm run check:contrast`.
 *
 * design-tokens.md documents an exact ratio for every functional color, and
 * this audience includes people with reduced vision — "looks fine to me" is
 * not the standard. Any palette change goes through here before it ships.
 *
 * AA is 4.5:1 for body text and 3:1 for large text (>=24px) / UI boundaries.
 * This app targets AA+ and treats 4.5:1 as the floor for anything carrying
 * meaning, which is why `min` is 4.5 almost everywhere below.
 */

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Relative luminance, per WCAG 2.x. */
function luminance(hex: string): number {
  const srgb = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

type Pair = { label: string; fg: string; bg: string; min: number };
const PAIRS: Pair[] = [];

/** Every ink-ish token against every background it can land on. */
function suite(name: string, tokens: Record<string, string>, bgKeys: string[]) {
  for (const bgKey of bgKeys) {
    const bg = tokens[bgKey];
    for (const [k, v] of Object.entries(tokens)) {
      if (k.startsWith("ink")) {
        PAIRS.push({ label: `${name}: ${k} on ${bgKey}`, fg: v, bg, min: 4.5 });
      }
    }
  }
}

// --- shipped palette, as a regression guard ---------------------------------
suite("current/dawn", { bg: "#fdf8f3", surface: "#ffffff", ink: "#1f3a34", inkMuted: "#5e4f80" }, ["bg", "surface"]);
suite("current/dusk", { bg: "#1a1428", surface: "#231b33", ink: "#fdf8f3", inkMuted: "#d9d2e0" }, ["bg", "surface"]);

// --- Option A: Warm Signal --------------------------------------------------
suite("A/dawn", { bg: "#fff8f0", surface: "#ffffff", ink: "#23201d", inkMuted: "#5c534a" }, ["bg", "surface"]);
suite("A/dusk", { bg: "#1b1815", surface: "#26221e", ink: "#fbf6f0", inkMuted: "#c8bdb1" }, ["bg", "surface"]);

// --- Option B: Color Blocks -------------------------------------------------
suite("B/dawn", { bg: "#faf7f2", surface: "#ffffff", ink: "#1a1a1a", inkMuted: "#57534e" }, ["bg", "surface"]);
suite("B/dusk", { bg: "#111111", surface: "#1c1c1c", ink: "#fafafa", inkMuted: "#b5b5b5" }, ["bg", "surface"]);

// --- Option C: Citrus Sunrise -----------------------------------------------
suite("C/dawn", { bg: "#fdfaf4", surface: "#ffffff", ink: "#14302e", inkMuted: "#4a5f5c" }, ["bg", "surface"]);
suite("C/dusk", { bg: "#0f1f21", surface: "#172c2e", ink: "#f2fbf8", inkMuted: "#a9c4bf" }, ["bg", "surface"]);

// --- accents: text ON a saturated fill, both themes -------------------------
PAIRS.push(
  // A — coral action, amber highlight chip
  { label: "A: on-action on coral", fg: "#ffffff", bg: "#b8431f", min: 4.5 },
  { label: "A: ink on amber chip", fg: "#23201d", bg: "#f5b73d", min: 4.5 },
  { label: "A/dusk: ink on coral", fg: "#1b1815", bg: "#ff8a5c", min: 4.5 },
  // B — color-blocked song cards, dark ink on saturated fills
  { label: "B: ink on mango", fg: "#1a1a1a", bg: "#f5a524", min: 4.5 },
  { label: "B: ink on sky", fg: "#1a1a1a", bg: "#5cc8f0", min: 4.5 },
  { label: "B: ink on lilac", fg: "#1a1a1a", bg: "#c4a5f0", min: 4.5 },
  { label: "B: on-action on ink CTA", fg: "#ffffff", bg: "#1a1a1a", min: 4.5 },
  { label: "B/dusk: ink on mango", fg: "#111111", bg: "#f5a524", min: 4.5 },
  // C — tangerine action, lime highlight
  { label: "C: on-action on tangerine", fg: "#ffffff", bg: "#c2410c", min: 4.5 },
  { label: "C: ink on lime chip", fg: "#14302e", bg: "#bef264", min: 4.5 },
  { label: "C: ink on tangerine chip", fg: "#14302e", bg: "#fdba74", min: 4.5 },
  { label: "C/dusk: ink on lime", fg: "#0f1f21", bg: "#bef264", min: 4.5 },
);

// --- text sitting directly ON a hero gradient -------------------------------
// Checked against EVERY stop, not just one: a gradient that passes at its
// lightest stop and fails at its darkest is exactly how unreadable hero text
// ships. (Caught Option C/dusk doing this.)
const HERO_STOPS: { label: string; on: string; stops: string[] }[] = [
  { label: "A/dawn hero", on: "#23201d", stops: ["#ff8a5c", "#f5b73d", "#ffd9a8"] },
  { label: "A/dusk hero", on: "#fbf6f0", stops: ["#c2410c", "#b8431f", "#7c2d12"] },
  { label: "C/dawn hero", on: "#14302e", stops: ["#fb923c", "#fdba74", "#bef264"] },
  { label: "C/dusk hero", on: "#f2fbf8", stops: ["#14532d", "#166534", "#3f6212"] },
];
for (const h of HERO_STOPS) {
  h.stops.forEach((stop, i) => {
    PAIRS.push({ label: `${h.label} stop${i + 1}`, fg: h.on, bg: stop, min: 4.5 });
  });
}

let failures = 0;
for (const p of PAIRS) {
  const ratio = contrast(p.fg, p.bg);
  const ok = ratio >= p.min;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${p.label.padEnd(34)} ${ratio.toFixed(2)}:1 (min ${p.min})`);
}

if (failures > 0) {
  console.error(`\n✗ ${failures} pairing(s) below the contrast floor.`);
  process.exit(1);
}
console.log(`\n✓ all ${PAIRS.length} pairings meet their contrast floor`);
