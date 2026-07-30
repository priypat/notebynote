import Link from "next/link";
import { HOME_SONGS, PROFILE, TODAYS_SCORE, TODAYS_SCORE_READ } from "./homeDemoData";

// Time-of-day greeting — keep this route rendered per-request rather than
// frozen at build time.
export const dynamic = "force-dynamic";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatHold(sec: number): string {
  return Number.isInteger(sec) ? `${sec}s` : `${sec.toFixed(1)}s`;
}

export default function HomePage() {
  return (
    <main className="space-y-8 pb-10">
      {/* ---- atmosphere: a header wash, never behind text ---- */}
      <div
        className="h-28 rounded-token-lg"
        style={{ background: "var(--dawn)" }}
        aria-hidden="true"
      />

      <header className="space-y-1">
        <h1 className="display text-display-sm text-ink">
          {greeting()}, {PROFILE.name}
        </h1>
        <p className="text-body text-ink-muted">
          Ready to breathe with a song today?
        </p>
      </header>

      {/* ---- Breath Score summary ---- */}
      <section className="rounded-token-lg bg-surface p-6 shadow-soft">
        <p className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
          Today&rsquo;s Breath Score
        </p>
        <p className="numeral text-display-lg text-ink">{TODAYS_SCORE}</p>
        <p className="mt-1 text-body text-ink-muted">{TODAYS_SCORE_READ}</p>
      </section>

      {/* ---- primary action ---- */}
      <Link
        href="/sing/demo"
        className="flex min-h-tap items-center justify-center rounded-token bg-action px-6 py-4 text-body font-medium text-on-action"
      >
        Start singing
      </Link>

      {/* ---- song list ---- */}
      <section className="space-y-4">
        <h2 className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
          Your songs
        </h2>
        <ul className="space-y-3">
          {HOME_SONGS.map((song) => (
            <li
              key={song.id}
              className="rounded-token-lg border border-rule bg-surface p-5"
            >
              <p className="display text-display-sm text-ink">{song.title}</p>
              <p className="text-secondary text-ink-muted">{song.artist}</p>
              <p className="mt-2 text-secondary text-ink-muted">
                longest hold: {formatHold(song.longestHoldSec)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
