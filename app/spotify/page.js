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
 * Otherwise unmodified from the starter apart from import paths.
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeLine, setActiveLine] = useState(-1);

  const playerRef = useRef(null);
  const positionIntervalRef = useRef(null);

  // --- Load token on mount ---
  useEffect(() => {
    const existing = getStoredAccessToken();
    if (existing && !isTokenExpired()) {
      setToken(existing);
    } else if (existing) {
      refreshAccessToken().then((data) => setToken(data.access_token)).catch(() => setToken(null));
    }
  }, []);

  // --- Initialize Web Playback SDK once token + script are ready ---
  useEffect(() => {
    if (!token) return;

    window.onSpotifyWebPlaybackSDKReady = () => {
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
      player.addListener('initialization_error', ({ message }) => console.error(message));
      player.addListener('authentication_error', ({ message }) => console.error(message));
      player.addListener('account_error', ({ message }) =>
        console.error('Account error — is this a Premium account?', message)
      );

      player.addListener('player_state_changed', (state) => {
        if (!state) return;
        setIsPlaying(!state.paused);
      });

      player.connect();
      playerRef.current = player;
    };

    // If the SDK script already loaded before this effect ran, kick it off manually.
    if (window.Spotify) window.onSpotifyWebPlaybackSDKReady();

    return () => {
      playerRef.current?.disconnect();
      clearInterval(positionIntervalRef.current);
    };
  }, [token]);

  // --- Search ---
  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    const tracks = await searchTracks(query, token);
    setResults(tracks);
  }

  // --- Select + play a track ---
  async function handleSelectTrack(track) {
    setSelectedTrack(track);
    setArtistInfo(null);
    setPlainLyrics(null);
    setLyricsLines([]);
    setActiveLine(-1);

    // Basic artist info
    if (track.artists?.[0]?.id) {
      getArtist(track.artists[0].id, token).then(setArtistInfo).catch(() => {});
    }

    // Lyrics (best-effort — not every track will have a match)
    getLyrics(track.name, track.artists[0]?.name || '').then((lyrics) => {
      if (!lyrics) return;
      if (lyrics.synced) setLyricsLines(parseSyncedLyrics(lyrics.synced));
      else if (lyrics.plain) setPlainLyrics(lyrics.plain);
    });

    if (deviceId) {
      await playTrack(track.uri, deviceId, token);
      startLyricSync();
    }
  }

  async function handlePlayPause() {
    if (!selectedTrack || !deviceId) return;
    if (isPlaying) {
      await pausePlayback(deviceId, token);
      clearInterval(positionIntervalRef.current);
    } else {
      await playTrack(selectedTrack.uri, deviceId, token);
      startLyricSync();
    }
  }

  // Poll playback position to highlight the current lyric line
  function startLyricSync() {
    clearInterval(positionIntervalRef.current);
    positionIntervalRef.current = setInterval(async () => {
      const state = await playerRef.current?.getCurrentState();
      if (!state) return;
      const seconds = state.position / 1000;
      const idx = lyricsLines.findIndex(
        (line, i) => seconds >= line.time && (i === lyricsLines.length - 1 || seconds < lyricsLines[i + 1].time)
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

  return (
    <>
      <Script src="https://sdk.scdn.co/spotify-player.js" strategy="afterInteractive" />
      <main style={styles.page}>
        <header style={styles.header}>
          <h1>🎤 Lung Tunes</h1>
          <button style={styles.linkButton} onClick={() => { logout(); setToken(null); }}>
            Log out
          </button>
        </header>

        {!playerReady && <p style={styles.notice}>Connecting player… (requires Spotify Premium)</p>}

        <form onSubmit={handleSearch} style={styles.searchForm}>
          <input
            style={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a song…"
          />
          <button style={styles.button} type="submit">Search</button>
        </form>

        <ul style={styles.resultsList}>
          {results.map((track) => (
            <li key={track.id} style={styles.resultItem} onClick={() => handleSelectTrack(track)}>
              {track.album?.images?.[2] && (
                <img src={track.album.images[2].url} alt="" width={40} height={40} />
              )}
              <div>
                <strong>{track.name}</strong>
                <div style={{ fontSize: 13, opacity: 0.7 }}>{track.artists.map((a) => a.name).join(', ')}</div>
              </div>
            </li>
          ))}
        </ul>

        {selectedTrack && (
          <section style={styles.nowPlaying}>
            <div style={styles.nowPlayingHeader}>
              {selectedTrack.album?.images?.[0] && (
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
                <p style={{ opacity: 0.6 }}>No lyrics found for this track.</p>
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
  notice: { fontSize: 13, opacity: 0.7 },
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
