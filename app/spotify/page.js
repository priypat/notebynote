'use client';

/**
 * Spotify starter — mounted at /spotify, NOT at / .
 *
 * The starter README says to drop this in as app/page.js, but that would
 * collide with the real Lung Tunes home page (Next would see two files
 * resolving the same route and refuse to build). Mounting it here keeps
 * both reachable so the integration can be evaluated side by side with the
 * existing app.
 *
 * Fixes over the original starter, all aimed at the "Play flips to Pause and
 * straight back to Play, with nothing in the UI to say why" symptom:
 *
 *  1. activateElement() before the first play. Browsers block audio that
 *     isn't tied to a user gesture. The SDK plays through a hidden element
 *     that has to be unlocked from inside a real click, and skipping it is
 *     the most common cause of "play call accepted, then paused".
 *  2. transferPlayback() to make the SDK device the *active* one. Registering
 *     a device is not the same as selecting it — without this, playback can
 *     be handed straight back to whatever device Spotify thinks is current.
 *  3. A Premium check via /me. The SDK will not stream on a free account and
 *     it fails by silently pausing rather than erroring, so this is checked
 *     up front and stated plainly.
 *  4. Every failure is surfaced in the UI. The original logged to console and
 *     swallowed promise rejections, so a broken play looked like a no-op.
 *  5. Stale-closure fix in the lyric sync (see startLyricSync).
 *  6. Guard against building a second Player on re-render.
 */

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import {
  redirectToSpotifyAuth,
  getStoredAccessToken,
  isTokenExpired,
  refreshAccessToken,
  fetchDemoToken,
  logout,
} from '@/lib/spotify/auth';
import {
  searchTracks,
  getArtist,
  getMe,
  transferPlayback,
  playTrack,
  pausePlayback,
  getLyrics,
  parseSyncedLyrics,
} from '@/lib/spotify/api';
import { lyricsToPhrases } from '@/lib/spotify/lyricsToPhrases';
import { MOCK_SONGS } from '@/lib/mock';

