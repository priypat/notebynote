'use client';

/**
 * One-time setup: authorize once, capture a refresh token, paste it into
 * .env.local. After that /spotify never shows a login again.
 *
 * This exists because Spotify has no way to issue a streaming-capable token
 * without a human approving it at least once. The trick isn't avoiding that
 * step — it's doing it now, off-camera, instead of during a demo.
 */

import { useEffect, useState } from 'react';
import { redirectToSpotifyAuth, getStoredRefreshToken } from '@/lib/spotify/auth';

export default function ConnectPage() {
  const [refreshToken, setRefreshToken] = useState(null);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRefreshToken(getStoredRefreshToken());
  }, []);

  function startSetup() {
    // Tells /callback to land back here and show the token, rather than
    // bouncing to the player as it does in normal use.
    sessionStorage.setItem('spotify_setup_mode', '1');
    redirectToSpotifyAuth();
  }

  async function copy() {
    await navigator.clipboard.writeText(`SPOTIFY_REFRESH_TOKEN=${refreshToken}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main style={s.page}>
      <h1>Spotify — one-time setup</h1>
      <p style={s.lead}>
        Do this once and the app stops asking anyone to log in. Spotify can&rsquo;t
        issue a token that streams audio without a person approving it at least
        once — so approve it here, now, and reuse it forever.
      </p>

      {!refreshToken ? (
        <>
          <ol style={s.list}>
            <li>Click below and approve access as your Premium account.</li>
            <li>You&rsquo;ll come back here with a refresh token to copy.</li>
            <li>Paste it into <code>.env.local</code> and restart the dev server.</li>
          </ol>
          <button style={s.button} onClick={startSetup}>
            Authorize once
          </button>
        </>
      ) : (
        <>
          <p style={s.ok}>
            Got it. Paste this line into <code>.env.local</code>, then restart
            the dev server.
          </p>

          <div style={s.tokenBox}>
            <code style={s.token}>
              SPOTIFY_REFRESH_TOKEN=
              {revealed ? refreshToken : '•'.repeat(40)}
            </code>
          </div>

          <div style={s.row}>
            <button style={s.button} onClick={copy}>
              {copied ? 'Copied' : 'Copy line'}
            </button>
            <button style={s.secondary} onClick={() => setRevealed((v) => !v)}>
              {revealed ? 'Hide' : 'Reveal'}
            </button>
          </div>

          <p style={s.warn}>
            <strong>Treat this like a password.</strong> It grants ongoing access
            to this Spotify account — profile and playback control — and it does
            not expire on its own. <code>.env.local</code> is gitignored, so it
            won&rsquo;t be committed. Don&rsquo;t paste it anywhere public. If it
            leaks, change your Spotify password to revoke it.
          </p>

          <p style={s.lead}>
            Then open <a href="/spotify">/spotify</a> — it should go straight to
            the player with no login.
          </p>
        </>
      )}
    </main>
  );
}

const s = {
  page: { maxWidth: 640, margin: '0 auto', padding: 24, fontFamily: 'sans-serif', lineHeight: 1.6 },
  lead: { fontSize: 15, opacity: 0.85 },
  list: { fontSize: 15, opacity: 0.85, paddingLeft: 20 },
  ok: { background: '#e8f5ec', border: '1px solid #a8d5b8', borderRadius: 8, padding: 12, fontSize: 14 },
  warn: { background: '#fff4e5', border: '1px solid #ffcf99', borderRadius: 8, padding: 12, fontSize: 14 },
  tokenBox: { background: '#f4f4f4', border: '1px solid #ddd', borderRadius: 8, padding: 12, overflowX: 'auto' },
  token: { fontSize: 13, wordBreak: 'break-all', whiteSpace: 'pre-wrap' },
  row: { display: 'flex', gap: 8, margin: '12px 0' },
  button: { padding: '10px 18px', borderRadius: 8, border: 'none', background: '#1DB954', color: '#fff', cursor: 'pointer', fontSize: 15 },
  secondary: { padding: '10px 18px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: 15 },
};
