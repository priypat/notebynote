"use client";

import { useState } from "react";

type Theme = "auto" | "dawn" | "dusk";

const NEXT: Record<Theme, Theme> = { auto: "dawn", dawn: "dusk", dusk: "auto" };
const LABEL: Record<Theme, string> = {
  auto: "Following your phone",
  dawn: "Dawn",
  dusk: "Dusk",
};

/**
 * Specimen-only controls. Lets you check every token in both themes and in
 * grayscale on a real phone. Not part of the product UI.
 */
export function SpecimenControls() {
  const [theme, setTheme] = useState<Theme>("auto");
  const [gray, setGray] = useState(false);

  function cycleTheme() {
    const next = NEXT[theme];
    setTheme(next);
    const root = document.documentElement;
    if (next === "auto") delete root.dataset.theme;
    else root.dataset.theme = next;
  }

  function toggleGray() {
    const next = !gray;
    setGray(next);
    document.documentElement.style.filter = next ? "grayscale(1)" : "";
  }

  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={cycleTheme}
        className="min-h-tap rounded-token bg-action px-5 py-3 text-body text-on-action"
      >
        Theme: {LABEL[theme]}
      </button>
      <button
        type="button"
        onClick={toggleGray}
        aria-pressed={gray}
        className="min-h-tap rounded-token border border-rule bg-surface px-5 py-3 text-body text-ink"
      >
        Grayscale: {gray ? "on" : "off"}
      </button>
    </div>
  );
}
