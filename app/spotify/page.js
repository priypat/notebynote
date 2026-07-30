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
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeLine, setActiveLine] = useState(-1);
  const [error, setError] = useState(null);
  const [me, setMe] = useState(null);

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

  // --- Load token on mount ---
  useEffect(() => {
    const existing = getStoredAccessToken();
    if (existing && !isTokenExpired()) {
      setToken(existing);
    } else if (existing) {
      refreshAccessToken()
        .then((data) => setToken(data.access_token))
        .catch(() => setToken(null));
    }
  }, []);

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

    if (track.artists?.[0]?.id) {
      getArtist(track.artists[0].id, token).then(setArtistInfo).catch(() => {});
    }

    // getLyrics never rejects now, but keep a catch so a future change can't
    // reintroduce the unhandled rejection this used to produce.
    getLyrics(track.name, track.artists[0]?.name || '')
      .then((lyrics) => {
        if (!lyrics) return setLyricsStatus('none');
        if (lyrics.synced) {
          setLyricsLines(parseSyncedLyrics(lyrics.synced));
          setLyricsStatus('synced');
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

  if (!token) {
    return (
      <main style={styles.centered}>
        <h1>🎤 Lung Tunes</h1>
        <p>Connect Spotify to search for a song and start singing.</p>
        <button style={styles.button} onClick={redirectToSpotifyAuth}>
          Log in with Spotify
        </button>
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
          <button
            style={styles.linkButton}
            onClick={() => {
              logout();
              setToken(null);
            }}
          >
            Log out
          </button>
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
        </div>

        {premiumProblem && (
          <p style={styles.warn}>
            This is a <strong>{me.product}</strong> account. Spotify&rsquo;s Web
            Playback SDK only streams on <strong>Premium</strong> — search and
            metadata will work, but audio will not.
          </p>
        )}

        {error && <p style={styles.error}>{error}</p>}

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
                    : 'No lyrics found for this track.'}
                </p>
              )}
            </div>
          </section>
        )}
      </main>
    </>
  );
}

const styles = {
  page: { maxWidth: 640, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' },
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
