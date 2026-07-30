"use client";

/**
 * "You" — name, theme, and re-measuring the breath baseline. The one
 * settings surface `API_CONTRACT.md` documents (S6) but that had no UI
 * until now, despite Profile.theme existing in the data model since the
 * very first prompt.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { getProfile, updateProfile } from "@/lib/api";
import { applyTheme } from "@/lib/applyTheme";
import type { Profile, ThemePreference } from "@/lib/types";
import { BottomNav } from "@/components/BottomNav";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "auto", label: "Match my device" },
  { value: "dawn", label: "Dawn" },
  { value: "dusk", label: "Dusk" },
];

function formatSec(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; profile: Profile };

function useProfileData(): LoadState {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getProfile()
      .then((profile) => {
        if (!cancelled) setState({ status: "ready", profile });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function SettingsScreen() {
  const state = useProfileData();

  return (
    <main className="space-y-6 pb-24">
      <header>
        <p className="text-secondary uppercase tracking-[0.14em] text-ink-muted">You</p>
      </header>

      {state.status === "loading" && (
        <div className="space-y-4">
          <div className="h-14 animate-pulse rounded-token bg-dawn-mist" />
          <div className="h-32 animate-pulse rounded-token-lg bg-dawn-mist" />
        </div>
      )}

      {state.status === "error" && (
        <div className="space-y-3 text-center">
          <p className="text-body text-ink">Couldn&rsquo;t load your settings right now.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 flex min-h-tap items-center justify-center rounded-token bg-action px-6 py-3 text-body text-on-action"
          >
            Try again
          </button>
        </div>
      )}

      {state.status === "ready" && <SettingsForm profile={state.profile} />}

      <BottomNav />
    </main>
  );
}

function SettingsForm({ profile }: { profile: Profile }) {
  const [name, setName] = useState(profile.name);
  const [nameStatus, setNameStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [nameError, setNameError] = useState("");
  const [theme, setTheme] = useState<ThemePreference>(profile.theme);

  async function saveName() {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setNameStatus("error");
      setNameError("A name can't be empty.");
      return;
    }
    setNameStatus("saving");
    try {
      await updateProfile({ name: trimmed });
      setNameStatus("saved");
    } catch (err) {
      setNameStatus("error");
      setNameError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function chooseTheme(next: ThemePreference) {
    setTheme(next);
    applyTheme(next); // immediate feedback, regardless of whether the save below succeeds
    void updateProfile({ theme: next }).catch(() => {
      // The visual already changed; a failed persist just means it won't
      // survive a reload. Not worth blocking the interaction on.
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-secondary uppercase tracking-[0.14em] text-ink-muted">Name</h2>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameStatus("idle");
          }}
          aria-label="Your name"
          className="min-h-tap w-full rounded-token border border-rule bg-surface px-4 py-3 text-body text-ink"
        />
        {nameStatus === "error" && (
          <p className="text-secondary text-ink-muted">{nameError}</p>
        )}
        <button
          type="button"
          onClick={saveName}
          disabled={nameStatus === "saving"}
          className="flex min-h-tap items-center justify-center rounded-token bg-action px-6 py-3 text-body text-on-action disabled:opacity-50"
        >
          {nameStatus === "saving" ? "Saving…" : nameStatus === "saved" ? "Saved" : "Save name"}
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="text-secondary uppercase tracking-[0.14em] text-ink-muted">Theme</h2>
        <div className="flex flex-col gap-2">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => chooseTheme(opt.value)}
              aria-pressed={theme === opt.value}
              className={`flex min-h-tap items-center rounded-token border px-4 py-3 text-body ${
                theme === opt.value ? "border-action text-ink" : "border-rule text-ink-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
          Breath baseline
        </h2>
        <p className="text-body text-ink-muted">
          Your current starting point is {formatSec(profile.baselineMptSec)} seconds.
          There&rsquo;s no wrong number here — it&rsquo;s just what the Breath Score
          compares against.
        </p>
        <Link
          href="/welcome?step=calibrate"
          className="flex min-h-tap items-center justify-center rounded-token border border-rule bg-surface px-6 py-3 text-body text-ink"
        >
          Re-measure
        </Link>
      </section>
    </div>
  );
}