export default function Home() {
  const [token, setToken] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [artistInfo, setArtistInfo] = useState(null);
  const [lyricsLines, setLyricsLines] = useState([]);
  const [plainLyrics, setPlainLyrics] = useState(null);
  const [lyricsStatus, setLyricsStatus] = useState('idle');
  // The Phase 1 bridge's output for whatever track is selected — null while
  // loading, then either a real phrase map or null-because-no-usable-lyrics.
  const [phraseMap, setPhraseMap] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeLine, setActiveLine] = useState(-1);
  const [error, setError] = useState(null);
  const [me, setMe] = useState(null);
  // 'demo'   — server-minted, no login shown
  // 'stored' — from a previous interactive login on this browser
  const [authMode, setAuthMode] = useState(null);
  // Until the token attempt settles, show a neutral "connecting" state rather
  // than flashing the login button at everyone for a beat on every load.
  const [authReady, setAuthReady] = useState(false);

  const playerRef = useRef(null);
  const positionIntervalRef = useRef(null);
  // startLyricSync's interval closes over lyricsLines. Because it's kicked off
  // in the same tick as setLyricsLines, that closure captures the *previous*
  // (usually empty) array and the highlight never moves. A ref always reads
  // the current value.
  const lyricsLinesRef = useRef([]);
  useEffect(() => {
    lyricsLinesRef.current = lyricsLines;
  }, [lyricsLines]);

  // --- Get a token on mount, without a login step if at all possible ---
  //
  // Order matters: the server-side demo token comes first so a configured
  // demo never shows a login screen, even in a fresh browser or incognito.
  // Everything after it is fallback for when setup hasn't been run.
  useEffect(() => {
    let cancelled = false;

    async function acquire() {
      // 1. No-login path — server mints one from a stored refresh token.
      try {
        const demo = await fetchDemoToken();
        if (cancelled) return;
        if (demo) {
          setToken(demo.access_token);
          setAuthMode('demo');
          return;
        }
      } catch (e) {
        if (cancelled) return;
        setError(e.message); // configured but broken — worth saying out loud
      }

      // 2. A token from a previous interactive login, still valid.
      const existing = getStoredAccessToken();
      if (existing && !isTokenExpired()) {
        if (!cancelled) {
          setToken(existing);
          setAuthMode('stored');
        }
        return;
      }

      // 3. Expired, but we have a refresh token from that login.
      if (existing) {
        try {
          const data = await refreshAccessToken();
          if (!cancelled) {
            setToken(data.access_token);
            setAuthMode('stored');
          }
          return;
        } catch {
          /* fall through to the login button */
        }
      }

      // 4. Nothing worked — show the login button.
      if (!cancelled) setAuthReady(true);
    }

    acquire().finally(() => {
      if (!cancelled) setAuthReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Access tokens last an hour. Re-mint a minute early so a long demo never
  // dies mid-song.
  useEffect(() => {
    if (authMode !== 'demo') return;
    const id = setInterval(
      () => {
        fetchDemoToken()
          .then((d) => d && setToken(d.access_token))
          .catch(() => {});
      },
      50 * 60 * 1000,
    );
    return () => clearInterval(id);
  }, [authMode]);

  // --- Who is this, and are they Premium? ---
  useEffect(() => {
    if (!token) return;
    getMe(token)
      .then(setMe)
      .catch((e) => setError(`Couldn't read your Spotify profile: ${e.message}`));
  }, [token]);

  // --- Initialize Web Playback SDK once token + script are ready ---
  useEffect(() => {
    if (!token) return;

    function init() {
      if (playerRef.current) return; // never build a second player
      if (!window.Spotify) return;

      const player = new window.Spotify.Player({
        name: 'Lung Tunes Player',
        getOAuthToken: (cb) => cb(getStoredAccessToken()),
        volume: 0.6,
      });

      player.addListener('ready', ({ device_id }) => {
        setDeviceId(device_id);
        setPlayerReady(true);
      });

      player.addListener('not_ready', () => setPlayerReady(false));

      // These used to be console.error only, which is exactly why the failure
      // looked like nothing happening at all.
      player.addListener('initialization_error', ({ message }) =>
        setError(`Player failed to initialize: ${message}`),
      );
      player.addListener('authentication_error', ({ message }) =>
        setError(`Spotify rejected the token: ${message}. Try logging out and back in.`),
      );
      player.addListener('account_error', ({ message }) =>
        setError(
          `Account not eligible for playback: ${message}. The Web Playback SDK requires Spotify Premium.`,
        ),
      );
      player.addListener('playback_error', ({ message }) =>
        setError(`Playback error: ${message}`),
      );

      player.addListener('player_state_changed', (state) => {
        if (!state) return;
        setIsPlaying(!state.paused);
      });

      player.connect();
      playerRef.current = player;
    }

    window.onSpotifyWebPlaybackSDKReady = init;
    if (window.Spotify) init(); // script already loaded on a re-render

    return () => {
      playerRef.current?.disconnect();
      playerRef.current = null;
      clearInterval(positionIntervalRef.current);
    };
  }, [token]);

  // --- Search ---
  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setError(null);
    try {
      setResults(await searchTracks(query, token));
    } catch (err) {
      setError(`Search failed: ${err.message}`);
    }
  }

  /**
   * Everything that has to happen inside the click before audio can play.
   * activateElement in particular is only honoured during a real user
   * gesture — moving it into an effect or a timeout silently stops working.
   */
  async function unlockPlayback() {
    try {
      await playerRef.current?.activateElement?.();
    } catch {
      // Older SDK builds don't expose it; not fatal on desktop Chrome.
    }
    try {
      await transferPlayback(deviceId, token, false);
    } catch (err) {
      // Non-fatal: play?device_id can still work on its own.
      console.warn('Device transfer failed:', err.message);
    }
  }

  async function startTrack(track) {
    await unlockPlayback();
    await playTrack(track.uri, deviceId, token);
    startLyricSync();

    // The reported symptom is "Pause, then instantly Play again" — the call is
    // accepted and playback stops on its own. Catch that explicitly and name
    // the likeliest cause rather than leaving a silent toggle.
    setTimeout(async () => {
      const state = await playerRef.current?.getCurrentState();
      if (state && state.paused) {
        setError(
          me && me.product !== 'premium'
            ? `Playback stopped immediately — this account is "${me.product}", and the Web Playback SDK only streams on Premium.`
            : "Playback started then stopped on its own. Usual causes: the account isn't Premium, the track isn't available in your market, or another Spotify device took over playback.",
        );
      }
    }, 1500);
  }

  // --- Select + play a track ---
  async function handleSelectTrack(track) {
    setSelectedTrack(track);
    setArtistInfo(null);
    setPlainLyrics(null);
    setLyricsLines([]);
    setActiveLine(-1);
    setError(null);
    setLyricsStatus('loading');
    setPhraseMap(null);

    if (track.artists?.[0]?.id) {
      getArtist(track.artists[0].id, token).then(setArtistInfo).catch(() => {});
    }

    // getLyrics never rejects now, but keep a catch so a future change can't
    // reintroduce the unhandled rejection this used to produce.
    getLyrics(track.name, track.artists[0]?.name || '')
      .then((lyrics) => {
        if (!lyrics) return setLyricsStatus('none');
        if (lyrics.synced) {
          const parsed = parseSyncedLyrics(lyrics.synced);
          setLyricsLines(parsed);
          setLyricsStatus('synced');
          // The Phase 1 bridge: not every synced song sustains anything long
          // enough to coach breath on, so this can still come back null.
          setPhraseMap(lyricsToPhrases(parsed));
        } else if (lyrics.plain) {
          setPlainLyrics(lyrics.plain);
          setLyricsStatus('plain');
        } else {
          setLyricsStatus('none');
        }
      })
      .catch(() => setLyricsStatus('none'));

    if (!deviceId) {
      setError("Player isn't connected yet — give it a second, then press Play.");
      return;
    }
    try {
      await startTrack(track);
    } catch (err) {
      setError(`Couldn't start playback: ${err.message}`);
    }
  }

  async function handlePlayPause() {
    setError(null);
    if (!selectedTrack) return setError('Pick a track first.');
    if (!deviceId) return setError("Player isn't connected yet.");

    try {
      if (isPlaying) {
        await pausePlayback(deviceId, token);
        clearInterval(positionIntervalRef.current);
      } else {
        await startTrack(selectedTrack);
      }
    } catch (err) {
      setError(`Playback request failed: ${err.message}`);
    }
  }

  // Poll playback position to highlight the current lyric line.
  function startLyricSync() {
    clearInterval(positionIntervalRef.current);
    positionIntervalRef.current = setInterval(async () => {
      const state = await playerRef.current?.getCurrentState();
      if (!state) return;
      const seconds = state.position / 1000;
      const lines = lyricsLinesRef.current; // ref, not the captured array
      const idx = lines.findIndex(
        (line, i) =>
          seconds >= line.time && (i === lines.length - 1 || seconds < lines[i + 1].time),
      );
      setActiveLine(idx);
    }, 500);
  }

  // --- Render ---

  // Don't flash a login button while the silent token attempt is in flight —
  // in the configured case it resolves to a token and no login should ever
  // have been visible.
  if (!token && !authReady) {
    return (
      <main style={styles.centered}>
        <h1>🎤 Lung Tunes</h1>
        <p style={{ opacity: 0.7 }}>Connecting…</p>
      </main>
    );
  }

  if (!token) {
    return (
      <main style={styles.page}>
        <h1>🎤 Lung Tunes</h1>
        {error && <p style={styles.error}>{error}</p>}
        {/* Made for breath works with zero Spotify account — the curated
            songs already have a real, hand-authored phrase map and a fully
            working sing session behind them. Spotify is an upgrade on top
            of this, never the only way in. */}
        <CuratedShelf />
        <div style={{ ...styles.centered, height: 'auto', padding: '24px 0' }}>
          <p>Connect Spotify for more songs to search and sing.</p>
          <button style={styles.button} onClick={redirectToSpotifyAuth}>
            Log in with Spotify
          </button>
          <p style={{ fontSize: 13, opacity: 0.7, maxWidth: 380, textAlign: 'center' }}>
            Demoing? Run the <a href="/spotify/connect">one-time setup</a> once and
            this screen never appears again.
          </p>
        </div>
      </main>
    );
  }

  const premiumProblem = me && me.product !== 'premium';

  return (
    <>
      <Script src="https://sdk.scdn.co/spotify-player.js" strategy="afterInteractive" />
      <main style={styles.page}>
        <header style={styles.header}>
          <h1>🎤 Lung Tunes</h1>
          {/* Pointless in demo mode — the server would just hand back another
              token on the next load — and a stray "Log out" is exactly the
              kind of thing that derails a live demo. */}
          {authMode !== 'demo' && (
            <button
              style={styles.linkButton}
              onClick={() => {
                logout();
                setToken(null);
                setAuthMode(null);
              }}
            >
              Log out
            </button>
          )}
        </header>

        {/* Diagnostics — the original gave no way to tell which of playback's
            several preconditions was the one failing. */}
        <div style={styles.diag}>
          <span>
            account: <strong>{me ? me.product : '…'}</strong>
          </span>
          <span>
            player: <strong>{playerReady ? 'ready' : 'connecting…'}</strong>
          </span>
          <span>
            device: <strong>{deviceId ? 'yes' : 'none'}</strong>
          </span>
          <span>
            auth: <strong>{authMode === 'demo' ? 'no-login' : 'logged in'}</strong>
          </span>
        </div>

        {premiumProblem && (
          <p style={styles.warn}>
            This is a <strong>{me.product}</strong> account. Spotify&rsquo;s Web
            Playback SDK only streams on <strong>Premium</strong> — search and
            metadata will work, but audio will not.
          </p>
        )}

        {error && <p style={styles.error}>{error}</p>}

        <CuratedShelf />

        <h2 style={styles.shelfTitle}>Search Spotify</h2>
        <form onSubmit={handleSearch} style={styles.searchForm}>
          <input
            style={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a song…"
          />
          <button style={styles.button} type="submit">
            Search
          </button>
        </form>

        <ul style={styles.resultsList}>
          {results.map((track) => (
            <li
              key={track.id}
              style={styles.resultItem}
              onClick={() => handleSelectTrack(track)}
            >
              {track.album?.images?.[2] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={track.album.images[2].url} alt="" width={40} height={40} />
              )}
              <div>
                <strong>{track.name}</strong>
                <div style={{ fontSize: 13, opacity: 0.7 }}>
                  {track.artists.map((a) => a.name).join(', ')}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {selectedTrack && (
          <section style={styles.nowPlaying}>
            <div style={styles.nowPlayingHeader}>
              {selectedTrack.album?.images?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedTrack.album.images[0].url} alt="" width={100} height={100} />
              )}
              <div>
                <h2>{selectedTrack.name}</h2>
                <p>{selectedTrack.artists.map((a) => a.name).join(', ')}</p>
                {artistInfo?.genres?.length > 0 && (
                  <p style={{ fontSize: 13, opacity: 0.7 }}>{artistInfo.genres.join(', ')}</p>
                )}

                {/* The "breath fit" line — the one honest sentence the plan
                    asks for. Never blocks singing either way: Play works
                    regardless of what this says. */}
                {lyricsStatus === 'loading' ? (
                  <p style={styles.fitNeutral}>Checking this song&rsquo;s breath fit…</p>
                ) : phraseMap ? (
                  <p style={styles.fitGood}>
                    {phraseMap.phrases.length} long phrase{phraseMap.phrases.length === 1 ? '' : 's'},
                    about {phraseMap.longestHoldSec}s each — {phraseMap.difficulty}.
                  </p>
                ) : (
                  <p style={styles.fitNeutral}>
                    No synced breath map for this song yet — go ahead and sing it, it just won&rsquo;t
                    coach your held notes this time.
                  </p>
                )}

                <button style={styles.button} onClick={handlePlayPause} disabled={!playerReady}>
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
              </div>
            </div>

            <div style={styles.lyrics}>
              {lyricsLines.length > 0 ? (
                lyricsLines.map((line, i) => (
                  <p key={i} style={i === activeLine ? styles.activeLine : styles.line}>
                    {line.text || '♪'}
                  </p>
                ))
              ) : plainLyrics ? (
                <pre style={{ whiteSpace: 'pre-wrap' }}>{plainLyrics}</pre>
              ) : (
                <p style={{ opacity: 0.6 }}>
                  {lyricsStatus === 'loading'
                    ? 'Looking for lyrics…'
                    : "No lyrics on screen for this one — you know the words, so sing away."}
                </p>
              )}
            </div>
          </section>
        )}
      </main>
    </>
  );
}

/**
 * "Made for breath" — the curated songs, always available with no Spotify
 * account. Each already has a real, hand-authored phrase map and a fully
 * working sing session at /sing/[id]; nothing extra to wire here.
 */
function CuratedShelf() {
  return (
    <section>
      <h2 style={styles.shelfTitle}>Made for breath</h2>
      <div style={styles.shelfRow}>
        {MOCK_SONGS.map((song) => (
          <a key={song.id} href={`/sing/${song.id}`} style={styles.shelfCard}>
            <strong style={{ fontSize: 15 }}>{song.title}</strong>
            <span style={{ fontSize: 13, opacity: 0.7 }}>{song.artist}</span>
            <span style={{ fontSize: 13, opacity: 0.7 }}>
              longest hold {song.longestHoldSec}s · {song.difficulty}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

const styles = {
  page: { maxWidth: 640, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' },
  shelfTitle: { fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.6, margin: '20px 0 10px' },
  shelfRow: { display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 },
  shelfCard: {
    display: 'flex', flexDirection: 'column', gap: 2, minWidth: 160, flexShrink: 0,
    padding: 14, borderRadius: 10, textDecoration: 'none', color: 'inherit',
    background: 'linear-gradient(135deg, #fdba74, #bef264)',
  },
  fitGood: { fontSize: 13, color: '#166534', margin: '4px 0' },
  fitNeutral: { fontSize: 13, opacity: 0.65, margin: '4px 0' },
  centered: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', gap: 12 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  diag: { display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, opacity: 0.75, padding: '8px 0', borderBottom: '1px solid #eee' },
  warn: { background: '#fff4e5', border: '1px solid #ffcf99', borderRadius: 8, padding: 12, fontSize: 14 },
  error: { background: '#fdecea', border: '1px solid #f5b5ae', borderRadius: 8, padding: 12, fontSize: 14 },
  searchForm: { display: 'flex', gap: 8, margin: '16px 0' },
  input: { flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc' },
  button: { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#1DB954', color: '#fff', cursor: 'pointer' },
  linkButton: { background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' },
  resultsList: { listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  resultItem: { display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', padding: 8, borderRadius: 8 },
  nowPlaying: { marginTop: 32, borderTop: '1px solid #eee', paddingTop: 24 },
  nowPlayingHeader: { display: 'flex', gap: 16, marginBottom: 24 },
  lyrics: { maxHeight: 400, overflowY: 'auto', lineHeight: 1.8 },
  line: { opacity: 0.5, transition: 'opacity 0.2s' },
  activeLine: { opacity: 1, fontWeight: 700, color: '#1DB954' },
};
