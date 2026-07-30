"use client";

/**
 * The single "Start singing" destination: search Spotify or pick a curated
 * "Made for breath" song, then a pause-before-you-start screen (matching
 * app/sing/[songId]/SingScreen.tsx's own not-started beat), then playback +
 * lyrics. Three steps in one component — "browse" | "ready" | "playing" —
 * because Spotify tracks have no Song/phrases record in lib/api for a real
 * /sing/[id] route to key off of; a curated tile still links straight to
 * that real route unchanged.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import {
  redirectToSpotifyAuth,
  getStoredAccessToken,
  isTokenExpired,
  refreshAccessToken,
  fetchDemoToken,
} from "@/lib/spotify/auth";
import {
  searchTracks,
  getArtist,
  getMe,
  transferPlayback,
  playTrack,
  pausePlayback,
  getLyrics,
  parseSyncedLyrics,
} from "@/lib/spotify/api";
import { lyricsToPhrases } from "@/lib/spotify/lyricsToPhrases";
import { MOCK_SONGS } from "@/lib/mock";
import { BottomNav } from "@/components/BottomNav";

type SyncedLine = { time: number; text: string };
type PhraseMap = ReturnType<typeof lyricsToPhrases>;
type LyricsStatus = "idle" | "loading" | "synced" | "plain" | "none" | "error";

// Minimal shapes for the Spotify Web API / SDK objects this screen touches —
// not the full API surface, just the fields actually read below.
type SpotifyImage = { url: string };
type SpotifyArtist = { id?: string; name: string };
type SpotifyTrack = {
  id: string;
  uri: string;
  name: string;
  artists: SpotifyArtist[];
  album?: { images?: SpotifyImage[] };
};
type SpotifyArtistInfo = { genres?: string[] };
type PlaybackState = { paused: boolean; position: number };
type WebPlaybackPlayer = {
  connect: () => void;
  disconnect: () => void;
  activateElement?: () => Promise<void>;
  getCurrentState: () => Promise<PlaybackState | null>;
  addListener: (
    event: string,
    cb: (payload: { device_id?: string; message?: string } | PlaybackState | null) => void,
  ) => void;
};

declare global {
  interface Window {
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume: number;
      }) => WebPlaybackPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

type Step = "browse" | "ready" | "playing";

export function SpotifyScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"demo" | "stored" | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [me, setMe] = useState<{ product: string } | null>(null);

  const [step, setStep] = useState<Step>("browse");
  const [query, setQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<SpotifyTrack | null>(null);
  const [artistInfo, setArtistInfo] = useState<SpotifyArtistInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lyricsLines, setLyricsLines] = useState<SyncedLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState<string | null>(null);
  const [lyricsStatus, setLyricsStatus] = useState<LyricsStatus>("idle");
  const [phraseMap, setPhraseMap] = useState<PhraseMap>(null);
  const [activeLine, setActiveLine] = useState(-1);

  const playerRef = useRef<WebPlaybackPlayer | null>(null);
  const positionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lyricsLinesRef = useRef<SyncedLine[]>([]);
  useEffect(() => {
    lyricsLinesRef.current = lyricsLines;
  }, [lyricsLines]);

  // --- Get a token without a login step if at all possible ---
  useEffect(() => {
    let cancelled = false;
    async function acquire() {
      try {
        const demo = await fetchDemoToken();
        if (cancelled) return;
        if (demo) {
          setToken(demo.access_token);
          setAuthMode("demo");
          return;
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
      const existing = getStoredAccessToken();
      if (existing && !isTokenExpired()) {
        if (!cancelled) {
          setToken(existing);
          setAuthMode("stored");
        }
        return;
      }
      if (existing) {
        try {
          const data = await refreshAccessToken();
          if (!cancelled) {
            setToken(data.access_token);
            setAuthMode("stored");
          }
        } catch {
          /* fall through to login button */
        }
      }
    }
    acquire().finally(() => {
      if (!cancelled) setAuthReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    getMe(token)
      .then(setMe)
      .catch((e) => setError(`Couldn't read your Spotify profile: ${e.message}`));
  }, [token]);

  // --- Web Playback SDK ---
  useEffect(() => {
    if (!token) return;

    function init() {
      if (playerRef.current) return;
      if (!window.Spotify) return;

      const player = new window.Spotify.Player({
        name: "Lung Tunes Player",
        getOAuthToken: (cb: (t: string) => void) => cb(getStoredAccessToken()!),
        volume: 0.6,
      });

      player.addListener("ready", (payload) => {
        const { device_id } = payload as { device_id: string };
        setDeviceId(device_id);
        setPlayerReady(true);
      });
      player.addListener("not_ready", () => setPlayerReady(false));
      player.addListener("initialization_error", (payload) => {
        const { message } = payload as { message: string };
        setError(`Player failed to initialize: ${message}`);
      });
      player.addListener("authentication_error", (payload) => {
        const { message } = payload as { message: string };
        setError(`Spotify rejected the token: ${message}.`);
      });
      player.addListener("account_error", (payload) => {
        const { message } = payload as { message: string };
        setError(`Account not eligible for playback: ${message}. Requires Spotify Premium.`);
      });
      player.addListener("playback_error", (payload) => {
        const { message } = payload as { message: string };
        setError(`Playback error: ${message}`);
      });
      player.addListener("player_state_changed", (payload) => {
        const state = payload as PlaybackState | null;
        if (!state) return;
        setIsPlaying(!state.paused);
      });

      player.connect();
      playerRef.current = player;
    }

    window.onSpotifyWebPlaybackSDKReady = init;
    if (window.Spotify) init();

    return () => {
      playerRef.current?.disconnect();
      playerRef.current = null;
      if (positionIntervalRef.current) clearInterval(positionIntervalRef.current);
    };
  }, [token]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || !token) return;
    setError(null);
    try {
      setResults(await searchTracks(query, token));
      setHasSearched(true);
    } catch (err) {
      setError(`Search failed: ${(err as Error).message}`);
    }
  }

  function clearSearch() {
    setQuery("");
    setHasSearched(false);
    setResults([]);
  }

  async function unlockPlayback() {
    try {
      await playerRef.current?.activateElement?.();
    } catch {
      /* older SDK builds don't expose it */
    }
    try {
      await transferPlayback(deviceId, token, false);
    } catch (err) {
      console.warn("Device transfer failed:", (err as Error).message);
    }
  }

  function startLyricSync() {
    if (positionIntervalRef.current) clearInterval(positionIntervalRef.current);
    positionIntervalRef.current = setInterval(async () => {
      const state = await playerRef.current?.getCurrentState();
      if (!state) return;
      const seconds = state.position / 1000;
      const lines = lyricsLinesRef.current;
      const idx = lines.findIndex(
        (line, i) =>
          seconds >= line.time && (i === lines.length - 1 || seconds < lines[i + 1].time),
      );
      setActiveLine(idx);
    }, 500);
  }

  async function startTrack(track: SpotifyTrack) {
    await unlockPlayback();
    await playTrack(track.uri, deviceId, token);
    startLyricSync();
    setTimeout(async () => {
      const state = await playerRef.current?.getCurrentState();
      if (state && state.paused) {
        setError(
          me && me.product !== "premium"
            ? `Playback stopped immediately — this account is "${me.product}", and playback requires Premium.`
            : "Playback started then stopped on its own. Usual causes: not Premium, the track isn't available in your market, or another device took over.",
        );
      }
    }, 1500);
  }

  /** Loads lyrics + derives the phrase map for whatever track is selected.
   *  Its own function so both the initial selection and the "Try again"
   *  button after a transient failure can call it identically. */
  async function loadLyricsFor(track: SpotifyTrack) {
    setLyricsStatus("loading");
    const raw = await getLyrics(track.name, track.artists[0]?.name || "");
    if (raw.status === "error") {
      setLyricsStatus("error");
      return;
    }
    if (raw.status === "not_found") {
      setLyricsStatus("none");
      return;
    }
    // lib/spotify/api.js is plain JS, so TS can't narrow the discriminated
    // union above past "not error, not not_found" on its own — the only
    // remaining case is status: 'ok', which does carry these fields.
    const result = raw as { status: "ok"; plain: string | null; synced: string | null };
    if (result.synced) {
      const parsed = parseSyncedLyrics(result.synced);
      setLyricsLines(parsed);
      setLyricsStatus("synced");
      setPhraseMap(lyricsToPhrases(parsed));
    } else if (result.plain) {
      setPlainLyrics(result.plain);
      setLyricsStatus("plain");
    } else {
      setLyricsStatus("none");
    }
  }

  /** Selecting a track never plays it — it moves to the "ready" pause
   *  screen so the person can take a breath before singing starts. */
  function handleSelectTrack(track: SpotifyTrack) {
    setSelectedTrack(track);
    setArtistInfo(null);
    setPlainLyrics(null);
    setLyricsLines([]);
    setActiveLine(-1);
    setError(null);
    setPhraseMap(null);
    setStep("ready");

    if (track.artists?.[0]?.id) {
      getArtist(track.artists[0].id, token).then(setArtistInfo).catch(() => {});
    }
    loadLyricsFor(track);
  }

  async function handleBeginSinging() {
    if (!selectedTrack) return;
    setError(null);
    if (!deviceId) {
      setError("Player isn't connected yet — give it a second, then try again.");
      return;
    }
    setStep("playing");
    try {
      await startTrack(selectedTrack);
    } catch (err) {
      setError(`Couldn't start playback: ${(err as Error).message}`);
    }
  }

  function handleBackToBrowse() {
    if (positionIntervalRef.current) clearInterval(positionIntervalRef.current);
    playerRef.current?.getCurrentState().then((state) => {
      if (state && !state.paused) void pausePlayback(deviceId, token);
    });
    setStep("browse");
    setSelectedTrack(null);
    setIsPlaying(false);
  }

  async function handlePlayPause() {
    setError(null);
    if (!selectedTrack) return setError("Pick a track first.");
    if (!deviceId) return setError("Player isn't connected yet.");
    try {
      if (isPlaying) {
        await pausePlayback(deviceId, token);
        if (positionIntervalRef.current) clearInterval(positionIntervalRef.current);
      } else {
        await startTrack(selectedTrack);
      }
    } catch (err) {
      setError(`Playback request failed: ${(err as Error).message}`);
    }
  }

  const premiumProblem = me && me.product !== "premium";

  const debugLine = (
    <p className="text-secondary text-ink-muted">
      player: {playerReady ? "ready" : "connecting…"} · device:{" "}
      {deviceId ? "yes" : "none"} · auth: {authMode === "demo" ? "no-login" : "logged in"}
    </p>
  );

  // ---- Step: ready — pause before singing starts (mirrors SingScreen's
  // own not-started beat) ----
  if (step === "ready" && selectedTrack) {
    return (
      <main className="flex h-[calc(100dvh-2.5rem)] min-h-[560px] flex-col">
        <header className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleBackToBrowse}
            aria-label="Back to search"
            className="flex min-h-tap min-w-tap items-center justify-center rounded-token text-display-sm text-ink-muted"
          >
            <span aria-hidden="true">&larr;</span>
          </button>
          <p className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
            Sing from Spotify
          </p>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          {selectedTrack.album?.images?.[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selectedTrack.album.images[0].url}
              alt=""
              width={120}
              height={120}
              className="rounded-token-lg"
            />
          )}
          <p className="display text-display-sm text-ink">{selectedTrack.name}</p>
          <p className="text-body text-ink-muted">
            {selectedTrack.artists.map((a) => a.name).join(", ")}
          </p>
          {artistInfo?.genres && artistInfo.genres.length > 0 && (
            <p className="text-secondary text-ink-muted">{artistInfo.genres.join(", ")}</p>
          )}

          {/* Breath fit — never blocks Begin singing either way. */}
          {lyricsStatus === "loading" && (
            <p className="text-secondary text-ink-muted">
              Checking this song&rsquo;s breath fit…
            </p>
          )}
          {lyricsStatus === "synced" && phraseMap && (
            <p className="text-secondary text-ink-muted">
              {phraseMap.phrases.length} long phrase{phraseMap.phrases.length === 1 ? "" : "s"},
              about {phraseMap.longestHoldSec}s each — {phraseMap.difficulty}.
            </p>
          )}
          {lyricsStatus === "synced" && !phraseMap && (
            <p className="text-secondary text-ink-muted">
              No synced breath map for this song yet — go ahead and sing it, it
              just won&rsquo;t coach your held notes this time.
            </p>
          )}
          {lyricsStatus === "none" && (
            <p className="text-secondary text-ink-muted">
              No lyrics on screen for this one — you know the words, so sing
              away.
            </p>
          )}
          {lyricsStatus === "error" && (
            <div className="flex items-center gap-2">
              <p className="text-secondary text-ink-muted">
                Couldn&rsquo;t load lyrics right now.
              </p>
              <button
                type="button"
                onClick={() => loadLyricsFor(selectedTrack)}
                className="text-secondary text-ink underline"
              >
                Try again
              </button>
            </div>
          )}

          {premiumProblem && (
            <p className="max-w-[24rem] text-secondary text-ink-muted">
              This is a <strong>{me!.product}</strong> account — Spotify
              playback requires <strong>Premium</strong>, so audio won&rsquo;t
              start, but you can still follow along.
            </p>
          )}
          {error && <p className="max-w-[24rem] text-secondary text-ink-muted">{error}</p>}

          <button
            type="button"
            onClick={handleBeginSinging}
            className="mt-4 flex min-h-tap items-center justify-center rounded-token bg-action px-8 py-4 text-body font-medium text-on-action"
          >
            Begin singing
          </button>
        </section>

        <Script src="https://sdk.scdn.co/spotify-player.js" strategy="afterInteractive" />
      </main>
    );
  }

  // ---- Step: playing — audio + lyrics ----
  if (step === "playing" && selectedTrack) {
    return (
      <main className="flex h-[calc(100dvh-2.5rem)] min-h-[560px] flex-col">
        <header className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleBackToBrowse}
            aria-label="Exit singing"
            className="flex min-h-tap min-w-tap items-center justify-center rounded-token text-display-sm text-ink-muted"
          >
            <span aria-hidden="true">&times;</span>
          </button>
          <p className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
            {selectedTrack.name}
          </p>
        </header>

        {error && (
          <p className="rounded-token-lg border border-rule bg-surface p-4 text-body text-ink">
            {error}
          </p>
        )}

        <section className="flex flex-1 flex-col gap-4 overflow-hidden py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-secondary text-ink-muted">
                {selectedTrack.artists.map((a) => a.name).join(", ")}
              </p>
            </div>
            <button
              type="button"
              onClick={handlePlayPause}
              disabled={!playerReady}
              className="flex min-h-tap shrink-0 items-center justify-center rounded-token bg-action px-6 py-3 text-body text-on-action disabled:opacity-50"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto border-t border-rule pt-4">
            {lyricsLines.length > 0 ? (
              lyricsLines.map((line, i) => (
                <p
                  key={i}
                  className={
                    i === activeLine
                      ? "text-body font-medium text-ink"
                      : "text-body text-ink-muted"
                  }
                >
                  {line.text || "♪"}
                </p>
              ))
            ) : plainLyrics ? (
              <pre className="whitespace-pre-wrap text-body text-ink-muted">{plainLyrics}</pre>
            ) : (
              <p className="text-body text-ink-muted">
                No lyrics on screen for this one — you know the words, so sing
                away.
              </p>
            )}
          </div>
        </section>

        <Script src="https://sdk.scdn.co/spotify-player.js" strategy="afterInteractive" />
      </main>
    );
  }

  // ---- Step: browse — search bar on top, curated tiles or results below ----
  return (
    <main className="space-y-6 pb-24">
      <header>
        <p className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
          Start singing
        </p>
      </header>

      <section className="space-y-2">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Spotify for a song…"
            disabled={!token}
            className="min-h-tap flex-1 rounded-token border border-rule bg-surface px-4 py-3 text-body text-ink disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!token}
            className="flex min-h-tap items-center justify-center rounded-token bg-action px-5 text-body text-on-action disabled:opacity-50"
          >
            Search
          </button>
        </form>
        {hasSearched && (
          <button
            type="button"
            onClick={clearSearch}
            className="text-secondary text-ink-muted underline"
          >
            Clear search
          </button>
        )}
      </section>

      {!token && !authReady && <p className="text-body text-ink-muted">Connecting…</p>}

      {!token && authReady && (
        <section className="space-y-4 rounded-token-lg border border-rule bg-surface p-6 text-center">
          <p className="text-body text-ink-muted">
            Connect Spotify to search for a song.
          </p>
          <button
            type="button"
            onClick={redirectToSpotifyAuth}
            className="flex min-h-tap w-full items-center justify-center rounded-token bg-action px-6 py-3 text-body text-on-action"
          >
            Log in with Spotify
          </button>
          <p className="text-secondary text-ink-muted">
            Demoing? Run the{" "}
            <Link href="/spotify/connect" className="underline">
              one-time setup
            </Link>{" "}
            once and this screen never appears again.
          </p>
        </section>
      )}

      {premiumProblem && (
        <p className="rounded-token-lg border border-rule bg-surface p-4 text-body text-ink">
          This is a <strong>{me!.product}</strong> account. Spotify&rsquo;s
          playback requires <strong>Premium</strong> — search and metadata
          still work, but audio will not.
        </p>
      )}

      {error && (
        <p className="rounded-token-lg border border-rule bg-surface p-4 text-body text-ink">
          {error}
        </p>
      )}

      {hasSearched ? (
        <section className="space-y-3">
          {results.length === 0 ? (
            <p className="text-body text-ink-muted">
              No results for &ldquo;{query}&rdquo; — try another search.
            </p>
          ) : (
            <ul className="space-y-2">
              {results.map((track) => (
                <li key={track.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectTrack(track)}
                    className="flex min-h-tap w-full items-center gap-3 rounded-token border border-rule bg-surface p-3 text-left"
                  >
                    {track.album?.images?.[2] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={track.album.images[2].url}
                        alt=""
                        width={40}
                        height={40}
                        className="rounded-token"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body text-ink">{track.name}</p>
                      <p className="truncate text-secondary text-ink-muted">
                        {track.artists.map((a) => a.name).join(", ")}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="space-y-3">
          <h2 className="text-secondary uppercase tracking-[0.14em] text-ink-muted">
            Made for breath
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {MOCK_SONGS.map((song) => (
              <Link
                key={song.id}
                href={`/sing/${song.id}`}
                className="rounded-token border border-rule bg-surface p-3"
              >
                <p className="break-words text-body leading-tight text-ink">
                  {song.title}
                </p>
                <p className="mt-1 break-words text-secondary text-ink-muted">
                  {song.artist}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {token && debugLine}

      <Script src="https://sdk.scdn.co/spotify-player.js" strategy="afterInteractive" />
      <BottomNav />
    </main>
  );
}
