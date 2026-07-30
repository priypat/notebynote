"use client";

/**
 * Applies the persisted theme preference on load. Mounted once in the root
 * layout. Settings screen applies changes immediately itself (see
 * lib/applyTheme.ts) — this only covers first paint on a fresh page load,
 * before that screen has had a chance to run.
 */

import { useEffect } from "react";
import { getProfile } from "@/lib/api";
import { applyTheme } from "@/lib/applyTheme";

export function ThemeSync() {
  useEffect(() => {
    let cancelled = false;
    getProfile()
      .then((profile) => {
        if (!cancelled) applyTheme(profile.theme);
      })
      .catch(() => {
        // Fall through to auto (the default markup) — not worth blocking on.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
