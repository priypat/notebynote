"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSongs, getTakes } from "@/lib/api";
import type { Take } from "@/lib/types";
import { BottomNav } from "@/components/BottomNav";
import { SigilCollection } from "./SigilCollection";
import { TrendChart } from "./TrendChart";

type View = "sigils" | "trend";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; takes: Take[]; motifSeeds: Record<string, number> };

function useProgressData(): LoadState {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState({ status: "loading" });
      try {
        const [takes, songs] = await Promise.all([
          getTakes({ limit: 100 }),
          getSongs(),
        ]);
        if (cancelled) return;
        const motifSeeds: Record<string, number> = {};
        for (const s of songs) motifSeeds[s.id] = s.motifSeed;
        setState({ status: "ready", takes, motifSeeds });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

function Header() {
  return (
    <header>
      <p className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
        Your progress
      </p>
    </header>
  );
}

export function ProgressScreen() {
  const state = useProgressData();
  const [view, setView] = useState<View>("sigils");

  if (state.status === "loading") {
    return (
      <main className="space-y-6 pb-24">
        <Header />
        <div className="h-11 animate-pulse rounded-token bg-dawn-mist" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-token-lg bg-dawn-mist" />
          ))}
        </div>
        <BottomNav />
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="space-y-6 pb-24">
        <Header />
        <div className="space-y-3 text-center">
          <p className="text-body text-ink">Couldn&rsquo;t load your progress right now.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 flex min-h-tap items-center justify-center rounded-token bg-action px-6 py-3 text-body text-on-action"
          >
            Try again
          </button>
        </div>
        <BottomNav />
      </main>
    );
  }

  if (state.takes.length === 0) {
    return (
      <main className="space-y-6 pb-24">
        <Header />
        <section className="flex flex-col items-center gap-4 rounded-token-lg border border-rule bg-surface p-8 text-center">
          <p className="text-body text-ink">Nothing here yet.</p>
          <p className="text-secondary text-ink-muted">
            Sing your first song and this page starts filling in — a seal for
            every session, and the shape of your practice over time.
          </p>
          <Link
            href="/"
            className="mt-2 flex min-h-tap items-center justify-center rounded-token bg-action px-6 py-3 text-body text-on-action"
          >
            Find a song
          </Link>
        </section>
        <BottomNav />
      </main>
    );
  }

  return (
    <main className="space-y-6 pb-24">
      <Header />

      <div className="flex gap-1 rounded-token border border-rule bg-surface p-1">
        <button
          type="button"
          onClick={() => setView("sigils")}
          aria-pressed={view === "sigils"}
          className={`flex min-h-tap flex-1 items-center justify-center rounded-token text-body ${
            view === "sigils" ? "bg-action text-on-action" : "text-ink-muted"
          }`}
        >
          Sigils
        </button>
        <button
          type="button"
          onClick={() => setView("trend")}
          aria-pressed={view === "trend"}
          className={`flex min-h-tap flex-1 items-center justify-center rounded-token text-body ${
            view === "trend" ? "bg-action text-on-action" : "text-ink-muted"
          }`}
        >
          Trend
        </button>
      </div>

      {view === "sigils" ? (
        <SigilCollection takes={state.takes} motifSeeds={state.motifSeeds} />
      ) : (
        <TrendChart takes={state.takes} />
      )}

      <BottomNav />
    </main>
  );
}
