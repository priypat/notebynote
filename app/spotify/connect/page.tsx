"use client";

/**
 * One-time setup: authorize once, capture a refresh token, paste it into
 * .env.local. After that /spotify never shows a login again.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { redirectToSpotifyAuth, getStoredRefreshToken } from "@/lib/spotify/auth";

export default function ConnectPage() {
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRefreshToken(getStoredRefreshToken());
  }, []);

  function startSetup() {
    sessionStorage.setItem("spotify_setup_mode", "1");
    redirectToSpotifyAuth();
  }

  async function copy() {
    await navigator.clipboard.writeText(`SPOTIFY_REFRESH_TOKEN=${refreshToken}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="space-y-6 pb-10">
      <header>
        <p className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
          Spotify setup
        </p>
        <h1 className="display text-display-sm text-ink">One-time setup</h1>
      </header>

      <p className="text-body text-ink-muted">
        Do this once and the app stops asking anyone to log in. Spotify
        can&rsquo;t issue a token that streams audio without a person
        approving it at least once — so approve it here, now, and reuse it
        forever.
      </p>

      {!refreshToken ? (
        <>
          <ol className="list-decimal space-y-2 pl-5 text-body text-ink-muted">
            <li>Click below and approve access as your Premium account.</li>
            <li>You&rsquo;ll come back here with a refresh token to copy.</li>
            <li>
              Paste it into <code>.env.local</code> and restart the dev server.
            </li>
          </ol>
          <button
            type="button"
            onClick={startSetup}
            className="flex min-h-tap items-center justify-center rounded-token bg-action px-6 py-3 text-body text-on-action"
          >
            Authorize once
          </button>
        </>
      ) : (
        <>
          <p className="rounded-token-lg border border-rule bg-surface p-4 text-body text-ink">
            Got it. Paste this line into <code>.env.local</code>, then restart
            the dev server.
          </p>

          <div className="overflow-x-auto rounded-token border border-rule bg-surface p-4">
            <code className="whitespace-pre-wrap break-all text-secondary text-ink">
              SPOTIFY_REFRESH_TOKEN={revealed ? refreshToken : "•".repeat(40)}
            </code>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={copy}
              className="flex min-h-tap items-center justify-center rounded-token bg-action px-5 py-3 text-body text-on-action"
            >
              {copied ? "Copied" : "Copy line"}
            </button>
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="flex min-h-tap items-center justify-center rounded-token border border-rule bg-surface px-5 py-3 text-body text-ink"
            >
              {revealed ? "Hide" : "Reveal"}
            </button>
          </div>

          <p className="rounded-token-lg border border-rule bg-surface p-4 text-body text-ink-muted">
            <strong className="text-ink">Treat this like a password.</strong>{" "}
            It grants ongoing access to this Spotify account — profile and
            playback control — and it does not expire on its own.{" "}
            <code>.env.local</code> is gitignored, so it won&rsquo;t be
            committed. Don&rsquo;t paste it anywhere public. If it leaks,
            change your Spotify password to revoke it.
          </p>

          <p className="text-body text-ink-muted">
            Then open{" "}
            <Link href="/spotify" className="underline">
              /spotify
            </Link>{" "}
            — it should go straight to the player with no login.
          </p>
        </>
      )}
    </main>
  );
}
