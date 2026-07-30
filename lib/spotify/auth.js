// lib/spotify/auth.js
// Handles the Authorization Code with PKCE flow — no client secret needed,
// safe to run entirely in the browser.
//
// Two ways in:
//   1. fetchDemoToken() — no login at all. Asks the server for an access
//      token minted from a stored refresh token. This is what the demo uses.
//   2. redirectToSpotifyAuth() — the normal interactive login. Still needed
//      once, to mint that refresh token in the first place (/spotify/connect),
//      and as a fallback when the server has none configured.
//
// Tokens live in localStorage rather than sessionStorage: sessionStorage is
// wiped per tab, so every new tab meant logging in again — the exact thing
// that made this feel like it had a login step.

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
const REDIRECT_URI = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:3000/callback';

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
].join(' ');

// --- PKCE helpers ---

function base64UrlEncode(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function generateCodeVerifier() {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

// --- Public API ---

/** Kick off login — redirects the browser to Spotify's consent screen. */
export async function redirectToSpotifyAuth() {
  const verifier = await generateCodeVerifier();
  sessionStorage.setItem('spotify_verifier', verifier);

  const challenge = await generateCodeChallenge(verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

/** Call this from your /callback page with the `code` query param. */
export async function exchangeCodeForToken(code) {
  const verifier = sessionStorage.getItem('spotify_verifier');
  if (!verifier) throw new Error('Missing PKCE verifier — did the user land on /callback directly?');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token exchange failed: ${errText}`);
  }

  const data = await res.json();
  storeTokens(data);
  return data;
}

/** Use the refresh token to get a new access token without a full re-login. */
export async function refreshAccessToken() {
  const refreshToken = sessionStorage.getItem('spotify_refresh_token');
  if (!refreshToken) throw new Error('No refresh token available');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) throw new Error('Token refresh failed');

  const data = await res.json();
  storeTokens(data);
  return data;
}

function storeTokens({ access_token, refresh_token, expires_in }) {
  localStorage.setItem('spotify_access_token', access_token);
  localStorage.setItem('spotify_token_expires_at', String(Date.now() + expires_in * 1000));
  if (refresh_token) localStorage.setItem('spotify_refresh_token', refresh_token);
}

export function getStoredAccessToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('spotify_access_token');
}

/**
 * The refresh token from the last interactive login. Only used by the
 * one-time setup screen, which shows it so it can be pasted into
 * .env.local — it is never sent anywhere by the app itself.
 */
export function getStoredRefreshToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('spotify_refresh_token');
}

export function isTokenExpired() {
  const expiresAt = localStorage.getItem('spotify_token_expires_at');
  if (!expiresAt) return true;
  return Date.now() > Number(expiresAt) - 60_000; // refresh 1 min early
}

/**
 * The no-login path. Returns { access_token, expires_in } if the server has
 * a refresh token configured, or null if it doesn't — in which case the
 * caller should fall back to the interactive login.
 *
 * "Not configured yet" comes back as a 200 with configured:false rather than
 * an error status, so an app that hasn't been set up doesn't log a red line
 * to the console on every load.
 */
export async function fetchDemoToken() {
  try {
    const res = await fetch('/api/spotify/token', { cache: 'no-store' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Demo token request failed (${res.status})`);
    }
    const data = await res.json();
    // 200 + configured:false — setup hasn't been run. Not a failure.
    if (data.configured === false) return null;
    // Mirror it into localStorage so getStoredAccessToken() — which the SDK's
    // getOAuthToken callback reads on every reconnect — stays correct.
    localStorage.setItem('spotify_access_token', data.access_token);
    localStorage.setItem(
      'spotify_token_expires_at',
      String(Date.now() + data.expires_in * 1000),
    );
    return data;
  } catch (err) {
    throw new Error(`Couldn't get a demo token: ${err.message}`);
  }
}

export function logout() {
  localStorage.removeItem('spotify_access_token');
  localStorage.removeItem('spotify_refresh_token');
  localStorage.removeItem('spotify_token_expires_at');
  sessionStorage.removeItem('spotify_verifier');
}
