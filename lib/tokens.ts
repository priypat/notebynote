/**
 * The only place in TypeScript that names a color.
 *
 * globals.css is the source of truth for every token. These two values are
 * mirrored here because the browser's `<meta name="theme-color">` reads a
 * literal color and cannot resolve a CSS custom property. If --bg changes in
 * globals.css, change it here too.
 */
export const BROWSER_CHROME = {
  dawn: "#FDF8F3", // --bg, dawn
  dusk: "#1A1428", // --bg, dusk
} as const;

export type ThemeName = keyof typeof BROWSER_CHROME;
