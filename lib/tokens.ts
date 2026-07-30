/**
 * globals.css is the source of truth for every token. These two values are
 * mirrored here because the browser's `<meta name="theme-color">` reads a
 * literal color and cannot resolve a CSS custom property. If --bg changes in
 * globals.css, change it here too.
 *
 * lib/sigil/generate.ts mirrors a few more tokens for the same reason
 * (generative SVG math, and a standalone exported PNG, can't resolve a CSS
 * custom property either) — those two files are the only exceptions to "no
 * raw hex outside globals.css."
 */
export const BROWSER_CHROME = {
  dawn: "#FDF8F3", // --bg, dawn
  dusk: "#1A1428", // --bg, dusk
} as const;

export type ThemeName = keyof typeof BROWSER_CHROME;
