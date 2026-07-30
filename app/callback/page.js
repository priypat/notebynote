'use client';

/**
 * Spotify OAuth landing route.
 *
 * Stays at /callback (not /spotify/callback) because that exact path is what's
 * registered as the redirect URI in the Spotify dashboard — Spotify matches it
 * literally, so moving it means re-registering.
 *
 * Adapted from the starter: on success it returns to /spotify rather than /,
 * since the starter UI lives there now.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { exchangeCodeForToken } from '@/lib/spotify/auth';

export default function CallbackPage() {
  const router = useRouter();
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const errParam = params.get('error');

    if (errParam) {
      setError(errParam);
      return;
    }

    if (!code) {
      setError('No authorization code found in callback URL.');
      return;
    }

    exchangeCodeForToken(code)
      .then(() => {
        // /spotify/connect sets this before sending the user off to Spotify:
        // it means "this login was to mint a refresh token", so land back
        // there to display it rather than dropping into the player.
        const setup = sessionStorage.getItem('spotify_setup_mode');
        sessionStorage.removeItem('spotify_setup_mode');
        router.push(setup ? '/spotify/connect' : '/spotify');
      })
      .catch((err) => setError(err.message));
  }, [router]);

  if (error) {
    return (
      <main style={{ padding: 40, fontFamily: 'sans-serif' }}>
        <h1>Login failed</h1>
        <p>{error}</p>
        <a href="/spotify">Go back</a>
      </main>
    );
  }

  return (
    <main style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <p>Logging you in…</p>
    </main>
  );
}
