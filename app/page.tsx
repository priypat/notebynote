"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getProfile, getSongs, getTakes } from "@/lib/api";
import { describeTake } from "@/lib/scoring/breathScore";
import type { Profile, Song, Take } from "@/lib/types";
import { BottomNav } from "@/components/BottomNav";

function useGreetingWord(): string {
  // Computed client-only, after mount — new Date() during SSR would be the
  // server's clock, not the visitor's, and the two disagreeing is a
  // hydration mismatch waiting to happen.
  const [word, setWord] = useState("Hello");
  useEffect(() => {
    const hour = new Date().getHours();
    setWord(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
  }, []);
  return word;
}

function formatHold(sec: number): string {
  return Number.isInteger(sec) ? `${sec}s` : `${sec.toFixed(1)}s`;
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; profile: Profile; songs: Song[]; latest: Take | null; previous: Take[] };

function useHomeData(): LoadState {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState({ status: "loading" });
      try {
        const [profile, songs, takes] = await Promise.all([
          getProfile(),
          getSongs(),
          getTakes({ limit: 2 }),
        ]);
        if (cancelled) return;
        setState({
          status: "ready",
          profile,
          songs,
          latest: takes[0] ?? null,
          previous: takes.slice(1),
        });
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

function HeaderWash() {
  return (
    <div
      className="h-28 rounded-token-lg"
      style={{ background: "var(--dawn)" }}
      aria-hidden="true"
    />
  );
}

const LOADING_SHELL = (
  <main className="space-y-8 pb-10">
    <HeaderWash />
    <div className="space-y-2">
      <div className="h-8 w-2/3 animate-pulse rounded-token bg-dawn-mist" />
      <div className="h-5 w-1/2 animate-pulse rounded-token bg-dawn-mist" />
    </div>
    <div className="h-28 animate-pulse rounded-token-lg bg-dawn-mist" />
    <div className="h-14 animate-pulse rounded-token bg-dawn-mist" />
  </main>
);

export default function HomePage() {
  const greetingWord = useGreetingWord();
  const state = useHomeData();
  const router = useRouter();

  // First-launch gate: a profile with no measured baseline hasn't been
  // through onboarding yet. Nothing else in the app currently redirects
  // here on its own — see HANDOFF.md.
  const needsOnboarding =
    state.status === "ready" && state.profile.baselineMptMeasuredAt === null;

  useEffect(() => {
    if (needsOnboarding) router.replace("/welcome");
  }, [needsOnboarding, router]);

  if (state.status === "loading" || needsOnboarding) {
    return LOADING_SHELL;
  }

  if (state.status === "error") {
    return (
      <main className="space-y-6 pb-10">
        <HeaderWash />
        <div className="space-y-3 text-center">
          <p className="text-body text-ink">Couldn&rsquo;t load your songs right now.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 flex min-h-tap items-center justify-center rounded-token bg-action px-6 py-3 text-body text-on-action"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  const { profile, songs, latest, previous } = state;
  const latestSong = latest ? songs.find((s) => s.id === latest.songId) : undefined;

  return (
    <main className="space-y-8 pb-24">
      {/* ---- atmosphere: a header wash, never behind text ---- */}
      <HeaderWash />

      <header className="space-y-1">
        <h1 className="display text-display-sm text-ink">
          {greetingWord}, {profile.name}
        </h1>
        <p className="text-body text-ink-muted">
          Ready to breathe with a song today?
        </p>
      </header>

      {/* ---- last session summary, or a first-time invitation ---- */}
      {latest ? (
        <section className="rounded-token-lg bg-surface p-6 shadow-soft">
          <div className="flex items-start justify-between gap-4">
            <p className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
              {latestSong ? latestSong.title : "Your last session"}
            </p>
            <Link
              href="/progress"
              className="flex min-h-tap items-center text-secondary text-ink-muted underline"
            >
              See your progress
            </Link>
          </div>
          <p className="numeral text-display-lg text-ink">{latest.breathScore}</p>
          <p className="mt-1 text-body text-ink-muted">{describeTake(latest, previous)}</p>
        </section>
      ) : (
        <section className="rounded-token-lg border border-rule bg-surface p-6">
          <p className="text-body text-ink-muted">
            You haven&rsquo;t sung yet — pick a song below to begin.
          </p>
        </section>
      )}

      {/* ---- primary action ---- */}
      {songs.length > 0 && (
        <Link
          href={`/sing/${songs[0].id}`}
          className="flex min-h-tap items-center justify-center rounded-token bg-action px-6 py-4 text-body font-medium text-on-action"
        >
          Start singing
        </Link>
      )}

      {/* ---- song list ---- */}
      <section className="space-y-4">
        <h2 className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
          Your songs
        </h2>
        {songs.length === 0 ? (
          <p className="text-body text-ink-muted">No songs available right now.</p>
        ) : (
          <ul className="space-y-3">
            {songs.map((song) => (
              <li key={song.id}>
                <Link
                  href={`/sing/${song.id}`}
                  className="block rounded-token-lg border border-rule bg-surface p-5"
                >
                  <p className="display text-display-sm text-ink">{song.title}</p>
                  <p className="text-secondary text-ink-muted">{song.artist}</p>
                  <p className="mt-2 text-secondary text-ink-muted">
                    longest hold: {formatHold(song.longestHoldSec)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        href="/spotify"
        className="flex min-h-tap items-center justify-center rounded-token border border-rule bg-surface px-6 py-4 text-body text-ink"
      >
        Sing from Spotify
      </Link>

      <BottomNav />
    </main>
  );
}
