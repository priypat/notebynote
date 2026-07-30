import type { ThemePreference } from "./types";

/** Writes a theme preference onto <html>, matching the exact strings
 *  globals.css's [data-theme="..."] selectors expect. "auto" removes the
 *  attribute entirely so the OS-level prefers-color-scheme takes over. */
export function applyTheme(theme: ThemePreference): void {
  if (typeof document === "undefined") return;
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}
